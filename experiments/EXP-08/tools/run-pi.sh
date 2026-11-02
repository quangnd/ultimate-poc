#!/bin/bash
# EXP-08 Pi arm: fresh clone at BASE, pi build pass, pi self-review-and-fix pass. Usage: run-pi.sh <task-n>
set -u
N=$1
H=/tmp/rrlh.JUW9WT
BASE=$(cat $H/BASE_SHA)
TASKMD=/Users/mun/.ultimate/projects/ultimate-poc-a1e52e44/worktrees/13171/experiments/EXP-08/task-$N/TASK.md
OUT=$H/out/task$N-pi
mkdir -p $OUT
D=$(mktemp -d /tmp/rrl-pi-t$N.XXXXXX)
echo "clone=$D" > $OUT/meta.txt
git clone -q https://github.com/quangnd/ultimate-poc.git $D/repo 2>>$OUT/meta.txt || git clone -q /Users/mun/Projects/ultimate-poc $D/repo
cd $D/repo && git checkout -q -b exp08-t$N-pi $BASE && git log --oneline -1 >> $OUT/meta.txt
(npm ci --no-audit --no-fund > $OUT/npm-ci.log 2>&1); echo "npm_ci_exit=$?" >> $OUT/meta.txt
TASK=$(cat $TASKMD)
REVIEW="$TASK

---
Another agent has already worked on the task above in this repository (compare with \`git diff $BASE\` and \`git log $BASE..HEAD\`; there may also be uncommitted changes). Review that work critically against every acceptance criterion above, look for defects and missing cases, fix what you find, make sure \`npm run typecheck\` and \`npm test\` pass, and commit the result on the current branch."
date -u +%s > $OUT/t0
pi -p --no-session --mode json --model anthropic/claude-opus-5-5:medium "$TASK" > $OUT/build.jsonl 2> $OUT/build.err
echo "build_exit=$?" >> $OUT/meta.txt
date -u +%s > $OUT/t1
git add -A >/dev/null 2>&1; git -c user.name=exp08 -c user.email=exp08@invalid commit -qm "exp08 pi build snapshot" >/dev/null 2>&1
git rev-parse HEAD > $OUT/build_sha
pi -p --no-session --mode json --model anthropic/claude-opus-5-5:medium "$REVIEW" > $OUT/review.jsonl 2> $OUT/review.err
echo "review_exit=$?" >> $OUT/meta.txt
date -u +%s > $OUT/t2
git add -A >/dev/null 2>&1; git -c user.name=exp08 -c user.email=exp08@invalid commit -qm "exp08 pi review snapshot" >/dev/null 2>&1
git rev-parse HEAD > $OUT/final_sha
echo "repo=$D/repo" >> $OUT/meta.txt
echo DONE >> $OUT/meta.txt
