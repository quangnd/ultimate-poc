#!/bin/bash
# Start one EXP-12 arm preview by hand (approved method 1a). Usage: start-arm.sh <label> <worktree> <port>
# Same environment as the instance tool's previewEnv, minus ULTIMATE_MODEL; network flag as on the host.
set -eu
LABEL=$1; WT=$2; PORT=$3
H=/tmp/exp12/runs/$LABEL
[ -e "$H" ] && { echo "home $H exists"; exit 1; }
mkdir -p "$H/user/.ultimate"
for n in model-families.json trust.json onboarding.json agents; do cp -RL ~/.ultimate/$n "$H/user/.ultimate/"; done
ln -s ~/.ultimate/extensions "$H/user/.ultimate/extensions"
printf '{\n  "summaryModel": "github-copilot/claude-sonnet-5.5",\n  "extensions": { "enable": [] }\n}\n' > "$H/user/.ultimate/settings.json"
cd /Users/mun/Projects/ultimate
env -u ULTIMATE_SUPERVISED -u ULTIMATE_PUBLIC_URL -u ULTIMATE_GENERATION -u ULTIMATE_PREVIOUS_BUILD \
  -u ULTIMATE_MODEL -u ULTIMATE_CLOUD_URL -u ULTIMATE_CLOUD_TOKEN -u ULTIMATE_CLOUD_MACHINE \
  ULTIMATE_HOME="$H" ULTIMATE_USER_HOME="$H/user" ULTIMATE_PROJECT="$WT" ULTIMATE_PORT="$PORT" ULTIMATE_NO_OPEN=1 \
  ULTIMATE_INSTANCE_OWNER="$PPID_OWNER" \
  nohup node --network-family-autoselection-attempt-timeout=2000 server/main.ts > "$H.log" 2>&1 &
PID=$!
echo "$PID" > "$H.pid"
echo "$(date -u +%FT%TZ) start label=$LABEL pid=$PID port=$PORT home=$H worktree=$WT head=$(git -C "$WT" rev-parse --short HEAD)" >> /tmp/exp12/runs/ledger.txt
