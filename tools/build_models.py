# ============================================================
#  甲骨奇谭 · 3D 博物馆 / 模型生成（Blender 4.5 无头运行）
#  ------------------------------------------------------------
#  用法：
#    "D:/DSH-tools/Blender4.5/.../blender.exe" -b --factory-startup \
#        --python tools/build_models.py
#
#  产出（GLB，无外部贴图，材质走 baseColorFactor）：
#    assets/models/oracle-bone.glb      核心甲骨（艺术化复原，非出土扫描）
#    assets/models/turtle-plastron.glb  龟甲（艺术化复原）
#    assets/models/pedestal.glb         展台
#    assets/models/display-case.glb     展柜（框 + 玻璃）
#    assets/models/entrance-arch.glb    展厅入口门廊
#
#  说明：模型只做"形"与"材质分区"，刻辞由网页端按真实甲骨字形数据画贴图。
#  所有尺寸以米为单位，正面朝 +Z，底面落在 z=0（Blender 的 Z 轴向上），
#  由 glTF 导出器转成 Y 轴向上。
# ============================================================
import bpy, bmesh, math, random, os
from mathutils import Vector, Matrix, noise

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'assets', 'models')
os.makedirs(OUT, exist_ok=True)


# ---------------- 基础工具 ----------------

def wipe():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for b in list(block):
            try:
                block.remove(b)
            except Exception:
                pass


def mat(name, color, rough=0.8, metal=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    return m


def mesh_from_bm(bm, name, materials, side_mat_index=None, thick_axis='z'):
    """thick_axis 指明"厚度方向"是哪一根轴：法线基本平行于它的面算正/反面（用
    第一套材质），其余算侧壁（用第二套）。骨版是建在 XY 再转到竖直的，厚度方向
    会从 z 变成 y，所以这个轴必须显式传，不能写死。"""
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for m in materials:
        me.materials.append(m)
    if side_mat_index is not None:
        me.calc_loop_triangles()
        ai = {'x': 0, 'y': 1, 'z': 2}[thick_axis]
        for poly in me.polygons:
            poly.material_index = 0 if abs(poly.normal[ai]) > 0.55 else 1
    return ob


def planar_uv(ob, margin=0.0, axes=('x', 'y')):
    """平面投影 UV：把骨版正面的 xy 铺满 0..1，正反两面共用。
    侧壁会拉长，但侧壁用的是另一套材质（没有刻辞），无所谓。"""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active.data
    ai = 0 if axes[0] == 'x' else 2
    bi = 0 if axes[1] == 'x' else (1 if axes[1] == 'y' else 2)
    xs = [v.co[ai] for v in me.vertices]
    ys = [v.co[bi] for v in me.vertices]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    sx = (maxx - minx) or 1.0
    sy = (maxy - miny) or 1.0
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (co[ai] - minx) / sx
            v = (co[bi] - miny) / sy
            uv[li].uv = (u * (1 - 2 * margin) + margin, v * (1 - 2 * margin) + margin)


def shade_smooth(ob, angle=math.radians(38)):
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    # 4.5 用 modifier 或自定义法线；直接全部平滑 + 自动光滑角
    try:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.shade_smooth_by_angle(angle=angle)
    except Exception:
        pass


def export(objs, filename):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
    )
    print('EXPORTED', path, os.path.getsize(path))
    return path


# ---------------- 骨版轮廓 ----------------

def slab_outline(w, h, n=72, seed=7, taper=0.17, p=2.35):
    """超椭圆轮廓 + 高低频扰动 + 上宽下窄。真骨片没有直角，也没有对称。"""
    rnd = random.Random(seed)
    pts = []
    for i in range(n):
        a = (i / n) * math.pi * 2
        nx, ny = math.cos(a), math.sin(a)
        x = math.copysign(abs(nx) ** (2.0 / p), nx)
        y = math.copysign(abs(ny) ** (2.0 / p), ny)
        k = 1 + (rnd.random() - 0.5) * 0.075 + (0.075 * (rnd.random() - 0.5)
                                                if rnd.random() > 0.86 else 0)
        tp = 1 + taper * y
        pts.append((x * w * 0.5 * k * tp, y * h * 0.5 * k))
    return pts


