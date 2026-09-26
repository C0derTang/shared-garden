# Finished entry and moment controls

Status: conservative presentation choices for
[issue #108](https://github.com/C0derTang/shared-garden/issues/108), under the
approved discretion in [decision 0004](0004-finalized-launch-rules.md). They
build on the pixel design tokens in
[decision 0041](0041-pixel-design-tokens.md), the Google sign-in entry in
[decision 0008](0008-google-web-session.md), the private interaction in
[decision 0020](0020-private-interaction.md), the immersive panels in
[decision 0029](0029-immersive-garden.md), the compact Settings rows in
[decision 0033](0033-compact-settings.md), and the branding in
[decision 0035](0035-ccs-garden-branding.md).

## Landing actions

When sign-in is configured, Continue with Google is the only primary button on
the landing page. Take a little look uses the shared secondary button: paper
fill, `--control-border` edge and no pixel shadow. When setup is incomplete,
there is no sign-in button, so Take a little look remains the single primary
button. The landing copy, the about sheet, the setup notice and the order of
the actions do not change.

## Private-moment notices

Refresh moment in an error notice uses the shared secondary button. It matches
the Refresh settings recovery action. Mark as read in an owner answer
notification uses the shared primary button because it is the only action in
that notice. Both buttons sit a short gap below the notice text, keep at least a
44-pixel target, and wrap long labels within the notice. The recipient's
Open your garden moment reopen button already used the primary class. It now
also uses the shared primary label weight and size, because the component no
longer resets the button font.

The notice placement order, the single presentation region from decision 0033,
acknowledgement and retry behavior, and focus handling are unchanged.

## Moment answers

Each answer choice uses the shared secondary button at full width with its
label aligned left. A selected choice keeps its `aria-pressed` state. It shows
that state with a `--sage-light` fill, a `--forest-dark` border and a 5-pixel
inset bar on its leading edge. When a selected choice has keyboard focus, it
keeps the inset bar and also shows the shared focus halo. The same answer
buttons appear in the owner preview, and nothing is sent from the preview.

## Owner section

The owner section in Settings no longer uses the uppercase landing eyebrow. It
follows the Settings row pattern: a Garden moment heading at `--text-md`,
followed by a muted Private owner controls line and the delivery status line.
Both lines use the Settings row description size. The section uses a 1-pixel
`--line` border and a `--paper-light` fill, which match the Settings group.
Preview privately and Arm or Disarm delivery keep the shared secondary button
at its normal size and wrap to a second line at narrow widths.

## Verification boundary

Verification uses the actual components with disposable synthetic data at 320,
390 and 1280 pixels, plus lint, typecheck, tests and a production build. It
never reads or mutates production data. Interaction rules, content, privacy
rules, authorization, the auth flow, other panels and the backend are
unchanged.
