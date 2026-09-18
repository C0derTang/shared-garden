# Original flower sprites

Status: implementation choices under the conservative artwork discretion in
[decision 0004](0004-finalized-launch-rules.md). Source:
[issue #40](https://github.com/C0derTang/shared-garden/issues/40), extracted from
the working garden [issue #27](https://github.com/C0derTang/shared-garden/issues/27).
The component uses the visual foundation in [0005](0005-web-foundation.md) and
the authoritative catalog semantics in [0007](0007-garden-catalog-and-planting.md).
It does not implement the garden, actions, data fetching, or a production demo.

## Artwork and growth presentation

All artwork is original, local SVG geometry drawn on an integer-aligned 32 × 32
canvas. There are no downloaded assets, fonts, gradients, filters, audio, timers,
or animation. Forest and sage stems, earth shadows, cream highlights, and muted
species colors extend the existing warm palette. Ground level stays fixed across
stages. Seeds share a seed silhouette with a species-colored glint; young sprouts
share broad or narrow cotyledons. The garden must retain visible species names
and progress text rather than rely on color or tiny seeds to identify a plant.

The developed silhouettes distinguish a spiral Rose, branched Cactus, cupped
Tulip, ruffled Marigold, white-petaled Daisy, clustered Hydrangea, dark-centered
Sunflower, tall Snapdragon, pale trumpet Moonflower on a curling vine, drooping
Bluebell, Dandelion seed head, small branching Forget-me-not, and layered Peony.
Cactus has its own succulent silhouette at every growing stage, with a small
flower on its mature body. Bloomed Dandelion is a seed head; fulfilled Dandelion
retains its stem, receptacle, and three static airborne seeds. These marks create
no plants or growth credit.

`getFlowerStage` groups **validated server progress** for display:

| Authoritative state                             | Display stage                                     |
| ----------------------------------------------- | ------------------------------------------------- |
| `bloomed: true`                                 | `bloom`, regardless of a lower stale growth value |
| Unbloomed, zero units                           | `seed`                                            |
| Unbloomed, positive units below half the target | `sprout`                                          |
| Unbloomed, at least half the target             | `bud`                                             |

The target alone never declares a permanent bloom. The caller maps
`first_bloom_at !== null` to `bloomed`; the database remains authoritative.
Growth and target must be safe integers, target positive, and units between zero
and target inclusive; invalid numeric inputs throw `RangeError` rather than
render misleading progress. Validate database payloads at the consuming boundary.

For targets 5, 7, and 10, buds start at 3, 4, and 5 units respectively. Peony's
four ordered milestones render zero as seed, one as sprout, two as closed bud,
three as opening bud, and the recorded fourth milestone bloom as bloom. The two
bud drawings remain the same semantic stage; exact progress belongs in the
surrounding garden UI. None of these groupings settles days or changes progress.

## Typed interface for the garden

Import `FlowerSprite`, `getFlowerStage`, and the exported types from
`@/components/garden/flower-sprite`. `FlowerType` uses the catalog's exact thirteen
keys, including `forget-me-not`. The component is presentational and can render
on the server; no client boundary is required.

```tsx
<FlowerSprite
  type="rose"
  growthUnits={flower.growth_units}
  growthTarget={catalog.growth_target}
  bloomed={flower.first_bloom_at !== null}
/>
```

| Prop                                     | Type and behavior                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `type`                                   | Required `FlowerType`; validated catalog key                           |
| `growthUnits`, `growthTarget`, `bloomed` | Required `FlowerProgress`, as above                                    |
| `moods`                                  | Optional readonly pair of `HydrangeaMood` keys, Hydrangea only         |
| `fulfilled`                              | Optional boolean, Dandelion only; takes effect only after actual bloom |
| `presentation`                           | `actual` (default) or `full-bloom`; changes only the drawing           |
| `decorative`                             | `true` by default; `false` exposes one generated image label           |
| `size`                                   | `32`, `64` (default), `96`, or `128` CSS pixels                        |
| `className`                              | Optional local layout hook; caller CSS may scale the SVG               |

The type union prevents supplying fulfilled state or moods to an unrelated species.
It does not accept arbitrary SVG attributes, HTML, color strings, or style props.
At the default 64px, one artwork pixel spans two CSS pixels. Integer multiples
preserve the most even pixel rhythm; `crispEdges` and `image-rendering: pixelated`
keep the drawing sharp. `max-width: 100%` and automatic height let it shrink with
its container. The sprite imposes no button, bed, or page layout.

Use the default decorative mode inside an already-labeled flower button: it has
`aria-hidden`, no image role/name, and cannot receive focus. Set
`decorative={false}` for a standalone image; its generated accessible name says
the species and stage. The caller should not add a competing image label.

`presentation="full-bloom"` supports the approved later visual effect without
mutating inputs or implying earned credit. A standalone unbloomed image names
itself as a bloom preview and includes its actual stage. Actual fulfilled wishes
keep their fulfilled drawing during this effect, preserving their permanent
history. A premature fulfilled flag on an unbloomed Dandelion is ignored.

## Hydrangea mood palette

These fixed labels, keys, and colors were coordinated with the separate daily
entry implementation. Two interleaved sets of florets show the pair together;
the component never interpolates caller-provided CSS. Equal moods produce one
color. Missing moods use a neutral lavender/mauve pair (`#a39ac2`, `#d3b1c8`);
this decorative default does **not** imply any submitted mood. Future entry UI
must show the actual text labels and submission state alongside the flower.
Invalid runtime keys, including inherited object-property names, fall back to
the neutral tone and cannot introduce a URL, CSS value, or markup.

| Key         | Label     | Color                  |
| ----------- | --------- | ---------------------- |
| `calm`      | Calm      | `#6f9eab` soft blue    |
| `joyful`    | Joyful    | `#e2b84f` warm yellow  |
| `tender`    | Tender    | `#d88798` rose pink    |
| `energized` | Energized | `#d9854f` apricot      |
| `low`       | Low       | `#8b87ab` muted violet |
| `tense`     | Tense     | `#b86b61` clay red     |

## Review and validation

The focused component tests cover stage thresholds, invalid numeric inputs,
permanent bloom precedence, decorative and standalone accessibility, honest
preview labels, fulfilled-state precedence, and bounded two-tone mood colors.
They deliberately do not snapshot artwork paths. Visual review uses a temporary
local contact sheet rendered from the actual component: all thirteen types at
seed, sprout, bud and bloom, Peony's two bud variants, fulfilled Dandelion,
display-only bloom, and all six mood colors. No preview route, data, or temporary
rendering tool is committed. The review handoff records check outcomes and the
local preview location; application tests do not establish live garden integration.
