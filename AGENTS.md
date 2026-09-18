# Shared Garden agent operating procedure

This file is the canonical procedure for all agents working in this repository.
Read it before planning, implementing, or reviewing work. [CLAUDE.md](CLAUDE.md)
directs Claude sessions here and provides a concise summary of the same rules.

## Project boundaries and public information

Shared Garden is a fixed two-person private application. Preserve that scope and
the user's approved rules. Proposed or conflicting rules are not finalized.
This procedure does not select a technology stack, product rules, visual style,
hosting service, authentication design, notification channel, or launch scope.

The repository is public. Never commit credentials, personal account details,
production private content, or the private source brief. Publish only sanitized
requirements and approved decisions, including in issues, PRs, review comments,
validation evidence, and other public artifacts.

## Roles and design decisions

The main agent is the **orchestrator**. It clarifies design with the user, records
approved decisions, divides work into atomic features, writes GitHub issues,
dispatches builders and independent reviewers, manages corrections, merges
eligible PRs, and cleans up merged branches and worktrees.

Ask the user about product, interaction, visual, architectural, and other design
choices before implementing them. Record the answer in a versioned decision
document and the affected issues, with references between them. Keep the public
record sanitized. When approved decisions conflict or are incomplete, ask for
resolution instead of choosing silently. Routine implementation details that
follow approved design do not require repeated approval.

Builders escalate newly discovered design choices to the orchestrator. Mark the
affected work blocked in its issue, state the question and dependency, and wait
for the user's answer before implementing that choice. Continue unrelated,
approved work while an answer is pending.

## 1. Write an issue before assigning a builder

Create one GitHub issue for each atomic feature before implementation assignment.
Each issue must contain:

- **User outcome:** the concrete result the user should experience.
- **Scope and exclusions:** what this issue changes and deliberately leaves out.
- **Approved design references:** links to the approved, versioned decisions or
  specification; explicitly state when no design decision is needed.
- **Dependencies:** prerequisite issues or PRs, or an explicit statement of none.
- **Acceptance criteria:** observable conditions for completion.
- **Verification:** appropriate checks and commands, including manual checks or
  a reason application tests are not applicable.
- **Blocked choices, if any:** unresolved design questions and the work they
  prevent. Do not present a proposed answer as an approved decision.

Dependent issues wait until their prerequisites are merged. Parallel builds are
permitted only for independent issues, with a separate builder and writable
worktree for each. Keep issue status, decisions, dependencies, PR links, review
evidence, and outstanding findings current so another orchestrator can resume.

## 2. Build in an isolated worktree

Assign a dedicated builder agent to each issue. Give it the issue URL, approved
references, dependency status, repository guidance, and verification requirements.

The builder must:

1. Read repository guidance and the issue before editing. Confirm prerequisites
   are merged and the assigned work has sufficient approved design.
2. Fetch and identify the current default branch. Create an isolated git worktree
   and an issue-numbered branch from its current remote tip, such as
   `feat/12-garden-clock` or `docs/1-agent-workflow`. Record the base SHA. Never
   edit the default branch or share a writable checkout with another builder.
3. Implement only the issue's scope. Escalate new design choices rather than
   making them silently. Preserve unrelated user changes.
4. Perform the verification specified by the issue and any other checks needed
   for the change. Inspect the diff for unrelated changes and sensitive content.
   Record commands, outcomes, manual observations, and limitations honestly.
5. Commit and push the issue branch, then open one PR for that atomic feature
   against the default branch. Describe the final behavior and validation, and
   include `Closes #N` using the actual issue number.
6. Return the issue and PR URLs, worktree path, branch, base and head SHAs,
   validation evidence, and limitations to the orchestrator. Keep the worktree
   available for corrections and independent review.

A builder cannot self-approve or merge its own work.

## 3. Obtain a fresh independent review

After implementation, the orchestrator spawns a fresh reviewer with no inherited
builder conversation. Use `fork_turns: "none"` when spawning the reviewer.
Provide an explicit review packet containing:

