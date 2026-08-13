#!/usr/bin/env python3
"""
Generate the app icon set.

There was no icon at all before this, which is why a phone fell back to
drawing the first letter of the title on grey. The set is generated rather
than hand-drawn so the wordmark, the gold and the padding stay identical
across every size, and so regenerating after a tweak is one command.

Two treatments, chosen by how much room the target actually has:

  - "AAGLA" wherever the icon is rendered large -- the iOS home screen at
    180px, the Android manifest at 192 and 512. Five letters need the space.
  - a single "A" for the 32px browser-tab favicon, where five letters
    collapse into a grey smudge and say nothing at all.

Everything is drawn at 4x and downsampled, because PIL's text rasteriser
alone leaves visibly hard edges at these sizes.
"""

from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"

# Gold, as a vertical gradient rather than a flat fill: a home screen is a
# grid of glossy tiles and a single flat colour reads as a placeholder next
# to them. Light at the top, deeper at the bottom, the way light falls.
GOLD_TOP = (232, 199, 92)
GOLD_BOTTOM = (198, 148, 38)

# fairway-900 from the Tailwind palette. The app's own darkest green, so the
# icon belongs to the same family as the screens behind it, and it clears
# contrast against the gold by a wide margin at any size.
INK = (18, 48, 31)

SS = 4  # supersampling factor


def gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (1, size))
    px = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        px[0, y] = tuple(
            round(a + (b - a) * t) for a, b in zip(GOLD_TOP, GOLD_BOTTOM)
        )
    return img.resize((size, size), Image.NEAREST)


def fitted_font(draw: ImageDraw.ImageDraw, text: str, target_w: int) -> ImageFont.FreeTypeFont:
    """Largest size whose rendered width still fits the space allowed."""
    size = 8
    while True:
        probe = ImageFont.truetype(FONT, size + 2)
        w = draw.textbbox((0, 0), text, font=probe)[2] - draw.textbbox((0, 0), text, font=probe)[0]
        if w > target_w:
            return ImageFont.truetype(FONT, size)
        size += 2


def render(px: int, text: str, inset: float) -> Image.Image:
    """
    `inset` is the fraction of the tile left empty on each side. Android's
    maskable icons can be cropped to a circle by the launcher, so those need
    room to lose; iOS applies a fixed rounded-square and needs much less.
    """
    n = px * SS
    img = gradient(n)
    draw = ImageDraw.Draw(img)

    usable = n * (1 - 2 * inset)
    font = fitted_font(draw, text, usable)

    box = draw.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    draw.text((n / 2 - w / 2 - box[0], n / 2 - h / 2 - box[1]), text, font=font, fill=INK)

    return img.resize((px, px), Image.LANCZOS)


def main() -> None:
    # iOS ignores the manifest for "Add to Home Screen" and reads this file.
    # It supplies its own rounded-square mask, so the art is full-bleed
    # square here -- pre-rounding the corners would show the mask twice.
    render(180, "AAGLA", 0.12).save("app/apple-icon.png")

    # The browser tab. One letter, because five at 32px is a smudge.
    render(32, "A", 0.16).save("app/icon.png")

    render(192, "AAGLA", 0.12).save("public/icon-192.png")
    render(512, "AAGLA", 0.12).save("public/icon-512.png")
    # Maskable: a launcher may crop this to a circle, so the wordmark sits
    # well inside the safe zone and the gold runs to the edge behind it.
    render(512, "AAGLA", 0.22).save("public/icon-512-maskable.png")

    print("wrote app/apple-icon.png, app/icon.png, public/icon-{192,512}.png, "
          "public/icon-512-maskable.png")


if __name__ == "__main__":
    main()
