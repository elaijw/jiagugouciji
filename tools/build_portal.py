# ============================================================
#  甲骨奇谭 · 分区门套（Blender 4.5 无头运行）
#  ------------------------------------------------------------
#  用法：
#    "D:/DSH-tools/Blender4.5/Blender Foundation/Blender 4.5/blender.exe" \
#        -b --factory-startup --python tools/build_portal.py
#
#  产出：assets/models/portal.glb
#
#  为什么单独做一件事：
#    大厅里六道门原来就是三块 Box（两根门垛 + 一根门楣 + 一块门槛），
#    立在墙上像六个洞口，没有"门"的形制。中式门面读的是层次 ——
#    门套退台、柱身收分、柱头有斗、楣上有檐。这些用 Box 硬拼也能做，
#    但线脚和倒角要一层层对齐，交给 Blender 的 bevel 一并做掉更省事。
#
#  尺寸与前端对齐（museum3d.js 的 PW/PH/PD）：
#    门洞宽 4.5 · 高 5.4 · 墙厚 0.62。模型原点在门洞中心的地面上，
#    正面朝 -Y（观众从 -Y 方向看门），Z 向上；导出为 glTF 时自动转 Y-up。
# ============================================================
import bpy, bmesh, math, os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'assets', 'models')
os.makedirs(OUT, exist_ok=True)

PW, PH, PD = 4.5, 5.4, 0.62


