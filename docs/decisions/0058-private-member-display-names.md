# Private member display names

Status: approved user request, with conservative configuration and wording
choices under [0004](0004-finalized-launch-rules.md).
Source: [Issue #142](https://github.com/C0derTang/shared-garden/issues/142).
Depends on [reply threads](0057-partner-entry-replies.md), implemented in #141.

Each verified member sees the other member's configured first name wherever the
interface previously used Partner or Your partner. Self labels remain You
(lowercase you within a sentence). This includes current entries, their replies,
history, care counts and notices, accessible cues, song authors, memories,
Peony and wish attribution, and forms. The guide uses the same flower sheets.

Server-only environment settings `GARDEN_MEMBER_1_NAME` and
`GARDEN_MEMBER_2_NAME` correspond to the immutable slots in
[0006](0006-fixed-identity-boundary.md). Operators configure actual values
privately in the deployment environment and redeploy; no actual values belong
in source control, examples, issues, logs, or screenshots. No database migration
or membership change is needed. The names never authorize actions, derive from
OAuth metadata, or replace existing identity checks.

The dynamic member layout verifies membership before reading either setting.
It sends only the viewer's opposite-slot safe name through the authenticated
React provider, so public routes and static client bundles contain no configured
names. Existing per-page and action membership checks remain unchanged.

Names retain spelling and capitalization after trimming ordinary outside spaces.
Allow 1–60 UTF-16 code units containing Unicode letters/marks, ordinary spaces,
apostrophes, hyphens, or periods, with at least one letter. Missing, blank,
long, control-containing, markup, URL, and email-like values fall back to the
existing generic wording without blocking the garden. Rendering remains escaped
React text. Narrow care labels wrap rather than forcing horizontal scrolling.
Only the operator may change these private settings; there is no profile editor.

## Possessive wording

[Issue #145](https://github.com/C0derTang/shared-garden/issues/145) records the
user's explicit rule: wherever a configured name expresses ownership, append
one ASCII apostrophe followed by s, including names ending in s (`Avery's`,
`James's`). The shared display-name helper supplies this form for visible care
headings, the care-dot legend, and live-update accessibility labels. Missing-name
fallbacks use `Your partner's` or `your partner's` as appropriate. Subject, object,
and standalone author labels remain unchanged. This presentation rule does not
change private name configuration, authentication, or user-authored content.
