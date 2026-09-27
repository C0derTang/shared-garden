# Guide coach-mark and outer pages

Status: conservative choices under the approved discretion in
[decision 0004](0004-finalized-launch-rules.md), implemented for
[issue #124](https://github.com/C0derTang/shared-garden/issues/124). They follow
the user's reskin authorization of 2026-09-26 and the Harvest Handheld tokens in
[decision 0049](0049-harvest-handheld-reskin.md). This supersedes the centered
guide box in [decision 0030](0030-compact-garden-guide.md) and keeps its
coordinator contract, and that of [decision 0029](0029-immersive-garden.md),
unchanged. Product rules in decision 0004 and decisions 0007–0020 are not
changed.

## Guide coach-mark

The guide no longer covers the middle of the screen. It points at the flower it
is talking about:

- **Spotlight.** The current step's spot (the Cactus, a bare soil spot for the
  Rose seed, the growing Rose, or a blooming Rose) stays lit. The rest of the
  garden is dimmed by a hard-edged spread around that spot, the same
  `rgb(28 16 6 / 55%)` tint as the sheets. The lit spot has a 2px `--wood-dark`
  edge inside a 3px `--gold` ring. The gold is 4.99:1 against the dimmed grass
  and the dark edge is 4.42:1 against the lit grass. The ring steps outward by
  4px and back every 1.2s. Reduced motion and the gentle-motion setting stop
  it, so it stays a still ring.
- **Bubble.** A parchment bubble in the wood frame with a stepped pixel pointer
  opens next to the spot. It opens below the spot when the spot is in the top
  half of the screen and above it otherwise, so the flower is never covered. It
  is at most 340px wide, keeps a 12px gutter at 320px, and scrolls inside
  itself for enlarged text. When the guide opens, the garden scrolls the target
  spot into view once, without smooth scrolling. The bubble follows the spot on
  resize and scroll. If the spot cannot be measured, or before the first
  measurement, the bubble docks above the hotbar with no spotlight. Steps with
  no spot (the final card and "Grow at your own pace") also dock.
- **Copy.** A short heading names the action: "Tap your Cactus to say hello",
  "Tap bare soil to plant a Rose", "Tap your Rose to leave a note", or "Your
  Rose is in bloom". One line of description follows. A "Garden guide" row
  shows two progress pips and `0/2`, and screen readers hear "0 of 2 moments
  shared". The count uses the member's two saved tutorial facts, as before.
- **Two actions.** The primary button is unchanged: "Visit Cactus", "Choose a
  Rose seed", "Visit Rose" or "Visit a blooming Rose". Tapping the lit flower
  itself does the same thing. That tap target is a pointer shortcut only; it is
  hidden from assistive technology and is not in the tab order, so keyboard and
  screen-reader users have one primary control. While garden updates are
  paused, the flower tap does nothing, like the `aria-disabled` button. The
  secondary action is "Skip guide" with the note "Reopen in Settings". On the
  blooming-Rose step, where a note cannot be added, the secondary action is
  "Finish guide" in place of Skip.
- **One-time end card.** When both tutorial facts are saved, the guide shows
  "You're both set ✿" once, with one "Finish guide" button and no Skip. Finish
  saves `finished`, and the guide never returns unless it is reopened from
  Settings. The ✿ is decorative, so the heading's name is "You're both set".
- **Temporary close.** The visible "Close guide for now" text link becomes the
  shared red × stamp at the bubble's corner. Its accessible name is still
  "Close guide for now" and the target is still 44px. Escape does the same.
  Both collapse the guide to the "Guide" button until it is shown again or the
  next successful Settings reopen.

The coordinator contract is unchanged. The guide still requests a slot in the
sheet queue and is shown only while it holds the slot. The garden behind it is
inert and focus is trapped inside it. On open, focus goes to the heading. It
yields to a real flower or seed sheet and rejoins the queue with fresh facts
after that sheet closes. Pending private moments keep priority, and private
notices still appear inside the bubble. Skip and Finish hide the guide only
after a successful save. Focus returns to the garden only when no queued sheet
owns focus. Refresh never reopens a locally closed guide or moves focus.
Reopening from Settings works as before. Outside clicks still do not dismiss
the guide. Its only garden hook is a `data-spot` attribute on each spot, which
the bubble uses to find the target. No guide action writes care, picks a seed
or changes progression.

## Landing, sign-in error and not-found pages

The public pages now look like the garden:

