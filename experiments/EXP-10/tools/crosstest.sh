#!/bin/bash
# Run test files from one arm's commit against another arm's commit. Usage: crosstest.sh <src-repo> <src-sha> <arm-repo> <arm-sha> <label> <file>...
set -u
SR=$1; SS=$2; AR=$3; AS=$4; L=$5; shift 5
H=/tmp/rrlh10.iQJ4fq
NM=/Users/mun/.ultimate/projects/ultimate-poc-a1e52e44/worktrees/16926/node_modules
W=$(mktemp -d /tmp/rrl10-x.XXXXXX)
git -C $AR worktree add -q --detach $W $AS
ln -s $NM $W/node_modules
for f in "$@"; do mkdir -p $W/$(dirname $f); git -C $SR show $SS:$f > $W/$f; done
cd $W
UNIT=(); E2E=()
for f in "$@"; do case $f in e2e/*) E2E+=($f);; *) UNIT+=($f);; esac; done
if [ ${#UNIT[@]} -gt 0 ]; then npx vitest run "${UNIT[@]}" > $H/grades/x-$L-unit.log 2>&1; echo "$L unit exit=$? $(sed 's/\x1b\[[0-9;]*m//g' $H/grades/x-$L-unit.log | grep -E '^ +Tests ')"; sed 's/\x1b\[[0-9;]*m//g' $H/grades/x-$L-unit.log | grep -E "^ +(×|✗)|FAIL .*>" | head -8; fi
if [ ${#E2E[@]} -gt 0 ]; then
  ( eval "$(node -e 'const n=require("node:net"),f=()=>new Promise(r=>{const s=n.createServer().listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>r(p))})});Promise.all([f(),f()]).then(([w,a])=>console.log(`export WEB_PORT=${w} API_PORT=${a}`))')"; npx playwright test "${E2E[@]}" > $H/grades/x-$L-e2e.log 2>&1; echo "$L e2e exit=$?" )
  sed 's/\x1b\[[0-9;]*m//g' $H/grades/x-$L-e2e.log | grep -E "passed|failed|✘|Error:" | head -6
fi
cd /; git -C $AR worktree remove --force $W
