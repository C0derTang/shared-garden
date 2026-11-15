# Sunset homepage artwork provenance

These are original assets generated from text with the built-in OpenAI image-generation tool for [issue #165](https://github.com/C0derTang/shared-garden/issues/165). No external photograph, stock image, private content or reference image was used as generation input. The original PNG outputs are committed unchanged; Next.js serves responsive optimized versions at runtime, retaining the flower alpha channel.

The user explicitly requested a photographic scene with a painting-filter appearance and a spider lily. Selecting a red Lycoris radiata, keeping the prior warm palette, and separating landscape and flower layers are implementation choices under [decision 0004](../decisions/0004-finalized-launch-rules.md). [Decision 0066](../decisions/0066-private-sunset-home.md) records the superseding presentation.

## painted-lake.png

Project file: `public/sunset-home/painted-lake.png`.
Dimensions: 1536 × 1024; RGB.
SHA-256: `abbf84f57db222b146bdc5873c43e27492e58efcfcc6fcb9f3fe4a8e9a8c067b`.

Generation prompt:

Use case: photorealistic-natural. Asset type: full-viewport background for a private sunset garden website, landscape 3:2 composition, high resolution. Create an original image that first reads as a beautiful REAL landscape photograph with a subtle painting filter applied: physically realistic mountains, organic terrain, mist and water; delicate soft oil-brush texture following the photographic details, slight softened edges, not a flat illustration. Scene: tranquil alpine lake at golden-hour sunset with layers of irregular mountain ridges fading into warm atmospheric haze. A natural small low sun in the upper-right/center around x68%, softly glowing through thin luminous peach clouds, reflected in fine broken ripples across the lake. Mauve and blue-gray mountains, sage and olive shoreline vegetation, apricot and amber light. Horizon around 43% height; warm spacious sky in upper third, open lake through the middle and lower center. Near shoreline softly enters bottom-left and bottom-right with fine grasses, soft ground textures and realistic photographic depth; keep lower-left/central lake quiet so translucent carousel cards can overlay. Foreground flower will be a separately composited asset, so NO FLOWERS or prominent plants in this background, just subtle low grasses near bottom corners. Match a refined photographic oil-paint filter, preserving real shapes, natural shadows, gentle grain and believable lens depth, not stylized polygon mountains or outlined graphics. No people, houses, animals, text, letters, logos, watermark, UI, cards, borders, cartoon, vector, low-poly, flat poster fills, or exaggerated perfect circular sun. Edge-to-edge finished scenic photograph with a painterly surface.

## red-spider-lily.png

Project file: `public/sunset-home/red-spider-lily.png`.
Dimensions: 1024 × 1536; RGBA with genuine transparent background.
SHA-256: `58c8f6daf6ed80a3955bfa992893b8864cddc8195715101378dd66f9cb2f4749`.

Generation prompt:

Use case: photorealistic-natural. Asset type: isolated transparent foreground flower image for compositing over a photographic alpine-lake sunset. Portrait composition 2:3, high resolution, true transparent alpha background. ONE red spider lily (Lycoris radiata) flowering stalk, botanically natural, not a rose. Exactly one slender gently curved leafless green stalk bearing one airy flower head composed of 4-6 coral-crimson florets, narrow undulating strongly reflexed petals and long fine curving red stamens projecting outwards with tiny anthers. Delicate wispy filaments, translucent petals with natural veins, realistically overlapping depth and small shadowed crevices. Do not add rose leaves or thorns, no foliage along the naked flowering stalk. Full stem visible down to its clean tapered base, no soil or pot. Three-quarter side view, airy blossom head in upper-left relative to base, subtly facing up-left/front and leaning with a breeze. Stem descends diagonally to the lower-right. Keep all fine stamen tips comfortably within image bounds with 10% transparent breathing room. Center of bloom near x43%, y27%, stem base near x67%, y94%; flower head about 65% image width, total stalk occupies 86% image height. Style: looks like a real high-quality close botanical photograph with a subtle painting filter applied, fine soft oil-brush texture, softly blended photographic colors, no drawn outlines or flat vector surfaces. Lighting must match golden-hour sunset: warm amber rim light from upper-left, delicate golden highlights on red petals and filaments, soft realistic burgundy shadows within flowers, natural dimensional green stem. Carefully preserve photographic anatomy, wispy delicate detail and real spatial depth. True transparent background with no opaque haze, fake checkerboard, colored backdrop, cast floor shadow, glow halo, landscape, extra stalks, extra flower heads, pot, text, logo or watermark. Original artwork, not copied from any existing photograph.

## Regional motion masks

`public/sunset-home/cloud-mask.svg`, `water-far-mask.svg` and `water-near-mask.svg`
are original invisible mask geometry aligned to the 1536 × 1024 photograph.
They feather the moving raster copies within sky and open-water areas, preserving
stationary mountains, sun and shore. These files do not alter either generated
PNG. No third-party media binary or album artwork is stored here. The custom audio
player requires a separately authorized server-only local recording, which is
never bundled in the public repository.