def wipe():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # 不碰 bpy.data.materials：模块级已经建好了三份材质，
    # 在 wipe 里按 users==0 清理会把它们一起删掉，
    # 后面每个 box 往网格上挂材质就会报 StructRNA has been removed。
    for block in (bpy.data.meshes, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def mat(name, color, rough=0.8, metal=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return m


STONE = mat('PortalStone', (0.215, 0.170, 0.128), rough=0.68, metal=0.12)
STONE_D = mat('PortalStoneDark', (0.145, 0.113, 0.084), rough=0.74, metal=0.10)
BRONZE = mat('PortalBronze', (0.470, 0.352, 0.180), rough=0.38, metal=0.85)


def box(name, w, h, d, x, y, z, bevel=0.012, seg=2, m=STONE, taper=0.0):
    """一个带倒角的方块。taper>0 时上下面按比例收（柱身收分用）。"""
    b = bmesh.new()
    bmesh.ops.create_cube(b, size=1.0)
    for v in b.verts:
        v.co.x *= w
        v.co.y *= d
        v.co.z *= h
    if taper:
        for v in b.verts:
            if v.co.z > 0:
                k = 1.0 - taper
                v.co.x *= k
                v.co.y *= k
    if bevel:
        bmesh.ops.bevel(b, geom=[e for e in b.edges], offset=bevel,
                        segments=seg, affect='EDGES')
    for v in b.verts:
        v.co.x += x
        v.co.y += y
        v.co.z += z
    me = bpy.data.meshes.new(name)
    b.to_mesh(me)
    b.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(m)
    return ob


def build_portal():
    """一套门：三层退台门套 + 收分门柱 + 斗 + 月梁门楣 + 挑檐 + 门枕石。"""
    objs = []

    # ---- 1. 门套：三层退台 ----------------------------------------
    # 一层比一层小、一层比一层薄地往外退，光打上去才有三道明暗台阶。
    # 这是"门"跟"洞"的区别所在。
    tiers = [
        (PW + 1.55, PH + 1.05, PD + 0.44, 0.030, STONE_D),
        (PW + 1.02, PH + 0.70, PD + 0.28, 0.026, STONE),
        (PW + 0.60, PH + 0.42, PD + 0.14, 0.022, STONE),
    ]
    for i, (w, h, d, bv, m) in enumerate(tiers):
        # 下面这一坨是整个门套的"墙"，中间挖洞 —— 用四个 box 围出门洞，
        # 比布尔运算稳（无头建模里布尔很容易出非流形）。
        side_w = (w - PW) / 2.0
        for sx in (-1, 1):
            objs.append(box('tier%d_side%d' % (i, sx),
                            side_w, h, d,
                            sx * (PW / 2 + side_w / 2), 0, h / 2, bv, 2, m))
        top_h = h - PH
        if top_h > 0.02:
            objs.append(box('tier%d_top' % i, PW, top_h, d, 0, 0, PH + top_h / 2, bv, 2, m))

    # ---- 2. 门柱：收分 + 柱头斗 -----------------------------------
    col_w, col_d = 0.50, PD + 0.34
    for sx in (-1, 1):
        x = sx * (PW / 2 - col_w / 2)
        objs.append(box('col%d' % sx, col_w, PH, col_d, x, 0, PH / 2,
                        0.018, 2, STONE, taper=0.055))
        # 斗：柱头向外扩的一块，把门楣托住
        objs.append(box('cap%d' % sx, col_w * 1.42, 0.26, col_d * 1.10,
                        x, 0, PH - 0.10, 0.014, 2, STONE_D))
        # 柱础
        objs.append(box('base%d' % sx, col_w * 1.30, 0.22, col_d * 1.06,
                        x, 0, 0.11, 0.012, 2, STONE_D))
        # 柱身竖向凹槽：三道浅缝，光斜着过来才看得见，正是要它"几乎看不见"
        for k in (-1, 0, 1):
            objs.append(box('flute%d_%d' % (sx, k), 0.045, PH * 0.72, 0.016,
                            x + k * col_w * 0.26, -col_d / 2 - 0.004, PH * 0.46,
                            0.004, 1, STONE_D))

    # ---- 3. 门楣：月梁 --------------------------------------------
    # 下沿中间略拱（月梁），两端落在斗上。用三块拼出轻微的弧形。
    objs.append(box('lintel', PW + 0.30, 0.50, PD + 0.30, 0, 0, PH + 0.25,
                    0.016, 2, STONE))
    objs.append(box('lintel_low', PW - 0.55, 0.16, PD + 0.26, 0, 0, PH + 0.02,
                    0.020, 2, STONE_D))

    # ---- 4. 挑檐：门楣上沿往外挑一道，门才有"屋顶"的意思 ----------
    objs.append(box('eave', PW + 1.20, 0.14, PD + 0.62, 0, -0.05, PH + 0.58,
                    0.010, 2, STONE_D))
    objs.append(box('eave_top', PW + 0.86, 0.10, PD + 0.46, 0, -0.02, PH + 0.69,
                    0.008, 2, STONE))

    # ---- 5. 铜箍：门楣下沿一道、柱头一道 --------------------------
    # 全场只有这两道是金属。多了就俗，一道没有就全是石头。
    objs.append(box('band_lintel', PW + 0.34, 0.035, PD + 0.34, 0, 0, PH + 0.005,
                    0.006, 1, BRONZE))
    for sx in (-1, 1):
        objs.append(box('band_cap%d' % sx, col_w * 1.46, 0.030, col_d * 1.12,
                        sx * (PW / 2 - col_w / 2), 0, PH - 0.235,
                        0.005, 1, BRONZE))

    # ---- 6. 门枕石 + 门槛 -----------------------------------------
    for sx in (-1, 1):
        objs.append(box('drum%d' % sx, 0.34, 0.46, 0.52,
                        sx * (PW / 2 - 0.10), -PD / 2 - 0.18, 0.23,
                        0.030, 3, STONE_D))
    objs.append(box('sill', PW + 0.10, 0.14, PD + 0.40, 0, -0.06, 0.07,
                    0.014, 2, STONE_D))

    return objs


def export(objs, filename):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    # 合并成一个对象：前端只要一个 mesh，draw call 少一半
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = os.path.splitext(filename)[0]

    path = os.path.join(OUT, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
    )
    print('WROTE', path, os.path.getsize(path), 'bytes')


def run():
    wipe()
    objs = build_portal()
    print('parts:', len(objs))
    export(objs, 'portal.glb')
    print('PORTAL DONE')


run()
