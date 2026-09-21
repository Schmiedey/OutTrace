from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
HTML = ROOT / "frames.html"
OUT = ROOT

SHOTS = [
    ("shot-welcome", "01-welcome.png", 1280, 800),
    ("shot-check", "02-check-page.png", 1280, 800),
    ("shot-portfolio", "03-portfolio.png", 1280, 800),
    ("shot-changed", "04-what-changed.png", 1280, 800),
    ("shot-report", "05-client-report.png", 1280, 800),
    ("shot-small", "small-promo-440x280.png", 440, 280),
    ("shot-marquee", "marquee-1400x560.png", 1400, 560),
]


def flatten(png_bytes: bytes, width: int, height: int) -> Image.Image:
    image = Image.open(BytesIO(png_bytes)).convert("RGBA")
    canvas = Image.new("RGB", image.size, "#ffffff")
    canvas.paste(image, mask=image.split()[-1])
    if canvas.size != (width, height):
        canvas = canvas.resize((width, height), Image.Resampling.LANCZOS)
    return canvas


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(
        viewport={"width": 1600, "height": 1000},
        device_scale_factor=1,
    )
    page.goto(HTML.as_uri(), wait_until="networkidle")
    page.evaluate("() => document.fonts.ready")
    page.wait_for_timeout(400)
    for element_id, filename, width, height in SHOTS:
        locator = page.locator(f"#{element_id}")
        png = locator.screenshot(type="png")
        flatten(png, width, height).save(OUT / filename, "PNG")
        print(f"wrote {filename}")
    browser.close()
