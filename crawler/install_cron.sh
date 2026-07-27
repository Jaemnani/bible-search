#!/usr/bin/env bash
# 구절 미디어 크롤 cron 등록 (docs 06 패턴). run.sh 가 .env 를 자체 로드하므로 cron 라인은 단순.
#   bash install_cron.sh        # 등록
#   crontab -l                  # 확인
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 매일 04:00. 무료 YouTube 쿼터(10,000 unit/일 = search 100회)를 넘지 않도록 하루 80장씩만 진행.
LINE="0 4 * * * cd $SCRIPT_DIR && bash run.sh --limit 80 --commit >> data/cron.log 2>&1"
( crontab -l 2>/dev/null | grep -v "$SCRIPT_DIR/run.sh\|$SCRIPT_DIR && bash run.sh"; echo "$LINE" ) | crontab -
echo "등록됨: $LINE"
