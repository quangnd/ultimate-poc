#!/bin/bash
# EXP-10 Pi arm: fresh clone at BASE, build (Sonnet 5.5 xhigh), review (GPT-6.1 medium, read-only findings), fix (Sonnet 5.5 xhigh).
set -u
H=/tmp/rrlh10.iQJ4fq
BASE=$(cat $H/BASE_SHA)
TASKMD=$H/TASK.md
OUT=$H/out/pi
mkdir -p $OUT
BUILDER=github-copilot/claude-sonnet-5.5:xhigh
REVIEWER=openai-codex/gpt-6.1-sol:medium
date -u +%s > $OUT/ts0
D=$(mktemp -d /tmp/rrl10-pi.XXXXXX)
echo "clone=$D" > $OUT/meta.txt
git clone -q https://github.com/quangnd/ultimate-poc.git $D/repo 2>>$OUT/meta.txt || git clone -q /Users/mun/Projects/ultimate-poc $D/repo
cd $D/repo && git checkout -q -b exp10-pi $BASE && git log --oneline -1 >> $OUT/meta.txt
(npm ci --no-audit --no-fund > $OUT/npm-ci.log 2>&1); echo "npm_ci_exit=$?" >> $OUT/meta.txt
TASK=$(cat $TASKMD)
date -u +%s > $OUT/t0
pi -p --no-session --mode json --model $BUILDER "$TASK" > $OUT/build.jsonl 2> $OUT/build.err
echo "build_exit=$?" >> $OUT/meta.txt
date -u +%s > $OUT/t1
git add -A >/dev/null 2>&1; git -c user.name=exp10 -c user.email=exp10@invalid commit -qm "exp10 pi build snapshot" >/dev/null 2>&1
git rev-parse HEAD > $OUT/build_sha
REVIEW="You are a code reviewer. Another agent implemented the task below in this repository, starting from commit $BASE. Review its work read-only: inspect \`git diff $BASE..HEAD\` and \`git log $BASE..HEAD\`, read the code and run the checks you need (\`npm run typecheck\`, \`npm test\`; for \`npm run test:e2e\` use your own ports, e.g. \`WEB_PORT=5473 API_PORT=5474 npm run test:e2e\`). Do NOT modify, create or commit any file. Judge the work against every acceptance criterion of the task. Reply with a verdict (approve or request changes) and a numbered list of concrete findings, each with its severity (blocking, medium, low), the criterion it violates, file:line evidence and the fix you expect. Say 'No findings' if there are none.

--- TASK ---
$TASK"
pi -p --no-session --mode json --model $REVIEWER "$REVIEW" > $OUT/review.jsonl 2> $OUT/review.err
echo "review_exit=$?" >> $OUT/meta.txt
date -u +%s > $OUT/t2
node $H/tools/lasttext.mjs $OUT/review.jsonl > $OUT/findings.md
git status --porcelain > $OUT/review-dirty.txt
FIX="$TASK

---
You (or another agent) already implemented the task above in this repository (see \`git diff $BASE..HEAD\`). An independent reviewer reviewed that work against the acceptance criteria. Its review, verbatim:

$(cat $OUT/findings.md)

Fix every finding that is correct, make sure \`npm run typecheck\`, \`npm test\` and \`npm run test:e2e\` (with your own ports) pass, and commit the result on the current branch. If you judge a finding wrong, leave it and say why."
date -u +%s > $OUT/t3
pi -p --no-session --mode json --model $BUILDER "$FIX" > $OUT/fix.jsonl 2> $OUT/fix.err
echo "fix_exit=$?" >> $OUT/meta.txt
date -u +%s > $OUT/t4
git add -A >/dev/null 2>&1; git -c user.name=exp10 -c user.email=exp10@invalid commit -qm "exp10 pi fix snapshot" >/dev/null 2>&1
git rev-parse HEAD > $OUT/final_sha
echo "repo=$D/repo" >> $OUT/meta.txt
echo DONE >> $OUT/meta.txt
