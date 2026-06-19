#!/usr/bin/env bash
# 구절별 설교영상·책 크롤 오케스트레이터 (docs/05·06 패턴).
# 시작/종료 Discord 1건씩, EXIT trap 으로 성공·실패·크래시 모두 요약.
#   bash run.sh [--book Genesis] [--limit 50]
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
[ -f .env ] && set -a && . ./.env && set +a   # .env 자체 로드(cron 무수정)
. lib/notify.sh

mkdir -p data
LOG="data/run.log"
: > "$LOG"
START=$(date +%s)

# 종료 경로 단일화 — 정상/조기종료/크래시 모두 요약 1건
finish() { local rc=$?; discord_digest "$LOG" "$rc" "$(( $(date +%s) - START ))" "구절 미디어 크롤"; }
trap finish EXIT

discord_send "▶ 구절 미디어 크롤 시작 ($(hostname 2>/dev/null || echo ?))"

# 실제 수집(YouTube/책 → verse_media 적재)은 fetch_verse_media.py 가 담당(현재 dry-run 스텁).
python3 fetch_verse_media.py "$@" 2>&1 | tee -a "$LOG"
exit "${PIPESTATUS[0]}"
