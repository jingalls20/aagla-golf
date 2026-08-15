#!/usr/bin/env python3
"""
Generate the AAGLA app icon set.

A badge, shaped after the tour logo Josh sent as reference: an upright
rounded field, an inset keyline, the wordmark stacked down one side, and a
golfer filling the rest. Colours are the league's -- fairway green in place
of the reference's blue, gold in place of its red.

The golfer is Mapbox's `golf` pictogram from the Maki icon set, released
into the public domain under CC0, vendored below rather than fetched at
build time so this script has no network dependency and the artwork cannot
change under us. CC0 asks for nothing, but the credit belongs here anyway.

  https://github.com/mapbox/maki -- CC0 1.0

It replaced a hand-drawn figure, which read as a stick figure at every size
that mattered. A pictogram drawn on a 15-unit grid carries the weight and
the confident diagonals that survive being shrunk to a favicon; a drawing
made of tapered limbs does not.

Two variants come out of the same artwork:

  badge -- the whole design. Used wherever the icon renders large enough to
           read five stacked letters: iOS at 180px, the manifest at 192
           and 512.
  mark  -- the golfer alone, enlarged. Used for the 32px browser tab, where
           the wordmark and keyline collapse into a smudge, and for the
           Android maskable icon, whose corners a launcher may crop to any
           shape it likes.

Run: python3 scripts/make-icons.py
"""

from pathlib import Path

import cairosvg

# The league's greens, from tailwind.config.ts, plus a gold that clears
# contrast against both. A deep field, so a white silhouette holds its edge
# at any size.
GREEN_DARK = '#12301f'
GREEN = '#17643a'
GOLD = '#F2C230'
WHITE = '#FFFFFF'

S = 512  # master canvas; everything below is in these units

# Maki's `golf`, verbatim. Drawn on a 15x15 grid, hence the coarse-looking
# numbers -- it is still vector and still scales cleanly.
GOLFER = (
    '<path d="M3.4 1.1v.2c0 .4.3.7.7.7c.3 0 .5-.2.6-.5l.2-.5l5.6 2.3L6.6 6'
    'c-.4.3-.4.7-.3 1.1l.9 2.1l-1.3 3.9c-.2.5.2.9.6.9c.3 0 .5-.1.6-.5l1.4-4'
    'l.1.3v3.5s0 .7.7.7s.7-.7.7-.7V10c0-.2 0-.3-.1-.5L8.5 6.1l2.7-1.9'
    'c.2-.2.4-.3.4-.6s-.2-.5-.4-.6L4 .1c-.088 0-.118.018-.2.1zM5.5 3'
    'C4.7 3 4 3.7 4 4.5S4.7 6 5.5 6S7 5.3 7 4.5S6.3 3 5.5 3"/>'
)
GOLFER_GRID = 15.0


def golfer(size: float, cx: float, cy: float) -> str:
    """The pictogram, scaled to `size` units and centred on (cx, cy)."""
    k = size / GOLFER_GRID
    return (
        f'<g transform="translate({cx - size / 2},{cy - size / 2}) scale({k})" '
        f'fill="{WHITE}">{GOLFER}</g>'
    )


def wordmark() -> str:
    """AAGLA stacked down the left, the way the reference runs TOUR."""
    top, step = 126, 74
    return '\n  '.join(
        f'<text x="104" y="{top + i * step}" text-anchor="middle" '
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

    The keyline's inset and corner radius are generous on purpose: tight to
    the edge, the superellipse iOS crops icons to eats its corners and it
    reads as four disconnected lines rather than a border.
    """
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}"
     viewBox="0 0 {S} {S}">{field()}
  <rect x="44" y="44" width="{S - 88}" height="{S - 88}" rx="92"
        fill="none" stroke="{WHITE}" stroke-width="11"/>
  {wordmark()}
  {golfer(size=330, cx=320, cy=258)}
</svg>'''


def mark_svg(size: float = 400) -> str:
    """The golfer alone, centred.

    Smaller for the Android maskable icon, which a launcher may crop to a
    circle: everything has to sit inside the middle 80%.
    """
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}"
     viewBox="0 0 {S} {S}">{field()}
  {golfer(size=size, cx=S / 2, cy=S / 2)}
</svg>'''


def render(svg: str, px: int, out: str) -> None:
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(
        bytestring=svg.encode(), write_to=out, output_width=px, output_height=px
    )


def main() -> None:
    badge = badge_svg()

    # iOS reads this for "Add to Home Screen" and applies its own rounded
    # mask, so the art is full-bleed square -- pre-rounding it would show
    # the mask twice.
    render(badge, 180, 'app/apple-icon.png')
    render(badge, 192, 'public/icon-192.png')
    render(badge, 512, 'public/icon-512.png')

    # The browser tab. Five stacked letters at 32px is a smudge; the golfer
    # alone still reads as something.
    render(mark_svg(), 32, 'app/icon.png')
    render(mark_svg(size=300), 512, 'public/icon-512-maskable.png')

    Path('public/icon.svg').write_text(badge)

    print(
        'wrote app/apple-icon.png, app/icon.png, '
        'public/icon-{192,512,512-maskable}.png, public/icon.svg'
    )


if __name__ == '__main__':
    main()
