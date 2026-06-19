#!/usr/bin/env bash
# Discord 크롤 알림 (docs/05-ops-notifications 패턴) — run.sh 가 source.
#   DISCORD_WEBHOOK_URL 미설정 시 모든 함수 no-op(기존 동작 불변).
#   discord_send <content>                        — 1건 POST
#   discord_digest <log> <rc> <elapsed_s> <label> — log 파싱 요약 발송
#   단독 테스트:  DISCORD_WEBHOOK_URL=<url> bash lib/notify.sh test
_DISCORD_MAX=1900

discord_send() {
  local content="$1"
  [ -n "${DISCORD_WEBHOOK_URL:-}" ] || return 0
  [ -n "$content" ] || return 0
  local payload
  payload=$(printf '%s' "$content" | python3 -c '
import json,sys
s=sys.stdin.read(); M='"$_DISCORD_MAX"'
if len(s)>M: s=s[:M]+"\n…(잘림)"
sys.stdout.write(json.dumps({"content":s}))' 2>/dev/null) || return 0
  [ -n "$payload" ] || return 0
  curl -sS --max-time 10 -H "Content-Type: application/json" -X POST "$DISCORD_WEBHOOK_URL" --data "$payload" >/dev/null 2>&1 || true
}

discord_digest() {
  local log="$1" rc="${2:-0}" elapsed="${3:-0}" label="${4:-구절 미디어 크롤}"
  [ -n "${DISCORD_WEBHOOK_URL:-}" ] || return 0
  local run_state has_warn=""
  [ -f "$log" ] && grep -q "\[warn\]" "$log" 2>/dev/null && has_warn=1
  if [ "$rc" -ne 0 ]; then run_state="❌ 실패 (exit $rc)"
  elif [ -n "$has_warn" ]; then run_state="⚠️ 완료 (경고)"
  else run_state="✅ 완료"; fi
  local mins=$(( elapsed / 60 )) host; host=$(hostname 2>/dev/null || echo "?")
  local steps=""; [ -f "$log" ] && steps=$(grep '^\[done\]' "$log" 2>/dev/null | sed 's/^\[done\] *//' || true)
  local warns=""; [ -f "$log" ] && warns=$(grep '\[warn\]' "$log" 2>/dev/null | sed 's/\(.\{180\}\).*/\1…/' || true)
  discord_send "**[$label] $run_state** · ${mins}분 · ${host}
${steps:-(요약 없음)}${warns:+
⚠️ $warns}"
}

# 단독 테스트
if [ "${1:-}" = "test" ]; then
  discord_send "🔔 notify.sh 테스트 — 연결 정상"
  echo "sent (DISCORD_WEBHOOK_URL ${DISCORD_WEBHOOK_URL:+설정됨})"
fi
