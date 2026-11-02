#!/bin/bash
# Grade one tree at one commit: hidden suite + typecheck + npm test, in a throwaway worktree. Usage: grade.sh <repo> <sha> <task-n> <label>
set -u
REPO=$1; SHA=$2; N=$3; LABEL=$4
H=/tmp/rrlh.JUW9WT
OUT=$H/grades/$LABEL; rm -rf $OUT; mkdir -p $OUT
W=$(mktemp -d /tmp/rrl-grade.XXXXXX)
git -C $REPO worktree add -q --detach $W $SHA
ln -s /Users/mun/.ultimate/projects/ultimate-poc-a1e52e44/worktrees/13171/node_modules $W/node_modules
mkdir -p $W/tests/hidden && cp $H/hidden/task$N.hidden.test.ts $W/tests/hidden/
cd $W
npx vitest run tests/hidden/task$N.hidden.test.ts > $OUT/hidden.log 2>&1; echo "hidden_exit=$?" > $OUT/result.txt
grep -E "Tests " $OUT/hidden.log | sed 's/\x1b\[[0-9;]*m//g' >> $OUT/result.txt
grep -E "^ *(×|✗)|FAIL .*>" $OUT/hidden.log | sed 's/\x1b\[[0-9;]*m//g' >> $OUT/result.txt
rm -rf tests/hidden
npm run typecheck > $OUT/typecheck.log 2>&1; echo "typecheck_exit=$?" >> $OUT/result.txt
npx vitest run > $OUT/test.log 2>&1; echo "test_exit=$?" >> $OUT/result.txt
grep -E "Tests |Test Files " $OUT/test.log | sed 's/\x1b\[[0-9;]*m//g' >> $OUT/result.txt
cd /; git -C $REPO worktree remove --force $W
cat $OUT/result.txt
