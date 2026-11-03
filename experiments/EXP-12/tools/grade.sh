#!/bin/bash
# Grade one commit: hidden suite, then typecheck, npm test and e2e on own ports. Usage: grade.sh <sha> <task-n> <label> <webport> <apiport>
set -u
SHA=$1; N=$2; LABEL=$3; WP=$4; AP=$5
OUT=/tmp/exp12/grades/$LABEL; rm -rf $OUT; mkdir -p $OUT
W=$(mktemp -d /tmp/exp12-grade.XXXXXX)
git -C /Users/mun/Projects/ultimate-poc worktree add -q --detach $W $SHA
ln -s /Users/mun/.ultimate/projects/ultimate-poc-a1e52e44/worktrees/19308/node_modules $W/node_modules
mkdir -p $W/tests/hidden && cp /tmp/exp12/task$N/hidden.test.ts $W/tests/hidden/
cd $W
npx vitest run tests/hidden > $OUT/hidden.log 2>&1; echo "hidden_exit=$?" > $OUT/result.txt
sed 's/\x1b\[[0-9;]*m//g' $OUT/hidden.log | grep -E "^ +Tests |^ +(×|✗)" >> $OUT/result.txt
rm -rf tests/hidden
npm run typecheck > $OUT/typecheck.log 2>&1; echo "typecheck_exit=$?" >> $OUT/result.txt
npx vitest run > $OUT/test.log 2>&1; echo "test_exit=$?" >> $OUT/result.txt
sed 's/\x1b\[[0-9;]*m//g' $OUT/test.log | grep -E "^ +Tests " >> $OUT/result.txt
WEB_PORT=$WP API_PORT=$AP npm run test:e2e > $OUT/e2e.log 2>&1; echo "e2e_exit=$?" >> $OUT/result.txt
sed 's/\x1b\[[0-9;]*m//g' $OUT/e2e.log | grep -E "passed|failed" | tail -2 >> $OUT/result.txt
cd /; git -C /Users/mun/Projects/ultimate-poc worktree remove --force $W
cat $OUT/result.txt
