/* ============================================================
   甲骨奇谭 · 3D 博物馆 / GLB 读取
   ------------------------------------------------------------
   为什么自己写：
     three r149 的 examples/js 已经被官方删掉了（r148 起只留 ESM），
     而这个站是"传统脚本 + 可以双击打开"的结构，不能引 ES module 的
     GLTFLoader（模块在 file:// 下会被 CORS 拦）。引 importmap 也就
     意味着放弃 file://，代价太大。

     我们自己的模型没有 Draco、没有动画、没有骨骼、没有贴图，
     只有"位置 / 法线 / UV / 索引 + 几种材质"。这种 GLB 的头部结构很固定
     （12 字节头 + JSON 块 + BIN 块），解它大约 150 行，比引一个
     30 万字符的加载器划算，也不用再下载任何东西。

   支持：accessor / bufferView / nodes(TRS 或矩阵) / 多 primitive /
        baseColorFactor / metallic / roughness / alphaMode=BLEND / doubleSided
   不支持（遇到会明确报错，不静默出错）：Draco、sparse、morph、动画、贴图引用
   ============================================================ */
(function (App) {
  'use strict';

  var MAGIC = 0x46546c67;      /* 'glTF' */
  var CHUNK_JSON = 0x4e4f534a; /* 'JSON' */
  var CHUNK_BIN = 0x004e4942;  /* 'BIN\0' */

  var COMP = {
    5120: { arr: Int8Array, n: 1 },
    5121: { arr: Uint8Array, n: 1 },
    5122: { arr: Int16Array, n: 2 },
    5123: { arr: Uint16Array, n: 2 },
    5125: { arr: Uint32Array, n: 4 },
    5126: { arr: Float32Array, n: 4 }
  };
  var SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

  function parse(buf) {
    var dv = new DataView(buf);
    if (dv.getUint32(0, true) !== MAGIC) { throw new Error('不是 GLB 文件'); }
    var total = dv.getUint32(8, true);
    var off = 12, json = null, bin = null;
    while (off + 8 <= total) {
      var clen = dv.getUint32(off, true);
      var ctype = dv.getUint32(off + 4, true);
      var body = buf.slice(off + 8, off + 8 + clen);
      if (ctype === CHUNK_JSON) {
        json = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(body)));
      } else if (ctype === CHUNK_BIN) {
        bin = body;
      }
      off += 8 + clen;
    }
    if (!json) { throw new Error('GLB 缺 JSON 块'); }
    return { json: json, bin: bin };
  }

  function readAccessor(g, idx) {
    var acc = g.json.accessors[idx];
    var bv = g.json.bufferViews[acc.bufferView];
    var comp = COMP[acc.componentType];
    var itemSize = SIZE[acc.type];
    var comps = itemSize * comp.n;
    var byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    var stride = bv.byteStride || comps;
    var count = acc.count;

    if (stride === comps) {
      /* 紧凑排列：直接建视图 */
      var buf = g.bin.slice(byteOffset, byteOffset + count * comps);
      return new comp.arr(buf);
    }
    /* 交错排列：逐元素拷出来 */
    var out = new comp.arr(count * itemSize);
    var src = new DataView(g.bin, byteOffset, count * stride);
    for (var i = 0; i < count; i++) {
      for (var c = 0; c < itemSize; c++) {
        var at = i * stride + c * comp.n;
        var v;
        if (comp.arr === Float32Array) { v = src.getFloat32(at, true); }
        else if (comp.arr === Uint16Array) { v = src.getUint16(at, true); }
        else if (comp.arr === Uint32Array) { v = src.getUint32(at, true); }
        else if (comp.arr === Uint8Array) { v = src.getUint8(at); }
        else if (comp.arr === Int16Array) { v = src.getInt16(at, true); }
        else { v = src.getInt8(at); }
        out[i * itemSize + c] = v;
      }
    }
    return out;
  }

  function makeMaterial(T, m) {
    var pbr = (m && m.pbrMetallicRoughness) || {};
    var c = pbr.baseColorFactor || [1, 1, 1, 1];
    var mtl = new T.MeshStandardMaterial({
      color: new T.Color().setRGB(c[0], c[1], c[2]),
      metalness: pbr.metallicFactor == null ? 0 : pbr.metallicFactor,
      roughness: pbr.roughnessFactor == null ? 0.8 : pbr.roughnessFactor,
      side: (m && m.doubleSided) ? T.DoubleSide : T.FrontSide
    });
    if ((m && m.alphaMode) === 'BLEND' || c[3] < 1) {
      mtl.transparent = true;
      mtl.opacity = c[3];
      mtl.depthWrite = false;
    }
    if (m && m.name) { mtl.name = m.name; }
    return mtl;
  }

  /* 解析成 THREE.Group。cb(err, group, info) */
  function load(url, T, cb) {
    if (!T) { cb(new Error('THREE 未就绪')); return; }
    var done = false;
    function fin(err, group, info) {
      if (done) { return; }
      done = true;
      cb(err, group, info || null);
    }
    var f = (typeof fetch === 'function') ? fetch(url) : null;
    if (!f) { fin(new Error('这个环境没有 fetch（file:// 下浏览器也不给）')); return; }

    f.then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.arrayBuffer();
    }).then(function (ab) {
      var g = parse(ab);
      if (g.json.extensionsRequired && g.json.extensionsRequired.length) {
        throw new Error('需要未支持的扩展：' + g.json.extensionsRequired.join(','));
      }
      var scene = new T.Group();
      scene.name = (g.json.asset && g.json.asset.generator) || 'glb';
      var nodes = g.json.nodes || [];
      var meshes = g.json.meshes || [];
      var mats = (g.json.materials || []).map(function (m) { return makeMaterial(T, m); });
      var built = {};
      var tris = 0;

      function buildMesh(mi) {
        if (built[mi]) { return built[mi]; }
        var def = meshes[mi];
        var grp = new T.Group();
        grp.name = def.name || ('mesh' + mi);
        (def.primitives || []).forEach(function (pr) {
          if (pr.extensions && pr.extensions.KHR_draco_mesh_compression) {
            throw new Error('模型用了 Draco 压缩，本读取器不支持');
          }
          var geo = new T.BufferGeometry();
          var attrs = pr.attributes || {};
          if (attrs.POSITION != null) {
            var pos = readAccessor(g, attrs.POSITION);
            geo.setAttribute('position', new T.BufferAttribute(pos, 3));
          }
          if (attrs.NORMAL != null) {
            geo.setAttribute('normal', new T.BufferAttribute(readAccessor(g, attrs.NORMAL), 3));
          }
          if (attrs.TEXCOORD_0 != null) {
            geo.setAttribute('uv', new T.BufferAttribute(readAccessor(g, attrs.TEXCOORD_0), 2));
          }
          if (pr.indices != null) {
            var idx = readAccessor(g, pr.indices);
            geo.setIndex(new T.BufferAttribute(idx, 1));
          } else if (attrs.POSITION != null) {
            var n = g.json.accessors[attrs.POSITION].count;
            geo.setIndex(new T.BufferAttribute(new Uint32Array(n).map(function (_, i) { return i; }), 1));
          }
          if (!geo.attributes.normal) { geo.computeVertexNormals(); }
          var mat = pr.material != null ? mats[pr.material] : new T.MeshStandardMaterial({ color: 0xcccccc });
          var mesh = new T.Mesh(geo, mat);
          mesh.name = (def.name || 'part') + '_' + (pr.material != null ? pr.material : 'x');
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
          grp.add(mesh);
        });
        built[mi] = grp;
        return grp;
      }

      function addNode(ni, parent) {
        var n = nodes[ni] || {};
        var obj;
        if (n.mesh != null) {
          obj = buildMesh(n.mesh).clone();
        } else {
          obj = new T.Group();
        }
        obj.name = n.name || obj.name;
        if (n.matrix) {
          var m4 = new T.Matrix4().fromArray(n.matrix);
          obj.applyMatrix4(m4);
        } else {
          if (n.translation) { obj.position.fromArray(n.translation); }
          if (n.rotation) { obj.quaternion.fromArray(n.rotation); }
          if (n.scale) { obj.scale.fromArray(n.scale); }
        }
        parent.add(obj);
        (n.children || []).forEach(function (c) { addNode(c, obj); });
        return obj;
      }

      var roots = (g.json.scenes && g.json.scenes[g.json.scene || 0] &&
        g.json.scenes[g.json.scene || 0].nodes) || [];
      roots.forEach(function (ni) { addNode(ni, scene); });
      if (!roots.length && meshes.length) {
        scene.add(buildMesh(0).clone());
      }
      fin(null, scene, { tris: Math.round(tris), meshes: meshes.length, mats: mats.length });
    }).catch(function (e) {
      fin(e);
    });
  }

  App.museumGlb = { load: load, parse: parse };
})(window.App = window.App || {});
