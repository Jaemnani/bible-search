# 구절 미디어 크롤러 (설교영상·책)

`auction/crawler` 패턴 재사용(오케스트레이터 + Discord notify + cron). 구절별로 설교영상·책을
수집해 NAS의 `verse_media` 테이블에 적재한다. **수집 소스는 전부 무료다.**

| 종류 | 소스 | 비용 | 수집 단위 |
|---|---|---|---|
| 설교영상 | YouTube Data API v3 | 무료 쿼터 10,000 unit/일 (`search.list`=100 → **하루 100회**) | **장** (`John:3`) — 1,182개 |
| 책 | Google Books API | 무료·**키 불필요** | **권** (`John`) — 63개 |

## 왜 절 단위가 아닌가

절은 30,944개다. 무료 쿼터로 절마다 검색하면 한 바퀴에 약 1년이 걸린다.
장 단위(1,182개)면 하루 80~100장씩 **약 12~15일**이면 전체를 채우고, 책은 권 단위라 하루면 끝난다.
웹 API(`/api/verse-media`)가 **절 → 장 → 권** 순으로 되짚어 조회하므로 사용자에게는 모든 절에서 결과가 보인다.
특정 절만 따로 큐레이션하고 싶으면 `verse_ref` 를 `John:3:16` 형태로 직접 넣으면 절 결과가 맨 위에 온다.

## 구성
- `run.sh` — 오케스트레이터: .env 자체 로드, 시작/종료 Discord 1건, EXIT trap 요약(성공/실패/크래시).
- `fetch_verse_media.py` — 수집 본체. **기본은 dry-run**, `--commit` 을 줘야 적재한다.
- `lib/notify.sh` — Discord webhook(docs 05): no-op 가드·truncate·digest.
- `install_cron.sh` — 매일 04:00 cron 등록 (`--limit 80 --commit`).
- `data/checkpoint.json` — 모드별 진행 위치(gitignore). 매 실행이 이어서 진행하고, 한 바퀴 돌면 처음으로 돌아간다.

## 실행
```bash
cp .env.example .env        # YOUTUBE_API_KEY / SUPABASE_* 채우기

python3 fetch_verse_media.py --mode book  --limit 5             # dry-run: 뭘 저장할지만 출력
python3 fetch_verse_media.py --mode video --limit 20 --commit   # 실제 적재
python3 fetch_verse_media.py --book John --mode video --commit  # 특정 책만(진행 위치 분리)
python3 fetch_verse_media.py --reset-checkpoint                 # 처음부터 다시

bash run.sh --limit 80 --commit                                 # cron 과 동일 경로
DISCORD_WEBHOOK_URL=<url> bash lib/notify.sh test               # 알림 단독 테스트
```

> 적재 전 **`backend/migrations/0002_verse_media_unique.sql` 이 적용돼 있어야 한다** —
> upsert(`on_conflict=verse_ref,url`)가 `(verse_ref, url)` 유니크 제약을 요구한다.

## 저작권
- 영상은 **링크·메타데이터만** 저장한다. 영상 파일을 내려받거나 재호스팅하지 않는다.
- 썸네일은 공식 URL을 **핫링크**한다(`i.ytimg.com` / `books.google.com`). MinIO 에 복사하지 않는다.
- 책은 Google Books 의 `infoLink` 로 연결하고 저자/출판사를 출처로 표기한다.

## 남은 것
- 쿼터 정밀 배분(현재는 `--limit` 로 단순 제한) + 실패 대상 재시도 큐.
- 알라딘 등 국내 서점 API(제휴 링크) 추가 — TTB 키 발급 필요.
- 수집 품질 필터(설교가 아닌 영상 걸러내기, 채널 화이트리스트).
