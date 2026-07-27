#!/usr/bin/env python3
"""
구절별 설교영상·책 수집 (P5-core).

무료 소스만 쓴다.
  - 설교영상: YouTube Data API v3 (무료 쿼터 10,000 unit/일. search.list = 100 unit → 하루 100회)
  - 책      : Google Books API (무료·키 불필요)

**수집 단위가 절이 아니라 장/권인 이유**: 절은 30,944개라 무료 쿼터로 1년이 걸린다.
장(1,182개)은 하루 100회씩 12일이면 한 바퀴가 돌고, 책은 권(63개) 단위면 하루면 끝난다.
웹 API 는 `절 → 장 → 권` 순으로 되짚어 조회하므로 사용자 입장에서는 모든 절에 결과가 보인다.

  verse_ref 예시:  "John:3:16"(절, 수동 큐레이션용) · "John:3"(장, 영상) · "John"(권, 책)

저작권: 영상은 **링크·메타데이터만** 저장하고 썸네일은 공식 URL 을 그대로 핫링크한다(재호스팅 금지).

사용:
  python3 fetch_verse_media.py --mode video --limit 20            # dry-run (적재 안 함)
  python3 fetch_verse_media.py --mode video --limit 20 --commit   # verse_media 에 upsert
  python3 fetch_verse_media.py --mode book  --limit 63 --commit
  python3 fetch_verse_media.py --reset-checkpoint
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "public", "data")
STATE_DIR = os.path.join(HERE, "data")
CHECKPOINT = os.path.join(STATE_DIR, "checkpoint.json")

YOUTUBE_SEARCH = "https://www.googleapis.com/youtube/v3/search"
GOOGLE_BOOKS = "https://www.googleapis.com/books/v1/volumes"
PER_TARGET = 5          # 대상당 저장 개수
REQUEST_PAUSE = 0.5     # 외부 API 예의상 간격(초)


class QuotaExceeded(Exception):
    pass


# --- 공통 유틸 ----------------------------------------------------------------

def http_json(url, params, timeout=15):
    """GET → JSON. (status, payload) 를 돌려주고 예외는 (0, None) 으로 눕힌다."""
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{qs}", headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:200]
        print(f"[warn] HTTP {e.code} {url} — {body}", file=sys.stderr)
        return e.code, None
    except Exception as e:  # 네트워크/타임아웃/파싱
        print(f"[warn] 요청 실패 {url} — {e}", file=sys.stderr)
        return 0, None


def load_books():
    p = os.path.join(DATA, "books_index.json")
    if not os.path.exists(p):
        print("[warn] books_index.json 없음 — scripts/build_indexes.py 먼저 실행", file=sys.stderr)
        return []
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def load_checkpoint():
    if not os.path.exists(CHECKPOINT):
        return {}
    try:
        with open(CHECKPOINT, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_checkpoint(cp):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = CHECKPOINT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cp, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CHECKPOINT)


# --- 대상 목록 ----------------------------------------------------------------

def video_targets(books):
    """장 단위: (verse_ref, 검색어)"""
    out = []
    for b in books:
        for ch in range(1, b["chapter_count"] + 1):
            out.append((f'{b["book_en"]}:{ch}', f'{b["book_ko"]} {ch}장 설교'))
    return out


def book_targets(books):
    """권 단위: (verse_ref, 검색어)"""
    return [(b["book_en"], f'{b["book_ko"]} 주석') for b in books]


# --- 수집 ---------------------------------------------------------------------

def fetch_videos(query, api_key):
    status, data = http_json(YOUTUBE_SEARCH, {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": PER_TARGET,
        "relevanceLanguage": "ko",
        "safeSearch": "strict",
        "key": api_key,
    })
    if status == 403:
        raise QuotaExceeded("YouTube 쿼터 소진 또는 키 거부")
    if status != 200 or not data:
        return []
    items = []
    for i, it in enumerate(data.get("items", [])):
        vid = (it.get("id") or {}).get("videoId")
        sn = it.get("snippet") or {}
        if not vid:
            continue
        thumbs = sn.get("thumbnails") or {}
        thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url")
        items.append({
            "type": "video",
            "title": sn.get("title", "").strip()[:300],
            "url": f"https://www.youtube.com/watch?v={vid}",   # 링크만 저장(재호스팅 X)
            "thumb_key": thumb,                                 # 공식 썸네일 핫링크 URL
            "source": sn.get("channelTitle"),
            "rank": i,
        })
    return items


def fetch_books(query):
    status, data = http_json(GOOGLE_BOOKS, {
        "q": query,
        "maxResults": PER_TARGET,
        "langRestrict": "ko",
        "country": "KR",
        "printType": "books",
    })
    if status == 429:
        raise QuotaExceeded("Google Books 속도 제한")
    if status != 200 or not data:
        return []
    items = []
    for i, it in enumerate(data.get("items", [])):
        vi = it.get("volumeInfo") or {}
        link = vi.get("infoLink") or vi.get("canonicalVolumeLink")
        if not link:
            continue
        authors = vi.get("authors") or []
        items.append({
            "type": "book",
            "title": (vi.get("title") or "").strip()[:300],
            "url": link,
            "thumb_key": (vi.get("imageLinks") or {}).get("thumbnail"),
            "source": authors[0] if authors else vi.get("publisher"),
            "rank": i,
        })
    return [i for i in items if i["title"]]


# --- 적재 ---------------------------------------------------------------------

def upsert(rows, base_url, service_key):
    """PostgREST verse_media 로 upsert. (verse_ref,url) 유니크 제약 필요(마이그레이션 0002)."""
    if not rows:
        return 0
    url = f"{base_url.rstrip('/')}/rest/v1/verse_media?on_conflict=verse_ref,url"
    body = json.dumps(rows, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            if r.status not in (200, 201, 204):
                print(f"[warn] 적재 응답 {r.status}", file=sys.stderr)
                return 0
            return len(rows)
    except urllib.error.HTTPError as e:
        print(f"[warn] 적재 실패 HTTP {e.code} — {e.read().decode('utf-8', 'replace')[:200]}", file=sys.stderr)
        return 0
    except Exception as e:
        print(f"[warn] 적재 실패 — {e}", file=sys.stderr)
        return 0


# --- 메인 ---------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["video", "book", "both"], default="both")
    ap.add_argument("--book", help="대상 book_en (생략 시 전체)")
    ap.add_argument("--limit", type=int, default=20, help="이번 실행에서 처리할 대상 수(모드별)")
    ap.add_argument("--commit", action="store_true", help="verse_media 에 실제 적재(기본은 dry-run)")
    ap.add_argument("--reset-checkpoint", action="store_true", help="진행 위치 초기화 후 종료")
    args = ap.parse_args()

    if args.reset_checkpoint:
        if os.path.exists(CHECKPOINT):
            os.remove(CHECKPOINT)
        print("[done] checkpoint 초기화")
        return 0

    books = load_books()
    if args.book:
        books = [b for b in books if b["book_en"] == args.book]
    if not books:
        print("[warn] 대상 책 없음")
        return 1

    yt_key = os.environ.get("YOUTUBE_API_KEY")
    base_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")

    if args.commit and not (base_url and service_key):
        print("[warn] SUPABASE_URL/SUPABASE_SERVICE_KEY 미설정 — --commit 무시하고 dry-run")
        args.commit = False

    modes = ["video", "book"] if args.mode == "both" else [args.mode]
    cp = load_checkpoint()
    total_fetched = total_saved = 0
    warnings = 0

    for mode in modes:
        if mode == "video" and not yt_key:
            print("[warn] YOUTUBE_API_KEY 미설정 — 영상 수집 건너뜀")
            warnings += 1
            continue

        targets = video_targets(books) if mode == "video" else book_targets(books)
        # 책 필터를 준 실행은 전체 진행 위치를 건드리지 않는다(부분 재수집 용도).
        cp_key = f"{mode}:{args.book}" if args.book else mode
        start = int(cp.get(cp_key, 0)) % max(len(targets), 1)
        slice_ = targets[start:start + args.limit]

        print(f"[info] {mode}: 대상 {len(targets)}개 중 {start}~{start + len(slice_)} 처리"
              f"{'' if args.commit else ' (dry-run)'}")

        processed = 0
        for ref, query in slice_:
            try:
                items = fetch_videos(query, yt_key) if mode == "video" else fetch_books(query)
            except QuotaExceeded as e:
                print(f"[warn] {e} — 여기까지 진행하고 중단(다음 실행에서 이어서)")
                warnings += 1
                break

            total_fetched += len(items)
            processed += 1
            rows = [dict(it, verse_ref=ref) for it in items]

            if args.commit:
                total_saved += upsert(rows, base_url, service_key)
            else:
                for it in items:
                    print(f"[would-save] {ref} [{it['type']}] {it['title'][:60]} — {it['source'] or '?'}")
            time.sleep(REQUEST_PAUSE)

        cp[cp_key] = (start + processed) % max(len(targets), 1)

    save_checkpoint(cp)
    tag = "적재" if args.commit else "dry-run"
    print(f"[done] verse-media: 수집 {total_fetched}건 / {tag} {total_saved}건"
          f"{f' / 경고 {warnings}건' if warnings else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