- **Meadow and sign.** The page background is the garden stage's own grass
  texture. A wooden sign plank matching the garden header carries the "cc's
  garden" wordmark in Pixelify Sans. The wordmark is `--paper-light` on
  `--wood` (4.74:1 at 20px bold). The landing sign also has a parchment "a
  little world for two" plate from 480px. Text sits only on parchment or on the
  sign, never on grass.
- **Landing.** The hero is a parchment card in the wood frame. It has a Pixelify
  headline ("A little care. A lot of us."), the description, and the same
  actions. When sign-in is configured, "Continue with Google" is the single
  primary action and "Take a little look" is secondary. Otherwise "Take a
  little look" is primary and the setup-incomplete status shows, as before.
  The "take a little look" sheet lists its three points on parchment slots with
  real flower sprites. "A note. A song. A moment." becomes three inventory
  slots holding a blooming Rose, Tulip and Cactus. The setup status is a small
  parchment notice, and the footer is a parchment strip under a dark wood edge.
  At 1000px and wider the hero card and illustration sit side by side.
- **Illustration.** `public/garden-scene.svg` is redrawn to match the current
  cozy plots: six soil plots on textured grass with no path, stones, fence or
  trees. It uses the garden's plot, furrow, grass and clump colors, the real
  flower sprites (a blooming Cactus, Rose and Sunflower, a Tulip bud, a Daisy
  sprout and one bare plot) and three sample care tags. It is decorative (`alt=""`),
  shows no live garden state and no private content, and is about 6 KB (before:
  4.5 KB). It sits in a wood frame under a carved "Every little moment counts"
  plaque, with the "room to grow, together" caption below.
- **Sign-in error and not found.** Each is one framed parchment card on the
  meadow under the sign. A small grass window shows a soil plot with a sprout (a
  Cactus sprout at the garden gate, a Rose sprout for not found), then an
  eyebrow, a Pixelify heading, the unchanged message and the unchanged actions.
  The sign-in error page keeps "Continue with Google" as its only primary
  action when sign-in is configured, with Sign out and Return home as secondary
  buttons. The not-found page keeps "Back to the garden gate". The copy, sign-in
  reasons and the sign-out form are unchanged.

The landing, sign-in error and not-found styles move from `globals.css` into
one shared `public.module.css`. The shared `.eyebrow` rule that other panels use
stays global.

## Finish pass

These are token-level changes. No behavior changes.

- **Photo and voice forms.** The photo preview is framed like an inventory slot
  and stays uncropped ([decision 0012](0012-sunflower-photo-interface.md); the HEIC
  line is unchanged). The recording timer is a parchment clock plate in
  Pixelify. The review heading uses Pixelify. Form errors use the garden's
  error block: `--danger` on `--danger-wash` (7.02:1) with a `--rust` edge.
- **Tulip Spotify picker.** The picker is a parchment slot panel. The search
  field uses the shared 2px `--control-border` edge on `--paper-light`, and
  results are divided by dashed `--line-strong` rules. The Spotify icon,
  attribution link, uncropped album art with its existing corner radius, and
  every metadata link are unchanged
  ([decision 0034](0034-tulip-spotify-catalog-search.md)).
- **Peony.** The four milestones read like a quest log. Each step is a parchment
  slot with a Pixelify title and a decorative badge: a check on `--forest` when
  complete, a gold marker for the next shared step, and an empty slot for later
  steps. The next step sits on a hard wood lip. The step's state is still
  written out in words. The "You" and "Your partner" contributions are
  parchment cards. Headings, text, controls and behavior are unchanged.
- **Private-moment notices.** The notice literals become tokens. In a sheet,
  panel or the guide, a notice is a parchment slot. Floating over the garden,
  it gets the wood frame like the Help card. Its heading is Pixelify. The bloom
  strip uses `--sage-light` with a dashed `--line-strong` edge. The notice
  hosts, what a notice shows, and every privacy rule in
  [decision 0020](0020-private-interaction.md) are unchanged.

In forced colors every new frame sets `border-image-source: none`, so the system
draws a plain border.

## Verification boundary

Verification uses the actual components with disposable synthetic data at 320,
390 and 1280 pixels in Chromium, with a Playwright WebKit check of the
coach-mark placement and a forced-colors, reduced-motion pass. It covers the coach-mark at each step, with its placement
above, below and docked, and keyboard focus. It also covers the landing in both
its configured and setup-incomplete states, the sign-in error and not-found
pages, the Tulip picker, the photo and voice forms, Peony and the
private-moment notices. It checks for horizontal overflow, requests to another
origin and targets under 24px. Lint, typecheck, tests and a production build also
run. It never reads or mutates production data. No route, backend, schema,
dependency, product rule, sprite or spot coordinate changes.
