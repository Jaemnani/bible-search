#!/usr/bin/env python3
"""
단락 분할 품질 검증 (읽기전용)
────────────────────────────────────────────────
- 장르별 길이 히스토그램 / 평균·min·max
- 장르 한계 [min,max] 내 비율, ≤2절·≥max+ 비율
- 빈 메타데이터 수, '..장' 폴백 의심 수
- (옵션) baseline 과 비교한 passage_id 변경률 + 옛→새 매핑 생성

실행:
  # 재분할 직전 백업: cp public/data/passages.json public/data/passages.baseline.json
  python3 scripts/passage_validate.py
  python3 scripts/passage_validate.py --baseline public/data/passages.baseline.json --emit-migration
"""

import argparse
import collections
import json
import re
from pathlib import Path

GENRE_BOUNDS = {
    "시가서": (1, 3, 6), "복음서": (3, 6, 9), "역사서": (4, 7, 11),
    "모세오경": (4, 7, 11), "바울서신": (2, 5, 8), "일반서신": (2, 5, 8),
    "대예언서": (3, 5, 9), "소예언서": (3, 5, 9), "예언서": (3, 5, 9),
}
DEFAULT_BOUNDS = (3, 5, 9)


def plen(p):
    return p["verse_end"] - p["verse_start"] + 1


def report(passages):
    lens = [plen(p) for p in passages]
    print(f"총 단락: {len(passages)}")
    print(f"길이 min/avg/max: {min(lens)} / {sum(lens)/len(lens):.2f} / {max(lens)}")

    buckets = collections.Counter()
    for L in lens:
        if L == 1: buckets["1절"] += 1
        elif L == 2: buckets["2절"] += 1
        elif L <= 6: buckets["3-6절"] += 1
        elif L <= 12: buckets["7-12절"] += 1
        elif L <= 19: buckets["13-19절"] += 1
        else: buckets["20절+"] += 1
    print("\n[전체 길이 분포]")
    for k in ["1절", "2절", "3-6절", "7-12절", "13-19절", "20절+"]:
        n = buckets[k]
        print(f"  {k:>7}: {n:5d} ({n/len(passages)*100:4.1f}%)")

    # 장르별 한계 준수율
    print("\n[장르별 한계 [min,max] 준수율]")
    by_genre = collections.defaultdict(list)
    for p in passages:
        by_genre[p.get("genre", "")].append(plen(p))
    for g in sorted(by_genre):
        mn, tgt, mx = GENRE_BOUNDS.get(g, DEFAULT_BOUNDS)
        ls = by_genre[g]
        within = sum(1 for L in ls if mn <= L <= mx)
        over = sum(1 for L in ls if L > mx)
        print(f"  {g:>8} [min{mn} max{mx}]: {len(ls):5d}개  내 {within/len(ls)*100:5.1f}%  초과 {over}")

    # 품질 플래그
    empty_meta = sum(1 for p in passages if not (p.get("core_meaning") or "").strip())
    fallback = sum(1 for p in passages if re.search(r"\d+장$", p.get("theme_title", "")))
    le2 = sum(1 for L in lens if L <= 2)
    gemx = sum(1 for p in passages if plen(p) > GENRE_BOUNDS.get(p.get("genre", ""), DEFAULT_BOUNDS)[2])
    no_tags = sum(1 for p in passages if not p.get("emotion_tags") and not p.get("need_tags"))
    print("\n[품질 플래그]")
    print(f"  빈 core_meaning : {empty_meta}")
    print(f"  '..장' 폴백 의심 : {fallback}")
    print(f"  ≤2절            : {le2} ({le2/len(passages)*100:.1f}%)")
    print(f"  장르 max 초과    : {gemx} ({gemx/len(passages)*100:.1f}%)")
    print(f"  태그 없음        : {no_tags}")


def churn(old, new, emit_migration, root):
    old_ids = {p["id"] for p in old}
    new_ids = {p["id"] for p in new}
    kept = old_ids & new_ids
    print("\n[passage_id 변경]")
    print(f"  이전 {len(old_ids)} → 현재 {len(new_ids)} | 유지 {len(kept)} "
          f"({len(kept)/max(len(old_ids),1)*100:.1f}%) | 변경 {len(old_ids)-len(kept)}")

    if not emit_migration:
        return
    # 옛→새 매핑: verse_keys Jaccard 최대 중첩
    new_by_chap = collections.defaultdict(list)
    for p in new:
        new_by_chap[(p["book_en"], p["chapter"])].append(p)
    mapping = {}
    for op in old:
        if op["id"] in new_ids:
            continue
        oset = set(op.get("verse_keys", []))
        if not oset:
            continue
        best, best_j = None, 0.0
        for np_ in new_by_chap.get((op["book_en"], op["chapter"]), []):
            nset = set(np_.get("verse_keys", []))
            j = len(oset & nset) / len(oset | nset) if (oset | nset) else 0.0
            if j > best_j:
                best_j, best = j, np_["id"]
        if best and best_j > 0:
            mapping[op["id"]] = best
    out = root / "public" / "data" / "passage_id_migration.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=0)
    print(f"  옛→새 매핑 {len(mapping)}건 → {out}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=str, default=None, help="비교용 옛 passages.json")
    parser.add_argument("--emit-migration", action="store_true", help="옛→새 ID 매핑 파일 생성")
    args = parser.parse_args()

    root = Path(__file__).parent.parent
    cur_path = root / "public" / "data" / "passages.json"
    if not cur_path.exists():
        print("❌ passages.json 없음.")
        return 1
    with open(cur_path, encoding="utf-8") as f:
        passages = json.load(f)

    print("=" * 55)
    print("  단락 분할 품질 리포트 (현재 passages.json)")
    print("=" * 55)
    report(passages)

    if args.baseline:
        bp = Path(args.baseline)
        if not bp.is_absolute():
            bp = root / args.baseline
        if bp.exists():
            with open(bp, encoding="utf-8") as f:
                old = json.load(f)
            churn(old, passages, args.emit_migration, root)
        else:
            print(f"\n⚠ baseline 없음: {bp}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
