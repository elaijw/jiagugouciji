# -*- coding: utf-8 -*-
"""
把 hanzi-glyphs-svg 的甲骨拓片字形导入为前端可直接用的数据。

素材：
  zhouyongh/hanzi-glyphs-svg · glyphs/oracle/
  甲骨层 13,956 件，其中 10,213 件是汉典（zdic.net）甲骨拓片摹本，
  另有 1,203 件来自 JGW 参数数据集（与本项目原来那份同源）。
  许可：CC0 1.0（汉典摹本）/ CC BY 4.0（JGW 批）。
  出处：每件带 variant 字段，记的是原拓著录号，如「日乙3400 合1285 賓組」。

用法：
  python tools/import_rubbings.py --src C:/.../glyphs/oracle \
      --index C:/.../glyphs/oracle/index.csv [--per 3]

产出：
  js/core/_rubbings.js   —— window.App.glyphRubbings = { meta, chars }
  走 <script> 而不是 fetch：file:// 下双击要能开，fetch 本地 JSON 会被 CORS 拦。
"""
import argparse, csv, io, json, os, re, sys

# 站内用到的 73 个字；数据里「门」「贝」以繁体收录
CHARS = ("日 月 雨 水 火 山 田 木 人 大 女 子 目 耳 口 又 止 牛 羊 犬 豕 隹 鱼 "
         "禾 屮 宀 门 酉 斤 戈 矢 糸 力 贝 舟 卜 土 石 川 泉 丘 谷 林 竹 米 虎 "
         "鹿 虫 足 刀 斧 弓 衣 皿 鼎 缶 玉 井 邑 郭 車 舞 龜 馬 龍 鼓 鳥 爵 彝 "
         "尊 絲 象 囗").split()
TRAD = {'门': '門', '贝': '貝'}

PATH_RE = re.compile(r'<path\b[^>]*\bd="([^"]+)"', re.I)
NUM_RE = re.compile(r'-?\d+\.\d+|-?\d+')


def squeeze(d):
    """坐标保留 2 位小数 —— 原件的精度是 0.01，再细是描摹噪声，白占字节。"""
    def fix(m):
        s = m.group(0)
        if '.' not in s:
            return s
        v = round(float(s), 2)
        return ('%.2f' % v).rstrip('0').rstrip('.')
    d = NUM_RE.sub(fix, d)
    d = re.sub(r'\s+', ' ', d).strip()
    # 相对指令后紧跟补零可以省掉
    return d


def read_paths(svg_path):
    """一个文件里常有 2~4 条 path（外框、笔画、拓片麻点）。全部取出来拼成一条 d，
       它们本来就同属一件拓片，fill 规则一致。"""
    try:
        s = io.open(svg_path, encoding='utf-8').read()
    except (OSError, UnicodeDecodeError):
        return None
    ds = PATH_RE.findall(s)
    if not ds:
        return None
    d = ' '.join(squeeze(x) for x in ds).strip()
    return d or None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='glyphs/oracle 目录')
    ap.add_argument('--index', required=True, help='glyphs/oracle/index.csv')
    ap.add_argument('--per', type=int, default=3, help='每个字取几件（默认 3）')
    ap.add_argument('--out', default=None)
    a = ap.parse_args()

    rows = list(csv.DictReader(io.open(a.index, encoding='utf-8')))
    by_char = {}
    for r in rows:
        mc = (r.get('modern_char') or '').strip()
        if not mc or not r.get('file'):
            continue
        by_char.setdefault(mc, []).append(r)

    chars, report = {}, []
    for ch in CHARS:
        key = TRAD.get(ch, ch)
        cand = by_char.get(key, [])
        # 先拓片摹本（有 variant 著录号），再 JGW 骨架；各自按文件名稳定排序
        rub = [r for r in cand if (r.get('variant') or '').strip()]
        jgw = [r for r in cand if not (r.get('variant') or '').strip()]
        rub.sort(key=lambda r: r['file'])
        jgw.sort(key=lambda r: r['file'])
        picked = (rub + jgw)[:a.per]
        forms = []
        for r in picked:
            p = os.path.join(a.src, r['file'])
            d = read_paths(p)
            if not d:
                continue
            forms.append({
                'd': d,
                'src': (r.get('variant') or '').strip(),
                'batch': 'zdic' if (r.get('variant') or '').strip() else 'jgw',
            })
        if forms:
            chars[ch] = forms
            report.append((ch, len(forms), sum(len(f['d']) for f in forms)))
        else:
            report.append((ch, 0, 0))

    miss = [c for c, n, _ in report if not n]
    total = sum(sz for _, _, sz in report)
    out = a.out or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                'js', 'core', '_rubbings.js')
    data = {
        'meta': {
            'dataset': 'hanzi-glyphs-svg · glyphs/oracle',
            'upstream': 'https://github.com/zhouyongh/hanzi-glyphs-svg',
            'sources': [
                '汉典 zdic.net 甲骨拓片摹本（CC0 1.0）',
                'Oracle Bone Glyphs: Parametric Vector Dataset v0.3（CC BY 4.0）'
            ],
            'viewBox': 400,
            'note': '每字多件，src 为原拓著录号（合集/乙编 + 组类）。',
            'generated': '由 tools/import_rubbings.py 生成，请勿手改'
        },
        'chars': chars
    }
    js = ('/* 甲骨拓片字形 —— 由 tools/import_rubbings.py 生成，请勿手改。\n'
          '   来源 zhouyongh/hanzi-glyphs-svg（CC0 / CC BY 4.0），详见 meta。 */\n'
          'window.App = window.App || {};\n'
          'window.App.glyphRubbings = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    io.open(out, 'w', encoding='utf-8', newline='').write(js)

    print('字 %d / 缺 %d %s' % (len(chars), len(miss), ' '.join(miss)))
    print('每字件数', sorted(set(n for _, n, _ in report)))
    print('path 总字节 %.1f KB · 文件 %.1f KB' % (total / 1024.0, os.path.getsize(out) / 1024.0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
