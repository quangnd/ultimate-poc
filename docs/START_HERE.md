# First Session in Ultimate

1. Clone the repository on the Mac and open it as an Ultimate project.
2. Read AGENTS.md, docs/PRD.md, docs/EVALUATION.md, docs/ROADMAP.md, and state/PROJECT_STATUS.md.
3. Do NOT code the application yet. First inspect Ultimate version and actual supported features, then write docs/ENVIRONMENT.md (exclude secrets and private home paths).
4. Propose stack/storage decisions as ADR-001 and scheduling assumptions as ADR-002.
5. Open a GitHub issue for P0 with measurable acceptance criteria, or write the issue contents for human creation if Github write access is missing.
6. Run a tiny neutral baseline task with plain Pi, then the same class of task in Ultimate; document both.
7. Update state/PROJECT_STATUS.md with verified results, links and next task.

## First prompt to paste into Ultimate
Read AGENTS.md and docs/START_HERE.md. Act as project coordinator. Start Phase P0 only: verify environment and Ultimate capabilities, produce an execution plan and ADR proposals, and identify unverified assumptions. Do not implement the product, alter extensions/skills, install new packages, or create subagents until I approve the P0 plan. Explain what evidence you will collect and how you will compare fairly against plain Pi.

## Operator workflow
The operator only sets goals, adjusts priorities, reviews phase deliverables and approves consequential changes. Once P0 plan is approved, coordinator can organize and run P0 without asking for every subtask. In each later phase, autonomous execution follows AGENTS.md approvals and blockers policy.

Use this prompt instead of the shorter first-session prompt if you want maximum delegation:

> Read AGENTS.md, docs/START_HERE.md and state/PROJECT_STATUS.md. You are the coordinator for this POC. I am Product Owner and will review outcomes and steer priorities, not assign individual tasks. Propose P0 scope, measurable tests, delegation strategy and evidence plan. Once I approve P0, execute its tasks autonomously, including ordinary coding, testing, fixes, documentation and issue updates. Stop for the stated approval gates only. At completion, present a concise gate-review package and recommendation for P1. Never claim completion without independently verified evidence.
