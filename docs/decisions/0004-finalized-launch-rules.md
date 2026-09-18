# Finalized launch rules and unattended build boundaries

Status: approved launch specification; no design choice blocks implementation
within the boundaries below.

Source: [Issue #15](https://github.com/C0derTang/shared-garden/issues/15).
This extends [record 0001](0001-approved-garden-rules.md),
[record 0002](0002-progression-and-mobile-garden.md), and
[record 0003](0003-supabase-and-access.md) for Shared Garden's fixed two-person
private scope. It supersedes their open-choice summaries where this record
settles a rule and removes the previously assumed overall active-flower cap.
All per-type limits remain. Earlier records retain their decision history;
this record governs any overlapping launch rule. Follow
[AGENTS.md](../../AGENTS.md) and [CLAUDE.md](../../CLAUDE.md) for implementation,
review, and merge gates.

## Flower catalog, capacity, and progression

| Type | Action | Growth units to bloom | Concurrent unbloomed limit |
| --- | --- | ---: | --- |
| Rose | Note about today | 5 | 3 |
| Cactus | One-tap check-in | 10 | One permanent plant |
| Tulip | Share a song | 7 | 1 |
| Marigold | Compliment or appreciation | 5 | 2 |
| Daisy | Answer the shared daily question | 7 | 1 |
| Hydrangea | Choose a mood color | 7 | 1 |
| Sunflower | Share one photo | 7 | 1 |
| Snapdragon | Honest check-in | 5 | 1 |
| Moonflower | Late-night thought | 5 | 1 |
| Bluebell | Voice memo | 7 | 1 |
| Dandelion | Add a detail to its shared wish | 5 | 3 |
| Forget-me-not | Shared memory | 10 | 1 |
| Peony | Complete four ordered shared milestones | 4 | 1 |

There is no overall active-flower cap. Either person may plant within the
per-type limits. Initialization creates one permanent Cactus, and there can
never be additional Cacti. Every bloom retains its planting spot and history.
The first release has no flower removal or archiving. Beds expand automatically
as space fills, allowing continued planting within the per-type limits.

Rose, Cactus, Tulip, and Marigold are initially available. The existing unlock
order remains: total blooms 1–9 unlock Daisy, Hydrangea, Sunflower, Snapdragon,
Moonflower, Bluebell, Dandelion, Forget-me-not, and Peony respectively. All 13
types are available after nine total blooms. A flower's first bloom counts
once; Cactus never re-blooms or supplies additional bloom credit.

## Garden day, submissions, and growth

Use `America/Los_Angeles`, following daylight saving changes. The garden day
starts at 4 a.m. and ends just before the following local 4 a.m. boundary;
it is not always 24 hours long. Moonflower accepts its late-night action from
10 p.m. until the next 4 a.m. rollover.

Partner entries are visible immediately by default. There are no reciprocal
reveal locks or requirements to submit before reading, listening to, or viewing
a partner's contribution.

Only the first submission per person, flower, and garden day counts. The author
may edit or replace it only within 30 minutes of its original posting and within
that same garden day. Both conditions must hold. Edits never restart the window,
change the original submission timestamp, or grant additional growth. Past
entries are read-only. Peony retains its explicit ordered milestone workflow
and shared-plan negotiation described below.

For ordinary daily growth, both people must submit to the same flower instance
in the same garden day. At rollover, paired submissions add one growth unit;
otherwise the flower loses one unit, floored at zero. Settle all intervening
days when multiple days were missed. There is no backdating or vacation pause.
Bloomed ordinary flowers are permanent and require no further watering.

Cactus and Peony never lose stages. Cactus grows through paired check-ins at
rollover and remains waterable after its single bloom. Peony instead gains one
unit immediately upon completion of each next ordered shared milestone;
multiple ordered milestones may complete in the same garden day.

## Achievement evaluation

Credit ordinary growth to the garden day that just ended, Peony milestones to
the day they complete, and paired Cactus check-ins to their submission day.
A day with any qualifying activity maintains the shared streak; a day without
it resets the streak. Settle the completed-day streak at rollover. Paired Cactus
check-ins remain qualifying activity after its bloom.

The existing challenges and a flexible completion timeline remain approved;
about one month is not a deadline. Three Forget-me-nots, the 21-day streak, and
Recovery remain required. Counts cannot be reduced, made optional, or replaced
by cumulative-day alternatives without further approval.

- **Recovery:** an actual stage decrease from a value above zero must occur,
  followed by that same flower blooming. Remaining at zero is not a decrease.
- **Before noon:** take a nonempty snapshot at 4 a.m. of eligible unbloomed
  flowers, excluding Moonflower and Peony. Both people must submit to every
  flower in that snapshot before noon. Newly planted flowers enter the next
  day's snapshot. Unbloomed Cactus participates; bloomed Cactus does not.
- **Within ten minutes:** use the original submissions to the same flower in
  the same garden day, with exactly ten minutes included. Cactus check-ins and
  contributions to the same Peony milestone qualify. Edits do not alter these
  timestamps.
- **Hydrangea matches:** count distinct garden days, not necessarily consecutive,
  across flower instances, using each person's final allowed mood choice at
  rollover.
- **Daisy questions:** count distinct shared daily questions answered by both
  people, across flower instances.
- **Permanent credit:** earned achievements and unlocks stay earned. The initial
  Cactus counts toward all types planted, but not the first-seed achievement.
  Each flower earns first-bloom credit once. Five blooming at once means five
  permanent blooms coexist. Garden full means 20 total blooms, even though
  the garden continues expanding. The Marigold requirement is 10 bloomed
  flowers, not 10 individual compliments or a separate per-person quota.

Preserve exactly these 26 ordinary achievements:

1. First seed planted.
2. First bloom.
3. All 13 types planted.
4. All 13 types bloomed.
5. Three-day streak.
6. Seven-day streak.
7. Fourteen-day streak.
8. Twenty-one-day streak.
9. Recovery.
10. Five Roses bloomed.
11. Ten Marigolds bloomed.
12. Three Tulips bloomed.
13. Twenty paired Daisy questions.
14. Three Forget-me-nots bloomed.
15. Five Dandelion wishes planted.
16. Both submit within ten minutes.
17. Both water every eligible live flower before noon.
18. Moonflower bloomed.
19. Snapdragon bloomed.
20. Bluebell bloomed.
21. Hydrangea moods match on three distinct days.
22. Peony bloomed.
23. First Dandelion blown.
24. Five permanent blooms coexist.
25. Ten total blooms.
26. Twenty total blooms.

The configured final event is excluded from the ordinary achievement completion
denominator.

## Content and media

**Tulip.** Store a song's title, artist, and link. Retain both participants'
contributions in an internal collection. Three bloomed Tulips represent 21
paired song-days and up to 42 contributions, not a promise of exactly 21 songs.
Include an in-app music player. Spotify official embeds are the researched
implementation direction: a basic embed does not need an application API key,
but provider and browser restrictions can limit playback. Retain a provider-link
fallback and do not promise full-song playback or represent the integration as
complete. The user authorizes building music first and requesting credentials
afterward if needed. See the official
[Spotify Embeds documentation](https://developer.spotify.com/documentation/embeds)
and [playback troubleshooting](https://developer.spotify.com/documentation/embeds/tutorials/troubleshooting).

**Daisy.** Author exactly 50 light questions and 50 deeper questions. Both people
receive the same daily question, without repetition until the bank is exhausted.
This decision records the requirement; writing the question bank is separate
implementation work.

**Hydrangea.** Provide six named mood colors with labels and visually blend both
people's moods. Exact names, labels, and presentation fall within the documented
discretion below.

**Sunflower.** Accept an uploaded or camera photo. Preserve its original image
dimensions and aspect ratio; scale its display up or down to fit inside a
responsive square without cropping. Remove location metadata. Exact square
size and safe file-validation limits are implementation details. Do not
perform destructive pixel-dimension downscaling by default.

**Bluebell.** Allow recording, review, and playback of a voice memo up to five
minutes long. Recording is the action; listening is not an extra growth
requirement. No 60-second limit applies.

**Dandelion.** The planter names one shared wish for each plant. Daily entries
add details to that wish. After bloom, either participant can mark the wish
fulfilled and blow it. Its permanent seed-scattering appearance creates no new
plants and grants no additional bloom credit.

**Peony.** Preserve these four ordered shared milestones:

1. Both propose date ideas.
2. Both accept a shared activity-and-time plan.
3. Both confirm that the date happened.
4. Both share a favorite moment afterward.

Remote and in-person dates qualify. The shared plan is visible while agreement
is in progress. Edits to an unfinished plan clear its acceptance; completed
milestones are fixed. The general edit restrictions apply to personal
submissions without preventing the approved shared-plan negotiation.

## Interface and onboarding

Use a phone-first cozy pixel-art garden with readable text, crisp flower
sprites, warm lighting, naturally arranged fixed planting spots, vertically
scrolling expanding beds, and a wider desktop view. Spots are not free placement
or a requirement for a rigid visible grid. Navigation consists of Garden,
Memories, and Achievements, with settings separate. An empty spot opens seed
selection; a flower opens its action, progress, and history in a bottom sheet.
Show a prominent shared garden clock and countdown, plus both watering markers.
Motion is gentle and optional, with reduced-motion support. There is no ambient
sound; user-initiated song and voice playback is allowed.

The tutorial is skippable and reopenable and uses real actions. Guide the first
account to check in to Cactus and plant and water a Rose. Guide the second
account to the existing Rose when one is available. Adapt to skipped or late
onboarding and a garden that has already progressed. Tutorial actions count
normally. Cactus never decays; all four initial types remain available. Do not
introduce reminder opt-in or locked partner entries in the tutorial.

## Launch, access, and private final interaction

Launch an online-first responsive web app. There is no offline-posting or PWA
requirement and no paid upgrades are approved. Next.js, Vercel, and Supabase
remain the approved stack, including Supabase Auth, private Storage, and Realtime
as recorded in [record 0003](0003-supabase-and-access.md).

Only two privately configured Google accounts may use the app. The backend must
enforce identity, timing, capacity, author-only edit permissions, and private
media access. A fresh production garden contains Cactus only. Keep all test and
demo content out of production. Deploy only after required tests, fresh
independent review, and the merge gates in [AGENTS.md](../../AGENTS.md).

Implement the final gated interaction generically. Its actual copy, answer
labels, and account identities belong only in private configuration, never
public source or issue text. It is armed by default. Once the ordinary
achievements are complete, the eligible designated recipient sees the pending
event. Pending state survives refresh, and an answered event never repeats.
A visual full-bloom effect does not change actual flower growth.

Admin preview never consumes the event. Admin controls and the answer are
inaccessible to the partner before authorized event delivery. Record the answer
and notify the admin in-app immediately when the app is open, or at the next
visit. Do not add email, push, daily reminders, or nudges. The garden continues
afterward.

## Approved discretion and remaining dependencies

The user explicitly authorizes conservative remaining implementation and design
choices within these approved boundaries for the unattended build. This includes
exact layouts, sprites, wording, schema, indexes, transactions, validation limits,
and error handling, provided the choices are documented. Record them in versioned
decisions and affected issues. Do not reopen settled approvals or repeatedly ask
about routine details.

Conflicts with approved rules, required credentials or account actions,
unapproved costs, and material scope or privacy changes must still be escalated.
This discretion does not waive issue-first builds, dedicated isolated builders,
verification, fresh independent review of the exact PR head, merge gates, or safe
cleanup. Implementation issues remain subject to their declared dependencies.

The dedicated hosted Supabase organization and project have been provisioned.
CLI login, linking, and a dry-run now work. These observations do not mean that
a hosted migration has been applied, Google OAuth has been configured, or the
application has been built or deployed. The local clock foundation is the only
implemented application-related foundation recorded here. Google Cloud ownership
and account setup, OAuth credentials, and the two allowed identities remain
external integration dependencies. Keep all account and project identifiers,
credentials, private content, and the private source brief out of the public
repository and its artifacts. The status and limits of the earlier provisioning
observations remain in [record 0003](0003-supabase-and-access.md).
