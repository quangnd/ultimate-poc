#!/bin/bash
# Post hoc: run an Ultimate QA spec (from its commit) against another arm's commit. Usage: crossqa.sh <qa-repo> <qa-sha> <qa-file> <arm-repo> <arm-sha> <label>
set -u
QR=$1; QS=$2; QF=$3; AR=$4; AS=$5; L=$6
W=$(mktemp -d /tmp/rrl-xqa.XXXXXX)
git -C $AR worktree add -q --detach $W $AS
ln -s /Users/mun/.ultimate/projects/ultimate-poc-a1e52e44/worktrees/13171/node_modules $W/node_modules
mkdir -p $W/tests/qa && git -C $QR show $QS:$QF > $W/$QF
cd $W && npx vitest run $QF > /tmp/rrlh.JUW9WT/grades/xqa-$L.log 2>&1; echo "$L exit=$? $(grep -E 'Tests ' /tmp/rrlh.JUW9WT/grades/xqa-$L.log | sed 's/\x1b\[[0-9;]*m//g')"
grep -E "FAIL .*>" /tmp/rrlh.JUW9WT/grades/xqa-$L.log | sed 's/\x1b\[[0-9;]*m//g' | head -5
cd /; git -C $AR worktree remove --force $W
