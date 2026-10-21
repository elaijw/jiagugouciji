#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在 freesound 上找素材，输出候选清单（含授权状态）。

为什么走搜索页而不是 API：API v2 要 token，搜索页不用登录，
结果块里就带 data-mp3（preview 直链）、data-duration、data-num-downloads。

授权：默认加 `license:"Creative Commons 0"` 过滤；该词下 CC0 为空时
自动退回不带过滤再查一遍，并把每个候选标成 `?`（未核实）——
挑中的那几个再用 --lic 单独核对，绝不靠猜。

用法：
    python dev/_find_audio.py "rhythm bones" "bone clack"
    python dev/_find_audio.py --lic 785119 825854
"""
import re
import sys
import json
import urllib.request
import urllib.parse

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
CC0 = 'license:"Creative Commons 0"'


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode('utf-8', 'ignore')


def parse(html):
    """以 data-mp3 为锚点，往前后各扫一段，取该条目的属性。"""
    out = []
    for m in re.finditer(r'data-mp3="([^"]+)"', html):
        seg = html[max(0, m.start() - 1800):m.end() + 600]
        g = lambda k: (re.search(r'data-' + k + r'="([^"]*)"', seg) or [None, ''])[1]
        sid = g('sound-id')
        if not sid:
            continue
        out.append({
            'id': sid,
            'title': g('title'),
            'user': g('username'),
            'dur': round(float(g('duration') or 0), 1),
            'dl': int(g('num-downloads') or 0),
            'mp3': m.group(1),
        })
    return out


def search(q, cc0=True, page=1):
    p = {'q': q, 'page': page}
    if cc0:
        p['f'] = CC0
    return parse(fetch('https://freesound.org/search/?' + urllib.parse.urlencode(p)))


def license_of(sid):
    html = fetch('https://freesound.org/s/%s/' % sid)
    m = re.search(r'license/[a-z0-9./_-]+"[^>]*>\s*([^<]{2,60})<', html)
    t = re.search(r'<title>([^<]*)</title>', html)
    d = re.search(r'data-duration="([^"]*)"', html)
    return {
        'id': sid,
        'title': (t.group(1).strip() if t else ''),
        'license': (m.group(1).strip() if m else '未识别'),
        'dur': d.group(1) if d else '',
    }


def main():
    args = sys.argv[1:]
    if args and args[0] == '--lic':
        for sid in args[1:]:
            try:
                print(json.dumps(license_of(sid), ensure_ascii=False))
            except Exception as e:
                print(sid, 'ERR', e)
        return

    for q in args or ['rhythm bones']:
        for cc0 in (True, False):
            try:
                rows = search(q, cc0)
            except Exception as e:
                print('QUERY %-22s %s ERR %s' % (q, 'CC0' if cc0 else 'ALL', e))
                continue
            if not rows and cc0:
                continue
            print('=' * 78)
            print('QUERY %-24s %s  (%d)' % (q, 'CC0' if cc0 else 'ALL', len(rows)))
            for r in rows:
                mins = '%d:%02d' % (int(r['dur'] // 60), int(r['dur'] % 60))
                print('  %-8s %6s dl=%-5d %s' % (r['id'], mins, r['dl'], (r['title'] or '')[:50]))
            if cc0:
                print('  JSON ' + json.dumps(rows[:4], ensure_ascii=False))
            break


if __name__ == '__main__':
    main()
