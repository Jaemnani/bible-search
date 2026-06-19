# 구절 미디어 크롤러 (설교영상·책) — 껍데기

`auction/crawler` 패턴 재사용(오케스트레이터 + Discord notify + cron). 구절별로 설교영상·책을
수집해 NAS의 `verse_media` 테이블에 적재한다. **현재는 dry-run 스텁** — 실제 외부 수집은 P5-core.

## 구성
- `run.sh` — 오케스트레이터: .env 자체 로드, 시작/종료 Discord 1건, EXIT trap 요약(성공/실패/크래시).
- `fetch_verse_media.py` — 수집 본체(현재 dry-run: 대상 절을 `[would-fetch]` 로 표시).
- `lib/notify.sh` — Discord webhook(docs 05): no-op 가드·truncate·digest.
- `install_cron.sh` — 매일 04:00 cron 등록.

## 실행
```bash
cp .env.example .env        # 키 채우기(현재 비워도 dry-run 동작)
bash run.sh --limit 20      # dry-run: 대상 절 표시 + (Discord 설정 시) 요약 전송
DISCORD_WEBHOOK_URL=<url> bash lib/notify.sh test   # 알림 단독 테스트
```

## TODO (P5-core)
- **YouTube Data API v3**: 구절/주제 검색 → 상위 N개. 쿼터(기본 1만 unit/일) 배분(증분·step/drain).
  **영상은 링크/메타만 저장**, 썸네일은 공식 URL **핫링크**(재호스팅 = ToS 위반).
- **책 추천**: 알라딘/구글북스 등 API(제휴·출처 표기).
- **적재**: PostgREST `verse_media` upsert (`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`, RLS 우회).
- 웹 `/api/verse-media` 가 적재된 데이터를 조회하도록 코어 연결(현재 coming_soon).
