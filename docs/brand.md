# Mintonix visual identity

Preserved from the archived original Mintonix web application:

- `apps/web/public/brand/logomark.png`: original blue shuttle mark, unchanged.
- `apps/web/public/brand/logo-full.png`: original full logo asset, unchanged.
- `apps/web/styles/tokens/{colors,typography,spacing,effects}.css`: original design tokens, unchanged.

The original source was `/Users/kouyang/PycharmProjects/Mintonix-Archive/Mintonix/apps/web` at scaffold creation. The new project is self-contained and does not depend on that location.

## Typography

- **Space Grotesk:** headings and display text.
- **Geist:** body copy and interface labels.
- **Geist Mono:** timestamps, scores, and numeric data.

Fonts are bundled from Fontsource packages, using Latin variable font files. Builds and visitors do not need to request fonts from Google.

## Color and layout

Use neutral charcoal backgrounds, subtly elevated panels, silver text, and quiet borders. Original brand blue is `#3693ff`; reserve it for primary actions and meaningful selection states. Cyan is a restrained secondary accent. Use the original spacing, radius, and focus tokens.

The starter player uses a schematic court illustration, not a broadcast frame. It is clearly marked as a preview. The prior application's page components, demo flows, backend dependencies, and global component stylesheet were not copied.