- The approved issue/specification and versioned design references.
- The repository and worktree location, PR URL, and branch.
- The exact base and current PR head SHAs to review.
- Test/check commands, acceptance criteria, and known validation limitations.
- Prior review findings when reviewing a correction.

The reviewer independently inspects the actual diff and relevant repository
context, checks every acceptance criterion, and performs appropriate checks. It
does not rely on the builder's narrative as proof. It verifies that the checked
out files and diff correspond to the supplied SHAs; if the PR changes, it reports
that mismatch and reviews the updated candidate before giving approval. The
reviewer must not implement fixes or alter the builder's worktree.

The reviewer returns **APPROVE** or **REQUEST_CHANGES**, tied to the exact reviewed
head SHA, with its base SHA, check evidence, and limitations. Findings must be
actionable and identify the affected file and line, the problem, and the needed
correction. A review cannot approve unmet acceptance criteria or unverified
required checks.

Record the verdict, reviewed SHA, findings, and evidence on GitHub. If agents
share one GitHub account and GitHub disallows formal self-review, post an
explicitly labeled **Independent-agent review** comment containing that record.
Do not claim a different GitHub identity. Such a comment does not replace a
separate approval required by repository protection or external policy.

## 4. Correct and review again

On **REQUEST_CHANGES**, the orchestrator sends the actionable findings to the
original builder. The builder corrects them on the same issue branch and
worktree, reruns appropriate verification, pushes the update, and returns the new
head SHA and evidence.

Spawn a fresh independent reviewer with `fork_turns: "none"` for the new head.
Include prior findings; the reviewer must recheck their resolution and possible
regressions as well as the acceptance criteria. Repeat correction and independent
review until approved. Any change to the PR head after approval, including a code
change or an update from the default branch, invalidates that approval and
requires review of the new SHA. Record each verdict and its evidence on GitHub.

## 5. Merge only an eligible candidate

The user's instruction is standing authorization for the orchestrator to merge
qualifying PRs and delete merged feature branches. Do not ask for routine merge
permission repeatedly. This authorization cannot bypass repository protection
or external approval requirements.

Immediately before merging, the orchestrator verifies all of the following:

- All acceptance criteria are met and review findings are resolved.
- The current PR head has independent approval for that exact SHA.
- All required checks pass, and their results apply to the merge candidate.
- Dependencies are merged.
- The PR is mergeable, and repository protections and required external
  approvals permit the merge.

If the base or candidate changes, determine which checks need to be rerun and
update/revalidate as needed. A changed head also requires fresh independent
review. Resolve conflicts through the builder's issue branch and repeat the
verification/review cycle. Never waive failing checks, bypass protections, or
force-push the default branch. If a gate cannot be satisfied, report the blocker
and continue other eligible work.

## 6. Confirm merge and clean up safely

After the merge operation, the orchestrator must:

1. Verify GitHub reports the PR as merged and verify the resulting commit is
   present in the default branch history. Record the merge commit/reference.
2. Verify the linked issue is closed. If automatic closure did not occur, close
   it with a reference to the confirmed merge.
3. Remove only the remote feature branch belonging to the confirmed merged PR.
   Check that its tip has not advanced with additional work before deleting it.
4. Inspect the local worktree and branch for uncommitted and unpushed work before
   removing either. Account for squash or rebase merges when comparing history;
   establish that the branch's work is represented in the merged PR. Preserve
   unrelated user changes and any work not included in the merge. If cleanup is
   unsafe or uncertain, retain those resources and report why.
5. Report the issue URL and closure state, PR URL and merge state, resulting
   commit, reviewed head, check results, and remote/local branch and worktree
   cleanup status. Distinguish completed actions from remaining blockers.

## Documentation-only verification

For changes limited to operating documentation, check the files against the
issue's criteria, verify local references and consistency, and inspect the diff
for unrelated files or private content. Application tests are not required when
the issue and the actual change are documentation-only; record that limitation
instead of claiming tests ran.
