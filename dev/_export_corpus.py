# -*- coding: utf-8 -*-
"""
把站点里三处散落的语料统一导出成一份可检索、可引用的语料库。

之所以要有这一步：图鉴、王邑热区、讨伐关卡目前各存一处、字段各不相同，
检索、评测、组卷三件事都要读同一份数据。先统一，后面三件才好接。

输出：data/corpus.jsonl   每行一条，带稳定 id 与可引用的 cite 文案。
      data/corpus_stats.json  规模统计（方案里报数字要用）。

用法：
    python dev/_export_corpus.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'data')


def load(name):
    with open(os.path.join(ROOT, 'js', 'core', name), encoding='utf-8') as f:
        return json.load(f)


def strip_tone(py):
    """把 guī 削成 gui，学生多半按拼音首字母或无声调拼音搜。"""
    if not py:
        return ''
    table = {
        'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
        'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
        'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
        'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
        'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
        'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v', 'ü': 'v',
        'ń': 'n', 'ň': 'n', 'ǹ': 'n',
        'ḿ': 'm',
    }
    s = ''.join(table.get(ch, ch) for ch in py.lower())
    return re.sub(r'[^a-z0-9]', '', s)


def build_codex(levels):
    """图鉴 88 条：字形解释 form + 构件拆解 parts + 玩法 play。"""
    out = []
    groups = {g['id']: g['name'] for g in levels['bossCodex'].get('groups', [])}
    for i, e in enumerate(levels['bossCodex']['entries'], 1):
        ch = e.get('char', '')
        parts = e.get('parts') or []
        part_names = '、'.join(p.get('n', '') for p in parts if p.get('n'))
        gname = groups.get(e.get('group', ''), e.get('group', ''))
        bits = [f"字：{ch}"]
        if e.get('alt'):
            bits.append(f"也写作 {e['alt']}")
        if e.get('py'):
            bits.append(f"读音 {e['py']}")
        if gname:
            bits.append(f"属于{gname}")
        if e.get('form'):
            bits.append(f"字形：{e['form']}")
        if part_names:
            bits.append(f"可拆出的构件：{part_names}")
        if e.get('play'):
            bits.append(f"在游戏中：{e['play']}")
        out.append({
            'id': f"codex:{ch or i}",
            'kind': 'codex',
            'char': ch,
            'alt': e.get('alt', ''),
            'py': e.get('py', ''),
            'pinless': strip_tone(e.get('py', '')),
            'group': gname,
            'text': '。'.join(bits) + '。',
            # 引用口径要如实：只能指到「图鉴第 N 条」，指不到某片甲骨
            'cite': f"图鉴 #{i:02d}「{ch}」",
            'fields': {
                'form': e.get('form', ''),
                'play': e.get('play', ''),
                'parts': [p.get('n', '') for p in parts if p.get('n')],
                'group': gname,
                'art': e.get('art', ''),
            },
        })
    return out


def build_map(levels):
    """王邑 61 处实物热区：每处对应一个字的造字取象。"""
    out = []
    for z in levels['map']['zones']:
        zname = z.get('name', '')
        for j, o in enumerate(z.get('objects', []), 1):
            ch = o.get('char', '')
            bits = [f"字：{ch}"]
            if o.get('meaning'):
                bits.append(f"取象：{o['meaning']}")
            if o.get('form'):
                bits.append(f"字形：{o['form']}")
            bits.append(f"在王邑的{zname}可找到对应实物")
            out.append({
                'id': f"map:{z['id']}:{ch}:{j}",
                'kind': 'map',
                'char': ch,
                'alt': '',
                'py': '',
                'pinless': '',
                'group': zname,
                'text': '。'.join(bits) + '。',
                'cite': f"王邑·{zname} 第 {j} 处「{ch}」",
                'fields': {
                    'meaning': o.get('meaning', ''),
                    'form': o.get('form', ''),
                    'zone': zname,
                },
            })
    return out


def build_levels(levels):
    """讨伐 21 关：合体字的构件组成，这是「拆字即拆 Boss」的知识落点。"""
    out = []
    for t in levels['boss']['tiers']:
        tname = t.get('name', '')
        for k, lv in enumerate(t.get('list', []), 1):
            ch = lv.get('char', '')
            comps = lv.get('comps') or []
            bits = [f"字：{ch}"]
            if lv.get('note'):
                bits.append(f"释义：{lv['note']}")
            if comps:
                bits.append(f"由{'和'.join(comps)}组成")
            bits.append(f"属于{tname}")
            out.append({
                'id': f"level:{t['id']}:{ch}",
                'kind': 'level',
                'char': ch,
                'alt': '',
                'py': '',
                'pinless': '',
                'group': tname,
                'text': '。'.join(bits) + '。',
                'cite': f"讨伐·{tname}「{ch}」",
                'fields': {
                    'note': lv.get('note', ''),
                    'comps': comps,
                    'kind': lv.get('kind', ''),
                    'tier': tname,
                },
            })
    return out


def build_parts(parts):
    """
    构件 73 条。注意：这批数据只有矢量几何，没有释义文字。
    导出时不能编释义，只记录它存在、编号多少、属于哪个字。
    答辩被问「构件什么意思」时，答案是「以图鉴条目的 form 为准」。
    """
    out = []
    for ch, p in parts['parts'].items():
        out.append({
            'id': f"part:{ch}",
            'kind': 'part',
            'char': ch,
            'alt': '',
            'py': '',
            'pinless': '',
            'group': '构件',
            'text': f"构件 {ch}：收录于开源甲骨字形数据集，编号 {p.get('glyphId')}，共 {p.get('pieceCount')} 个笔段。",
            'cite': f"构件「{ch}」· 数据编号 {p.get('glyphId')}",
            'fields': {
                'glyphId': p.get('glyphId'),
                'unicode': p.get('unicode'),
                'sourceChar': p.get('sourceChar', ''),
                'pieceCount': p.get('pieceCount'),
                'has_gloss': False,
            },
        })
    return out


def main():
    levels = load('levels.json')
    parts = load('glyph-parts.json')

    rows = []
    rows += build_codex(levels)
    rows += build_map(levels)
    rows += build_levels(levels)
    rows += build_parts(parts)

    # 去重保护：同 id 只留第一条
    seen, uniq = set(), []
    for r in rows:
        if r['id'] in seen:
            continue
        seen.add(r['id'])
        uniq.append(r)
    rows = uniq

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, 'corpus.jsonl')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    by_kind = {}
    for r in rows:
        by_kind[r['kind']] = by_kind.get(r['kind'], 0) + 1
    chars = {r['char'] for r in rows if r['char']}
    chars_with_gloss = {
        r['char'] for r in rows
        if r['char'] and (r['fields'].get('form') or r['fields'].get('meaning'))
    }
    total_chars = sum(len(r['text']) for r in rows)

    stats = {
        'rows': len(rows),
        'by_kind': by_kind,
        'unique_chars': len(chars),
        'chars_with_gloss': len(chars_with_gloss),
        'chars_without_gloss': sorted(chars - chars_with_gloss),
        'corpus_chars': total_chars,
        'attribution': parts.get('attribution', {}).get('citation', ''),
        'license': parts.get('attribution', {}).get('license', ''),
    }
    with open(os.path.join(OUT_DIR, 'corpus_stats.json'), 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    print('导出完成 ->', os.path.relpath(path, ROOT))
    print('  条目 %d 条：%s' % (len(rows), ', '.join(f'{k} {v}' for k, v in by_kind.items())))
    print('  去重字 %d 个，其中有字形/取象解释的 %d 个' % (len(chars), len(chars_with_gloss)))
    if stats['chars_without_gloss']:
        print('  !! 无解释的字 %d 个：%s' % (
            len(stats['chars_without_gloss']),
            ''.join(stats['chars_without_gloss'])[:80]))
    print('  语料正文 %d 字' % total_chars)
    print('  出处口径：%s' % stats['attribution'][:70])
    return 0


if __name__ == '__main__':
    sys.exit(main())