def build_bone(name='OracleBone', w=1.0, h=1.58, t=0.085, seed=7):
    """骨版（牛肩胛骨/龟腹甲那类"片状骨料"）。
    轮廓：p-范数的圆角矩形（p=7 → 边基本是直的、角是圆的），再加低频崩口和
    一处明显的残断；不是超椭圆那种"鸭蛋"。骨料本来就该有直边，这是它和石头的
    区别。
    厚度：中间最厚、靠边收薄，正反两面各留一点起伏（不夸张，否则远看像鼓皮）。
    刻辞不在这里做，网页端按真实甲骨字形画贴图铺到正反面。"""
    rnd = random.Random(seed)
    seg, rings = 108, 26
    ax, ay = w * 0.5, h * 0.5
    P = 7.0

    # 每个角度一个偏移量，先随机构造再做几轮平滑 → 崩口是"成块的"，不是满身锯齿
    waff = [rnd.random() for _ in range(seg)]
    for _ in range(4):
        waff = [(waff[i - 1] + waff[i] * 2 + waff[(i + 1) % seg]) / 4 for i in range(seg)]
    low = [(v - 0.5) for v in waff]                     # -0.5 … 0.5

    def rim_r(a):
        c, s = math.cos(a), math.sin(a)
        # 圆角矩形半径
        r = 1.0 / (abs(c / ax) ** P + abs(s / ay) ** P) ** (1.0 / P)
        i = int(((a % (math.pi * 2)) / (math.pi * 2)) * seg) % seg
        r *= 1 + low[i] * 0.045                          # 崩口：±4.5%
        # 左上角缺一块（真骨片常见的残断），角度在 135°±18°
        d = abs(((a - math.radians(138) + math.pi) % (math.pi * 2)) - math.pi)
        if d < math.radians(20):
            r *= 1 - 0.085 * math.cos(d / math.radians(20) * math.pi * 0.5) ** 2
        # 上宽下窄（肩胛骨的柄部）
        r *= 1 + 0.045 * s
        return r

    bm = bmesh.new()
    top, bot = [], []
    # 从 rr=1/rings 起，不建 rr=0 那一圈（108 个点会全塌到圆心，生出零面积面）
    for ri in range(1, rings + 1):
        rr = ri / rings
        wgt = rr ** 2.2                                  # 起伏只在靠外圈才明显
        rt, rb = [], []
        for si in range(seg):
            a = (si / seg) * math.pi * 2
            base = rim_r(a)
            # 内圈按 base 等比缩，边因此是"直"的；只在外圈叠崩口
            r = base * rr
            x = math.cos(a) * r
            y = math.sin(a) * r
            # 厚度：中间厚、边缘收薄
            th = (t * 0.5) * (1 - 0.45 * rr ** 4)
            # 骨面整体极缓的起伏。
            # 只用低频：高频位移会按顶点抖法线，近看是一层"鸡皮疙瘩"，
            # 细碎的质感交给网页端那张骨面贴图，几何只负责大的形。
            und = 0.007 * noise.noise(Vector((x * 3.4, y * 3.4, seed * 0.7)))
            und += 0.0022 * noise.noise(Vector((x * 6.5, y * 6.5, seed * 1.9))) * wgt
            # 沿长轴的一点弓背（真骨片不是玻璃板）
            bow = 0.012 * (1 - (y / ay) ** 2)
            rt.append(bm.verts.new((x, y, th + und + bow)))
            rb.append(bm.verts.new((x, y, -th + und - bow)))
        top.append(rt)
        bot.append(rb)

    n = len(top)                      # = rings
    # 正反两面
    for ri in range(n - 1):
        for si in range(seg):
            s2 = (si + 1) % seg
            bm.faces.new((top[ri][si], top[ri][s2], top[ri + 1][s2], top[ri + 1][si]))
            bm.faces.new((bot[ri][si], bot[ri + 1][si], bot[ri + 1][s2], bot[ri][s2]))
    # 圆心：内圈（top[0]）收到一个点，收口用三角扇
    ct = bm.verts.new((0, 0, t * 0.5 + 0.012))
    cb = bm.verts.new((0, 0, -t * 0.5 - 0.012))
    for si in range(seg):
        s2 = (si + 1) % seg
        bm.faces.new((top[0][si], top[0][s2], ct))
        bm.faces.new((bot[0][s2], bot[0][si], cb))
    # 侧壁（骨片的"厚"）：外圈正反两圈之间连一圈四边形。
    # 没有这一圈，骨片就是两张纸对扣，转到侧面能直接看穿。
    rim = []
    for si in range(seg):
        s2 = (si + 1) % seg
        rim.append(bm.faces.new(
            (top[n - 1][si], bot[n - 1][si], bot[n - 1][s2], top[n - 1][s2])))
    bm.normal_update()

    # 立起来：轮廓画在 XY，转到 XZ，导出后骨片是竖直的（厚度方向 → Y）
    bmesh.ops.rotate(bm, verts=list(bm.verts), cent=(0, 0, 0),
                     matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

    mat_bone = mat('Bone', (0.74, 0.68, 0.55), rough=0.80, metal=0.0)
    mat_side = mat('BoneSide', (0.60, 0.54, 0.44), rough=0.86, metal=0.0)
    ob = mesh_from_bm(bm, name, [mat_bone, mat_side], side_mat_index=1,
                      thick_axis='y')
    planar_uv(ob, axes=('x', 'z'))
    shade_smooth(ob)
    return ob


def build_plastron(name='TurtlePlastron', r=0.62, height=0.20, seed=11):
    """龟甲：椭圆穹面 + 扇贝形边缘 + 中央浅凹。
    这是艺术化复原（按龟腹甲的一般形态），不是某一件出土龟甲的扫描。"""
    seg, rings = 96, 26
    bm = bmesh.new()
    centre_top = bm.verts.new((0, 0, height))
    grid = []
    for ri in range(1, rings + 1):
        rr = ri / rings
        row = []
        for si in range(seg):
            a = (si / seg) * math.pi * 2
            # 边缘扇贝：龟甲外缘不是正圆
            scallop = 1 + 0.035 * math.cos(6 * a) + 0.012 * math.cos(12 * a)
            rad = r * rr * scallop
            # 穹面：中间隆起，靠边缓收
            z = height * math.cos(rr * math.pi * 0.5) ** 1.35
            # 中央浅凹（腹甲中部本来就平缓）
            z -= 0.022 * math.exp(-(rr * 2.4) ** 2)
            # 极轻的不对称
            z += 0.006 * noise.noise(Vector((math.cos(a) * 2.2, math.sin(a) * 2.2, seed)))
            row.append(bm.verts.new((math.cos(a) * rad, math.sin(a) * rad * 0.82, z)))
        grid.append(row)

    for si in range(seg):
        s2 = (si + 1) % seg
        bm.faces.new((centre_top, grid[0][si], grid[0][s2]))
    for ri in range(rings - 1):
        for si in range(seg):
            s2 = (si + 1) % seg
            bm.faces.new((grid[ri][si], grid[ri + 1][si], grid[ri + 1][s2], grid[ri][s2]))

    # 底面：把最外圈往下拉出厚度，再封口
    rim = grid[-1]
    under = []
    for v in rim:
        nv = bm.verts.new((v.co.x * 0.985, v.co.y * 0.985, v.co.z - 0.055))
        under.append(nv)
    for si in range(seg):
        s2 = (si + 1) % seg
        bm.faces.new((rim[si], rim[s2], under[s2], under[si]))
    bm.faces.new(list(reversed(under)))

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

    mat_shell = mat('Plastron', (0.74, 0.67, 0.54), rough=0.72, metal=0.03)
    mat_side = mat('PlastronRim', (0.52, 0.45, 0.35), rough=0.85, metal=0.02)
    ob = mesh_from_bm(bm, name, [mat_shell, mat_side], side_mat_index=1)
    planar_uv(ob)
    shade_smooth(ob)
    return ob


def build_pedestal(name='Pedestal'):
    """展台：三段收分的圆台 + 上下线脚。规则物件，程序化即可。
    bmesh 的 spin 只吃"边"，所以这里直接按剖面环一圈圈拉四边形。"""
    profile = [
        (0.00, 0.00), (0.46, 0.00), (0.46, 0.06), (0.40, 0.10),
        (0.34, 0.16), (0.33, 0.92), (0.38, 0.98), (0.44, 1.03),
        (0.44, 1.12), (0.00, 1.12),
    ]
    seg = 48
    bm = bmesh.new()
    rings = []
    for (rad, z) in profile:
        row = []
        for i in range(seg):
            a = (i / seg) * math.pi * 2
            row.append(bm.verts.new((math.cos(a) * rad, math.sin(a) * rad, z)))
        rings.append(row)
    for ri in range(len(rings) - 1):
        for i in range(seg):
            j = (i + 1) % seg
            a, b, c, d = rings[ri][i], rings[ri][j], rings[ri + 1][j], rings[ri + 1][i]
            vs = [v for v in (a, b, c, d)]
            # 半径 0 的极点会退化成三角形
            uniq = []
            for v in vs:
                if v not in uniq:
                    uniq.append(v)
            if len(uniq) >= 3:
                try:
                    bm.faces.new(uniq)
                except ValueError:
                    pass
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    m = mat('PedestalStone', (0.30, 0.26, 0.21), rough=0.55, metal=0.25)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(m)
    shade_smooth(ob, math.radians(30))
    return ob


def build_case(name='DisplayCase'):
    """展柜：黄铜框 + 玻璃罩。玻璃单独一个物体，导出去是 BLEND 材质。"""
    frame = mat('Brass', (0.42, 0.30, 0.13), rough=0.32, metal=0.85)
    glass = mat('Glass', (0.55, 0.62, 0.62), rough=0.06, metal=0.0, alpha=0.13)

    W, D, H = 1.10, 0.80, 1.30
    bm = bmesh.new()
    # 底座
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= W * 1.06
        v.co.y *= D * 1.06
        v.co.z = v.co.z * 0.10 + 0.05
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges], offset=0.012, segments=2, affect='EDGES')
    me = bpy.data.meshes.new(name + '_Base')
    bm.to_mesh(me)
    bm.free()
    base = bpy.data.objects.new(name + '_Base', me)
    bpy.context.collection.objects.link(base)
    me.materials.append(frame)

    # 四根铜柱
    posts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            b2 = bmesh.new()
            bmesh.ops.create_cone(b2, cap_ends=True, segments=8, radius1=0.022,
                                  radius2=0.022, depth=H)
            for v in b2.verts:
                v.co.x += sx * (W / 2)
                v.co.y += sy * (D / 2)
                v.co.z += H / 2 + 0.10
            me2 = bpy.data.meshes.new(name + '_Post')
            b2.to_mesh(me2)
            b2.free()
            po = bpy.data.objects.new(name + '_Post', me2)
            bpy.context.collection.objects.link(po)
            me2.materials.append(frame)
            posts.append(po)

    # 玻璃罩
    b3 = bmesh.new()
    bmesh.ops.create_cube(b3, size=1.0)
    for v in b3.verts:
        v.co.x *= W * 0.98
        v.co.y *= D * 0.98
        v.co.z = v.co.z * H + H / 2 + 0.10
    meg = bpy.data.meshes.new(name + '_Glass')
    b3.to_mesh(meg)
    b3.free()
    gob = bpy.data.objects.new(name + '_Glass', meg)
    bpy.context.collection.objects.link(gob)
    meg.materials.append(glass)

    # 顶盖
    b4 = bmesh.new()
    bmesh.ops.create_cube(b4, size=1.0)
    for v in b4.verts:
        v.co.x *= W * 1.06
        v.co.y *= D * 1.06
        v.co.z = v.co.z * 0.08 + H + 0.10
    met = bpy.data.meshes.new(name + '_Top')
    b4.to_mesh(met)
    b4.free()
    top = bpy.data.objects.new(name + '_Top', met)
    bpy.context.collection.objects.link(top)
    met.materials.append(frame)

    return [base] + posts + [gob, top]


