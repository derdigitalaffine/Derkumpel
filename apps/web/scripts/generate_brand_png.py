"""Regenerate installable PNG assets from the verified DerKumpel source icon.

Dependencies for this maintenance command only: Pillow. No runtime Python needed.
Run: python -m pip install Pillow && python apps/web/scripts/generate_brand_png.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

PUBLIC = Path(__file__).resolve().parents[1] / 'public'
SOURCE = PUBLIC / 'derkumpel-icon-192-v2.png'

def font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf',
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.truetype('DejaVuSans-Bold.ttf', size)

def main() -> None:
    with Image.open(SOURCE) as source:
        source.load()
        if source.size != (192, 192):
            raise RuntimeError(f'Unexpected icon source size: {source.size}')
        icon = source.convert('RGB')

    icon.resize((512, 512), Image.Resampling.LANCZOS).save(
        PUBLIC / 'derkumpel-icon-512-v2.png', optimize=True,
    )
    maskable = Image.new('RGB', (512, 512), '#ffffff')
    maskable.paste(icon.resize((384, 384), Image.Resampling.LANCZOS), (64, 64))
    maskable.save(PUBLIC / 'derkumpel-icon-maskable-512-v2.png', optimize=True)
    for size in (32, 64):
        icon.resize((size, size), Image.Resampling.LANCZOS).save(
            PUBLIC / f'favicon-{size}-v2.png', optimize=True,
        )
    icon.resize((180, 180), Image.Resampling.LANCZOS).save(
        PUBLIC / 'apple-touch-icon-v2.png', optimize=True,
    )

    logo = Image.new('RGB', (900, 330), '#ffffff')
    draw = ImageDraw.Draw(logo)
    logo.paste(icon.resize((285, 285), Image.Resampling.LANCZOS), (14, 22))
    x, y = 314, 84
    word_font = font(83)
    while draw.textbbox((0, 0), 'DerKumpel', font=word_font)[2] > 565:
        word_font = font(word_font.size - 1)
    draw.text((x, y), 'Der', font=word_font, fill='#5c5c5c')
    der_width = draw.textbbox((0, 0), 'Der', font=word_font)[2]
    draw.text((x + der_width, y), 'Kumpel', font=word_font, fill='#053657')
    draw.text((x + 54, 202), 'B A U H O F - A P P', font=font(27), fill='#5c5c5c')
    draw.rounded_rectangle((x + 15, 242, x + 140, 252), radius=5, fill='#73ad20')
    draw.rounded_rectangle((x + 427, 242, x + 552, 252), radius=5, fill='#73ad20')
    logo.save(PUBLIC / 'derkumpel-logo-v2.png', optimize=True)

    # These old asset contents did not contain valid PNG signatures; never ship them.
    for name in (
        'derkumpel-icon-192.png',
        'derkumpel-icon-512.png',
        'derkumpel-icon-maskable-512.png',
        'derkumpel-logo.png',
    ):
        (PUBLIC / name).unlink(missing_ok=True)

if __name__ == '__main__':
    main()
