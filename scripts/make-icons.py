#!/usr/bin/env python3
"""
Generate the AAGLA app icon set.

The mark is a badge, shaped after the tour logo Josh sent as reference: an
upright rounded field, an inset keyline, the wordmark stacked down one
side, and a golfer at the top of the follow-through filling the rest. The
colours are the league's -- fairway green in place of the reference's
blue, gold in place of its red.

The golfer is assembled from tapered paths and two stroked lines rather
than one hand-authored outline. It flattens to the same silhouette and is
far easier to adjust: draw order hides every joint under the piece drawn
after it, so a change of pose means moving a point rather than re-cutting
a curve.

Two variants come out of the same drawing:

  badge -- the whole design. Used wherever the icon is rendered large
           enough to read five stacked letters: the iOS home screen at
           180px and the Android manifest at 192 and 512.
  mark  -- the golfer alone, enlarged. Used for the 32px browser tab,
           where the wordmark and keyline collapse into noise, and for
           the Android maskable icon, whose corners a launcher may crop
           to any shape it likes.

Run: python3 scripts/make-icons.py
"""

from pathlib import Path

import cairosvg

# The league's greens, from tailwind.config.ts, plus a gold that clears
# contrast against both. A deep field so a white silhouette holds its edge
# at any size.
GREEN_DARK = '#12301f'
GREEN = '#17643a'
GOLD = '#F2C230'
WHITE = '#FFFFFF'

S = 512  # master canvas; everything below is in these units


def golfer() -> str:
    """Right-handed golfer, top of the follow-through, facing left.

    Draw order is the trick to a clean silhouette: club, then limbs, then
    the torso over the top of where they meet, then the head. Every joint
    is hidden under the piece drawn after it, so there are no seams to
    tidy and the whole thing flattens to one shape.
    """
    return f'''
    <g fill="{WHITE}" stroke="{WHITE}" stroke-linecap="round"
       stroke-linejoin="round">
      <!-- Club: out of the hands at a shallower angle than the forearms,
           so the two read as two things rather than one long bar. -->
      <path d="M 250 150 L 416 68" stroke-width="8" fill="none"/>
      <path d="M 408 62 L 428 74" stroke-width="15" fill="none"/>

      <!-- Legs, tapered so the thigh carries the weight and the ankle
           doesn't. Both start high enough to finish under the torso. -->
      <path d="M 288 262 C 280 320 274 374 270 424
               L 302 428 C 308 376 316 322 326 266 Z"/>
      <path d="M 328 260 C 350 310 370 350 394 410
               L 420 398 C 400 342 382 300 366 258 Z"/>
      <!-- Front foot flat; back foot up on the toe, which is where a
           follow-through actually leaves you. -->
      <path d="M 264 422 L 304 426 L 306 446 L 258 442 Z"/>
      <path d="M 388 398 L 416 386 L 430 410 L 402 422 Z"/>

      <!-- Arms: shoulder to a bent elbow to both hands on the grip, wide
           enough to read as arms at icon size. -->
      <path d="M 288 210 C 272 190 262 176 248 158
               L 268 138 C 286 158 306 180 322 200 Z"/>
      <path d="M 296 224 C 280 200 264 180 246 160
               L 258 146 C 282 168 308 194 324 216 Z"/>

      <!-- Torso last, so it covers every joint underneath. Narrow at the
           waist, hips driven through, back arched. -->
      <path d="M 286 180 C 272 218 274 254 286 298
               L 348 292 C 354 246 346 208 336 180 Z"/>

      <!-- Head, turned to watch the ball. -->
      <circle cx="312" cy="144" r="28"/>
    </g>'''


def wordmark() -> str:
    """AAGLA stacked down the left, the way the reference runs TOUR."""
    top, step = 126, 74
    return '\n'.join(
        f'<text x="108" y="{top + i * step}" text-anchor="middle" '
        f'font-family="Poppins" font-weight="700" font-size="74" '
        f'fill="{GOLD}">{c}</text>'
        for i, c in enumerate('AAGLA')
    )


def field() -> str:
    """Full-bleed background. The corners carry no meaning: iOS applies its
    own mask and Android may crop to any shape, so nothing lives there."""
    return f'''
  <defs>
    <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{GREEN}"/>
      <stop offset="100%" stop-color="{GREEN_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="{S}" height="{S}" fill="url(#field)"/>'''


def badge_svg() -> str:
    """The full design.

    The keyline's inset and corner radius are set generously so it survives
    the superellipse iOS crops icons to -- a keyline tight to the edge
    loses its corners to that mask and reads as four disconnected lines.
    """
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}"
     viewBox="0 0 {S} {S}">{field()}
  <rect x="44" y="44" width="{S - 88}" height="{S - 88}" rx="92"
        fill="none" stroke="{WHITE}" stroke-width="11"/>
  {wordmark()}
  {golfer()}
</svg>'''


def mark_svg(scale: float = 1.0) -> str:
    """The golfer alone, centred and enlarged.

    `scale` shrinks the figure for the Android maskable icon, which a
    launcher may crop to a circle: everything has to sit inside the middle
    80% or risk losing a foot to a rounded corner.
    """
    # The figure occupies roughly x 240-430, y 60-450 on the master canvas.
    cx, cy = 334, 256
    zoom = 1.18 * scale
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}"
     viewBox="0 0 {S} {S}">{field()}
  <g transform="translate({S / 2}, {S / 2}) scale({zoom}) translate({-cx}, {-cy})">
    {golfer()}
  </g>
</svg>'''


def render(svg: str, px: int, out: str) -> None:
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(bytestring=svg.encode(), write_to=out,
                     output_width=px, output_height=px)


def main() -> None:
    badge = badge_svg()

    # iOS reads this for "Add to Home Screen" and supplies its own rounded
    # mask, so the art is full-bleed square -- pre-rounding it would show
    # the mask twice.
    render(badge, 180, 'app/apple-icon.png')
    render(badge, 192, 'public/icon-192.png')
    render(badge, 512, 'public/icon-512.png')

    # The browser tab. Five stacked letters at 32px is a smudge; the golfer
    # alone still reads as something.
    render(mark_svg(), 32, 'app/icon.png')
    render(mark_svg(0.74), 512, 'public/icon-512-maskable.png')

    Path('public/icon.svg').write_text(badge)

    print('wrote app/apple-icon.png, app/icon.png, '
          'public/icon-{192,512,512-maskable}.png, public/icon.svg')


if __name__ == '__main__':
    main()
