# Claude instructions for Shared Garden

Read and follow [AGENTS.md](AGENTS.md) before any planning, implementation, or
review. It is the canonical detailed operating procedure for this repository.
This summary does not replace it.

- The main agent orchestrates: clarify design with the user, record approved
  decisions, write atomic GitHub issues before assigning builders, dispatch
  independent reviews, manage revisions, merge eligible PRs, and clean up.
- Each issue states the user outcome, scope/exclusions, approved design
  references, dependencies, acceptance criteria, and appropriate verification.
  [Decision 0004](docs/decisions/0004-finalized-launch-rules.md) authorizes
  documented conservative design/implementation choices within its launch
  boundaries during the unattended build. Record these choices in versioned
  decisions and affected issues. Mark unresolved choices outside that discretion
  blocked; builders escalate them to the orchestrator. Conflicts, required
  credentials/account actions, unapproved costs, and material scope/privacy
  changes still require escalation. Settled/routine details need no repeated
  approval. This discretion does not waive any workflow gate below.
- Give each issue a dedicated builder, issue-numbered branch, and isolated
  worktree based on the current default branch. Never edit the default branch or
  share a writable checkout. Parallel builds require independent issues;
  dependent issues wait for prerequisites to merge.
- Builders read guidance, implement only issue scope, verify, push, and open one
  PR per atomic feature with `Closes #N`. Return issue/PR URLs, worktree, branch,
  base/head SHAs, validation evidence, and limitations. Builders cannot
  self-approve or merge.
- After implementation, spawn a fresh reviewer with `fork_turns: "none"`. Supply
  the approved issue/spec, repository/worktree, PR, base/head SHAs, and check
  commands. The reviewer independently examines the actual diff and context,
  verifies criteria and checks, and returns `APPROVE` or `REQUEST_CHANGES` for
  the exact reviewed SHA with actionable file/line findings. It does not fix code.
- Record review verdicts and evidence on GitHub. If a shared account prevents a
  formal self-review, use an explicitly labeled **Independent-agent review**
  comment. Do not impersonate another identity or bypass required protections.
- Send findings to the original builder on the same branch. Repeat verification
  and fresh independent review, rechecking prior findings and regressions. Any
  change to an approved PR head invalidates approval and needs a new review.
- Merge only when criteria are met, the current head is independently approved,
  findings are resolved, required checks pass for the merge candidate,
  dependencies are merged, and mergeability and protections permit it.
  Update/revalidate when needed. Never waive failing checks or force-push the
  default branch. Standing user authorization permits qualifying merges and
  deletion of merged feature branches without repeated routine permission;
  repository and external approval requirements still apply.
- Confirm PR merge state, resulting commit, and issue closure; close the issue
  with a merge reference if needed. Delete only the confirmed merged remote
  branch after checking for added work. Remove local branch/worktree only after
  checking for uncommitted or unpushed work. Preserve unrelated user changes and
  report issue, PR, merge, checks, and cleanup status honestly.
- Continue unrelated approved work while awaiting design answers. Keep the
  issue/PR trail sufficient for another orchestrator to resume.
- This repository is public, while the application has a fixed two-person
  private scope. Preserve that scope and approved rules. Never publish
  credentials, personal account details, production private content, or the
  private source brief. Publish only sanitized requirements and approved
  decisions; proposed or conflicting rules are not final.

For documentation-only changes, verify criteria, references, consistency, and
diff scope. Application tests are not required; report that they were not run.
