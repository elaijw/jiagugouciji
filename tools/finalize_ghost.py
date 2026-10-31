#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""字趣 · 把 ComfyUI 的骨面虚影原图定稿成前端要用的规格。

ComfyUI 出 1024×1024 的 PNG（每张 1MB 上下）。前端实际只要 512×512：
  · softMaskTexture() 里就是 512 的画布，再大也是白搭
  · 七十三张 1024 PNG 约 70MB，整个 assets/ 会被打爆

所以统一缩成 512×512 JPEG（q=88），一张 60–90KB，七十三张 5MB 出头。

输入  C:/DSH/comfy_assets/ghost/o-<key>_<seed>_.png
输出  assets/gen/obj_<key>.jpg
      tools/specs_ghost.json 决定 key 与顺序；缺图的只报告，不算错。

用法：
  python tools/finalize_ghost.py            # 全部
  python tools/finalize_ghost.py --only yue,hu   # 只定几张
  python tools/finalize_ghost.py --sheet    # 另外出联系表 _check/ghost_sheet.jpg
"""
import argparse
import glob
import io
import json
import os
import re
import sys

from PIL import Image, ImageDraw

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "C:/DSH/comfy_assets/ghost"
DST = os.path.join(REPO, "assets", "gen")
SIZE = 512
QUALITY = 88


def load_spec(path):
    raw = io.open(path, encoding="utf-8").read()
    raw = re.sub(r"^\s*//.*$", "", raw, flags=re.M)
    return json.loads(raw)


def find_src(key):
    """同一 key 可能跑过几次（seed 不同），取出图最新的那一张。"""
    hits = glob.glob(os.path.join(SRC, "o-%s_*.png" % key))
    if not hits:
        return None
    hits.sort(key=lambda p: os.path.getmtime(p))
    return hits[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", default=os.path.join(REPO, "tools", "specs_ghost.json"))
    ap.add_argument("--only", default=None, help="只处理某些 key（逗号分隔）")
    ap.add_argument("--sheet", action="store_true", help="另外出一张联系表")
    args = ap.parse_args()

    spec = load_spec(args.spec)
    only = set(args.only.split(",")) if args.only else None
    jobs = [j for j in spec["jobs"] if not only or j.get("key") in only]

    if not os.path.isdir(DST):
        os.makedirs(DST)

    done, miss, total_kb = [], [], 0
    for j in jobs:
        key, ch = j["key"], j["char"]
        src = find_src(key)
        if not src:
            miss.append((key, ch))
            continue
        im = Image.open(src).convert("RGB")
        if im.size != (SIZE, SIZE):
            im = im.resize((SIZE, SIZE), Image.LANCZOS)
        out = os.path.join(DST, "obj_%s.jpg" % key)
        im.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        kb = os.path.getsize(out) / 1024.0
        total_kb += kb
        done.append((key, ch, kb))

    print("定稿 %d 张 → assets/gen/obj_<key>.jpg（%d×%d q%d）"
          % (len(done), SIZE, SIZE, QUALITY))
    print("  合计 %.1f MB，平均 %.0f KB" % (total_kb / 1024.0,
                                          total_kb / max(1, len(done))))
    if miss:
        print("  缺图 %d 张：%s" % (len(miss), " ".join("%s(%s)" % (c, k) for k, c in miss)))
    if done:
        print("  " + " ".join(ch for _, ch, _ in done))

    if args.sheet and done:
        sheet_path = os.path.join(REPO, "_check", "ghost_sheet.jpg")
        if not os.path.isdir(os.path.dirname(sheet_path)):
            os.makedirs(os.path.dirname(sheet_path))
        cols, cell, pad = 9, 180, 6
        rows = (len(done) + cols - 1) // cols
        W = cols * (cell + pad) + pad
        H = rows * (cell + pad + 14) + pad
        sheet = Image.new("RGB", (W, H), (18, 14, 10))
        dr = ImageDraw.Draw(sheet)
        for i, (key, ch, _) in enumerate(done):
            r, c = divmod(i, cols)
            x = pad + c * (cell + pad)
            y = pad + r * (cell + pad + 14)
            im = Image.open(os.path.join(DST, "obj_%s.jpg" % key))
            sheet.paste(im.resize((cell, cell), Image.LANCZOS), (x, y))
            dr.text((x + 4, y + cell + 1), ch, fill=(200, 170, 120))
        sheet.save(sheet_path, "JPEG", quality=82)
        print("  联系表 %s（%d×%d）" % (os.path.relpath(sheet_path, REPO), W, H))

    return 0 if not miss else 0


if __name__ == "__main__":
    sys.exit(main())
