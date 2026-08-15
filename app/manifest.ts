import type { MetadataRoute } from 'next';

/**
 * Web app manifest.
 *
 * This is what Android reads when someone adds the site to their home
 * screen, and what turns the result into a standalone tile rather than a
 * bookmark that opens in a browser chrome. iOS ignores it for the icon and
 * reads `app/apple-icon.png` instead, which is why that file exists
 * separately rather than being generated from here.
 *
 * `short_name` is what actually appears under the icon; a home screen gives
 * it roughly twelve characters before truncating, so "AAGLA Golf" is
 * deliberately shorter than the full title.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AAGLA Golf',
    short_name: 'AAGLA',
    description: 'Scores, handicaps and season standings for the AAGLA golf leagues',
    start_url: '/',
    display: 'standalone',
    // The green from the badge, so the splash matches the tile the user just
    // tapped rather than flashing a colour the icon no longer uses.
    background_color: '#17643a',
    theme_color: '#12301f',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A launcher may crop a maskable icon to a circle, a squircle or a
      // rounded square as it pleases; this one keeps the wordmark inside the
      // safe zone so no shape clips it.
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
