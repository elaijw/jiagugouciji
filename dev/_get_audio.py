#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按 freesound sound id 下载 preview 音频，并顺带取回标题与授权。

直链不能靠猜（previews 路径里有上传者的 user id），所以从声音页里解析
data-mp3 / data-ogg，同时把 title、license 一起抓回来 —— 授权必须留证，
不能凭搜索结果页推断。

用法：python dev/_get_audio.py 82819 840945
"""
import os
import re
import sys
import json
import urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
POOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_audio_pool')


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read() if binary else r.read().decode('utf-8', 'ignore')


def grab(sid):
    html = fetch('https://freesound.org/s/%s/' % sid)
    mp3 = re.search(r'data-mp3="([^"]+)"', html)
    ogg = re.search(r'data-ogg="([^"]+)"', html)
    if not mp3:
        m = re.search(r'https://cdn\.freesound\.org/previews/[^"\']+\.mp3', html)
        mp3 = m
    title = re.search(r'data-title="([^"]*)"', html)
    # 授权：声音页上用 bw-icon-zero / bw-icon-cc 图标 + 指向 creativecommons.org 的链接标注。
    # 只认这个链接，不从搜索结果推断。
    lic = re.search(
        r'href="(https?://creativecommons\.org/(?:publicdomain/zero/[\d.]+|licenses/[a-z-]+/[\d.]+)/?)"'
        r'[^>]*>\s*([^<]{2,60})<', html)
    dur = re.search(r'data-duration="([^"]*)"', html)
    user = re.search(r'<title>[^<]*? by ([^<]+)</title>', html)

    if not mp3:
        raise RuntimeError('找不到 preview 直链')

    os.makedirs(POOL, exist_ok=True)
    path = os.path.join(POOL, '%s.mp3' % sid)
    data = fetch(mp3.group(1), binary=True)
    with open(path, 'wb') as f:
        f.write(data)

    return {
        'id': sid,
        'title': (title.group(1).strip() if title else ''),
        'by': (user.group(1).strip() if user else ''),
        'license': (lic.group(2).strip() if lic else '未识别'),
        'licenseUrl': (lic.group(1) if lic else ''),
        'duration': (dur.group(1) if dur else ''),
        'page': 'https://freesound.org/s/%s/' % sid,
        'mp3': mp3.group(1),
        'bytes': len(data),
        'file': path,
    }


def main():
    rows = []
    for sid in sys.argv[1:]:
        try:
            r = grab(sid)
            rows.append(r)
            print('%-8s %-7s %-46s %s' % (r['id'], '%dKB' % (r['bytes'] // 1024),
                                          r['title'][:46], r['license']))
        except Exception as e:
            print('%-8s ERR %s' % (sid, e))
    with open(os.path.join(POOL, '_meta.json'), 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