def build_arch(name='EntranceArch'):
    """展厅门廊：两柱一楣 + 上部一道额枋。模数化，可反复复制做隔断。"""
    stone = mat('ArchStone', (0.26, 0.21, 0.16), rough=0.62, metal=0.18)
    W, H, D = 4.4, 4.6, 0.9
    objs = []
    bm = bmesh.new()
    for sx in (-1, 1):
        bmesh.ops.create_cube(bm, size=1.0)
    bm.free()

    def box(w, h, d, x, y, z, bevel=0.02):
        b = bmesh.new()
        bmesh.ops.create_cube(b, size=1.0)
        for v in b.verts:
            v.co.x *= w
            v.co.y *= d
            v.co.z *= h
            v.co.x += x
            v.co.y += y
            v.co.z += z
        if bevel:
            bmesh.ops.bevel(b, geom=[e for e in b.edges], offset=bevel,
                            segments=2, affect='EDGES')
        me = bpy.data.meshes.new(name + '_part')
        b.to_mesh(me)
        b.free()
        o = bpy.data.objects.new(name + '_part', me)
        bpy.context.collection.objects.link(o)
        me.materials.append(stone)
        objs.append(o)
    # 两根柱（带柱础）
    for sx in (-1, 1):
        box(0.44, H, 0.62, sx * (W / 2 - 0.22), 0, H / 2, 0.015)
        box(0.66, 0.20, 0.80, sx * (W / 2 - 0.22), 0, 0.10, 0.02)
    # 门楣 + 额枋
    box(W, 0.42, 0.72, 0, 0, H + 0.21, 0.015)
    box(W * 1.10, 0.16, 0.86, 0, 0, H + 0.54, 0.015)
    return objs


