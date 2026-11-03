#!/bin/bash
# Grade one tree at one commit: hidden suite, typecheck, npm test, optionally e2e (own ports). Usage: grade.sh <repo> <sha> <label> [e2e]
set -u
REPO=$1; SHA=$2; LABEL=$3; E2E=${4:-}
H=/tmp/rrlh10.iQJ4fq
NM=/Users/mun/.ultimate/projects/ultimate-poc-a1e52e44/worktrees/16926/node_modules
OUT=$H/grades/$LABEL; rm -rf $OUT; mkdir -p $OUT
W=$(mktemp -d /tmp/rrl10-grade.XXXXXX)
git -C $REPO worktree add -q --detach $W $SHA
ln -s $NM $W/node_modules
mkdir -p $W/tests/hidden && cp $H/hidden/diff.hidden.test.ts $W/tests/hidden/
cd $W
echo "label=$LABEL sha=$SHA" > $OUT/result.txt
npx vitest run tests/hidden > $OUT/hidden.log 2>&1; echo "hidden_exit=$?" >> $OUT/result.txt
sed 's/\x1b\[[0-9;]*m//g' $OUT/hidden.log | grep -E "^ +Tests |^ +(×|✗)| FAIL .*>" >> $OUT/result.txt
rm -rf tests/hidden
npm run typecheck > $OUT/typecheck.log 2>&1; echo "typecheck_exit=$?" >> $OUT/result.txt
npx vitest run > $OUT/test.log 2>&1; echo "test_exit=$?" >> $OUT/result.txt
sed 's/\x1b\[[0-9;]*m//g' $OUT/test.log | grep -E "^ +Tests |^ +Test Files " >> $OUT/result.txt
if [ "$E2E" = e2e ]; then
  ( eval "$(node -e 'const n=require("node:net"),f=()=>new Promise(r=>{const s=n.createServer().listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>r(p))})});Promise.all([f(),f()]).then(([w,a])=>console.log(`export WEB_PORT=${w} API_PORT=${a}`))')"; npm run test:e2e > $OUT/e2e.log 2>&1; echo "e2e_exit=$? ports=$WEB_PORT/$API_PORT" >> $OUT/result.txt )
  sed 's/\x1b\[[0-9;]*m//g' $OUT/e2e.log | grep -E "passed|failed|flaky" | tail -3 >> $OUT/result.txt
fi
cd /; git -C $REPO worktree remove --force $W
cat $OUT/result.txt
