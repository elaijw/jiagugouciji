# -*- coding: utf-8 -*-
"""
最小检索层：证明「问一个字 → 命中可引用条目」这条路在 243 条语料上是通的。

设计取舍（答辩会被问）：
  语料只有 243 条、1.56 万字，且每条的天然主键就是一个字。
  学生提问九成集中在「这个字为什么这么写」「A 和 B 差在哪」「我错在哪」，
  都能靠字符/构件名精确命中。所以用「精确键 + 字符 bigram BM25」，
  不引入 embedding 服务 —— 少一个依赖、少一份成本、少一个演示当天会挂的环节。

用法：
    python dev/_rag_demo.py "日和月有什么区别"
    python dev/_rag_demo.py --eval        # 跑内置评测集，报召回@k
"""
import json
import math
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(ROOT, 'data', 'corpus.jsonl')

# 问句里出现这些词时，检索没有意义，应交给模型说「我不知道」
STOP_QUERY = re.compile(r'^[\s，。？！、,.?!]+$')

# 条目类型的基础权重：图鉴/王邑/关卡都有可讲的内容，构件只有几何数据
KIND_W = {'codex': 1.00, 'map': 0.90, 'level': 0.85, 'part': 0.30}

# 繁简归一：语料里存的是繁体（龍、馬、鳥），学生输入多半是简体。
# 数据本身没有别名字段，只能补一张小表；不补就会出现「搜龙查不到龍」。
TRAD2SIMP = {
    '龜': '龟', '魚': '鱼', '鳳': '凤', '車': '车', '貝': '贝', '雲': '云',
    '門': '门', '獲': '获', '羅': '罗', '鳴': '鸣', '見': '见', '眾': '众',
    '東': '东', '來': '来', '風': '风', '萬': '万', '無': '无', '舊': '旧',
    '喪': '丧', '猶': '犹', '絲': '丝', '馬': '马', '鳥': '鸟', '龍': '龙',
    '爵': '爵', '彝': '彝', '網': '网', '網': '网', '醫': '医', '獸': '兽',
}
SIMP2TRAD = {}
for _t, _s in TRAD2SIMP.items():
    for _c in _s:
        SIMP2TRAD.setdefault(_c, []).append(_t)

# 问句里的这些词是「问题的外壳」，不是「想查的字」。
# 不剔掉的话，问「王邑哪里能找到日」会被「邑」抢走排序。
NOISE_WORDS = [
    '王邑', '甲骨文', '甲骨', '字形', '殷商', '卜辞', '占卜', '游戏', '关卡',
    '什么意思', '怎么解释', '怎么写', '为什么', '为什么这么写', '是什么',
    '有什么区别', '区别', '不同', '差别', '哪里', '在哪', '能找到', '组成',
    '哪些', '构件', '部件', '这个字', '那个字', '请问', '我想知道',
]


def normalize_query(q):
    """把问句里的简体字补成繁体，让「龙」也能命中「龍」。"""
    extra = []
    for ch in q:
        for t in SIMP2TRAD.get(ch, []):
            extra.append(t)
    return q + ''.join(extra)


def core_query(q):
    """剥掉外壳词，留下真正想查的内容，用于位置计分。"""
    s = q
    for w in sorted(NOISE_WORDS, key=len, reverse=True):
        s = s.replace(w, ' ')
    return s