# ---------------- 源场景 ----------------

def save_source():
    """把五个模型并排摆进一个 .blend 存下来。
    GLB 是给网页的导出物；.blend 是给"以后要改"的人留的源文件 ——
    打开就能看到每个件的网格、材质分区、UV，改完重跑本脚本再导出。
    （不保存 .blend 也能重建：脚本本身就是源。但这一个更方便直接改、直接看。）"""
    wipe()
    allobs = []
    for maker, x in ((build_bone, -6.0), (build_plastron, -3.0),
                     (build_pedestal, 0.0), (build_case, 3.2), (build_arch, 7.0)):
        objs = maker()
        if not isinstance(objs, list):
            objs = [objs]
        for o in objs:
            o.location.x += x
        allobs.extend(objs)
    path = os.path.join(os.path.dirname(OUT), '..', 'blender', 'models-source.blend')
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)
    print('SAVED', path, os.path.getsize(path))


# ---------------- 逐个生成 ----------------

def run():
    wipe()
    bone = build_bone()
    export([bone], 'oracle-bone.glb')

    wipe()
    pl = build_plastron()
    export([pl], 'turtle-plastron.glb')

    wipe()
    ped = build_pedestal()
    export([ped], 'pedestal.glb')

    wipe()
    case = build_case()
    export(case, 'display-case.glb')

    wipe()
    arch = build_arch()
    export(arch, 'entrance-arch.glb')

    save_source()
    print('ALL DONE')


run()