def load_corpus():
    rows = []
    with open(CORPUS, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def bigrams(text):
    """中文短句按字符 bigram 切，比词典分词更稳（无需维护词表）。"""
    chars = [c for c in text if '\u4e00' <= c <= '\u9fff']
    if len(chars) < 2:
        return chars
    return [chars[i] + chars[i + 1] for i in range(len(chars) - 1)]


class Index:
    def __init__(self, rows):
        self.rows = rows
        self.by_char = {}
        for r in rows:
            for key in {r['char'], r.get('alt') or '', r.get('pinless') or ''}:
                if key:
                    self.by_char.setdefault(key, []).append(r)
        # BM25 结构
        self.docs = [Counter(bigrams(r['text'])) for r in rows]
        self.lens = [sum(d.values()) for d in self.docs]
        self.avg = sum(self.lens) / max(1, len(self.lens))
        df = Counter()
        for d in self.docs:
            df.update(d.keys())
        n = len(rows)
        self.idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}
        self.k1, self.b = 1.5, 0.75

    def exact(self, q):
        """精确键召回后按「值不值得引用」重排。

        排序不是看条目类型，是看它有没有真东西可讲：
        有 form（字形解释）的最该被引用，只有矢量几何的 part 最不该。
        """
        qn = normalize_query(q)
        core = core_query(q)
        hits, seen = [], set()

        # 拼音整词匹配（英文输入）
        low = qn.lower().strip()
        for key, rs in self.by_char.items():
            if key and not ('\u4e00' <= key[0] <= '\u9fff') and len(key) > 1 and key in low:
                for r in rs:
                    if r['id'] not in seen:
                        seen.add(r['id'])
                        hits.append(r)
        # 单字匹配
        for ch in qn:
            for r in self.by_char.get(ch, []):
                if r['id'] not in seen:
                    seen.add(r['id'])
                    hits.append(r)

        def score(r):
            s = KIND_W.get(r['kind'], 0.5)
            f = r['fields']
            if f.get('form'):
                s += 0.60        # 有字形解释
            if f.get('note'):
                s += 0.30        # 有关卡释义
            if f.get('meaning'):
                s += 0.22        # 有取象
            if f.get('has_gloss') is False:
                s -= 0.35        # 明确只有几何、没有释义
            # 想查的字在「剥掉外壳后」的问句里越靠前，越可能是主语
            pos = core.find(r['char']) if r['char'] else -1
            if pos >= 0:
                s += 0.45 * (1.0 - pos / max(1, len(core)))
                s += 0.10 * core.count(r['char'])
            return s

        hits.sort(key=lambda r: -score(r))
        return hits

    def bm25(self, q, k=6):
        qb = bigrams(normalize_query(q))
        if not qb:
            return []
        scores = []
        for i, d in enumerate(self.docs):
            s = 0.0
            for t in qb:
                if t not in d:
                    continue
                tf = d[t]
                idf = self.idf.get(t, 0.0)
                norm = tf + self.k1 * (1 - self.b + self.b * self.lens[i] / max(1e-9, self.avg))
                s += idf * tf * (self.k1 + 1) / norm
            if s > 0:
                scores.append((s, i))
        scores.sort(reverse=True)
        return [(self.rows[i], round(s, 2)) for s, i in scores[:k]]

    def retrieve(self, q, k=6):
        """返回 (结果, 路径)。精确命中优先，不足 k 条时用 BM25 补。"""
        if STOP_QUERY.match(q or ''):
            return [], 'empty'
        ex = self.exact(q)
        if len(ex) >= k:
            return [(r, None) for r in ex[:k]], 'exact'
        if not ex:
            bm = self.bm25(q, k)
            return bm, ('bm25' if bm else 'miss')
        seen = {r['id'] for r in ex}
        merged = [(r, None) for r in ex]
        for r, s in self.bm25(q, k):
            if r['id'] not in seen and len(merged) < k:
                merged.append((r, s))
                seen.add(r['id'])
        return merged, 'exact+bm25'


# 内置评测集：问题 → 期望命中的条目 id 前缀。空字符串 = 负样本，正确行为是拒答。
# 这是最小可用版本（12 条），正式提交前应扩到 30 条并请任课教师过一遍。
# 注意：期望值是按语料的真实分布写的，不是按「我以为图鉴里有什么」。
EVAL = [
    ('日为什么这么写', 'map:'),          # 日不在图鉴 88 条里，解释只在王邑热区
    ('龜是什么字', 'codex:龜'),
    ('gui', 'codex:龜'),
    ('涉由哪些构件组成', 'codex:涉'),
    ('涉这个字是什么意思', 'codex:涉'),
    ('王邑哪里能找到日', 'map:'),
    ('月和日有什么区别', 'map:'),        # 月同样不在图鉴 88 条里
    ('雨的字形怎么解释', 'codex:雨'),
    ('焚字怎么写', 'level:grunt:焚'),    # 焚只有关卡条目，没有图鉴条目
    ('龙的甲骨文', 'level:elite:龍'),    # 语料存繁体，靠繁简归一命中
    ('甲骨上的田是什么样', 'map:'),
    ('什么是会意字', ''),                # 负样本：语料里没有组定义，必须拒答
]


def run_eval(ix, topk=3):
    ok = 0
    rows = []
    for q, expect in EVAL:
        res, how = ix.retrieve(q, k=topk)
        ids = [r['id'] for r, _ in res]
        if expect == '':
            # 负样本：语料里答不了，正确行为是「查不到」而不是硬凑
            hit = len(res) == 0
        else:
            hit = any(i.startswith(expect) for i in ids)
        ok += 1 if hit else 0
        rows.append((q, hit, how, ids, expect))
    print('评测集 %d 条，召回@%d = %d/%d = %.0f%%' % (
        len(EVAL), topk, ok, len(EVAL), 100.0 * ok / len(EVAL)))
    for q, hit, how, ids, expect in rows:
        mark = 'OK ' if hit else '!! '
        tag = '拒答' if expect == '' else expect
        print('%s%-16s [%-10s] 期望 %-14s 实得 %s' % (
            mark, q, how, tag, ', '.join(ids[:3]) or '(空)'))
    return ok, len(EVAL)


def show(q, ix, k=4):
    res, how = ix.retrieve(q, k=k)
    print('问：%s' % q)
    print('路径：%s   命中 %d 条' % (how, len(res)))
    for r, s in res:
        score = '' if s is None else f'  bm25={s}'
        print('  [%s] %s%s' % (r['kind'], r['cite'], score))
        print('     %s' % r['text'][:110])
    if not res:
        print('  （无命中 —— 此时正确行为是回答「我的资料里没有」，而不是编）')
    print()


def main():
    ix = Index(load_corpus())
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--eval' in sys.argv:
        run_eval(ix)
        return 0
    if not args:
        print('用法: python dev/_rag_demo.py "你的问题"   或   --eval')
        return 1
    show(' '.join(args), ix)
    return 0


if __name__ == '__main__':
    sys.exit(main())
