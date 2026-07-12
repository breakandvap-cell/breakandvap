"""Automated UI test — vérifie que lorsque `prefers-reduced-motion: reduce`
est activé, toutes les animations des tuiles de catégories sont désactivées
(animation-name: none, animation-duration: 0s).

Exécution (le serveur dev doit tourner sur http://localhost:8080) :
    python3 tests/reduced-motion.spec.py

Code de sortie 0 si tout est vert, 1 sinon.
"""

import asyncio
import os
import sys
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
AGE_KEY = "bnv_age_verified"
AGE_VALUE = "1"

VIEWPORTS = [
    {"name": "mobile", "viewport": {"width": 390, "height": 844}},
    {"name": "desktop", "viewport": {"width": 1280, "height": 900}},
]

SELECTORS = [
    ".tile-fx",
    ".tile-fx__photo",
    ".tile-fx__mist",
    ".tile-fx__warm",
    ".tile-fx__cold",
    ".tile-fx__particles",
]


async def run_one(browser, cfg, failures):
    context = await browser.new_context(
        viewport=cfg["viewport"],
        reduced_motion="reduce",
    )
    await context.add_init_script(
        f"try {{ localStorage.setItem({AGE_KEY!r}, {AGE_VALUE!r}); }} catch (e) {{}}"
    )
    page = await context.new_page()
    await page.goto(f"{BASE_URL}/boutique", wait_until="networkidle")

    prefers_reduced = await page.evaluate(
        "matchMedia('(prefers-reduced-motion: reduce)').matches"
    )
    if not prefers_reduced:
        failures.append(f"[{cfg['name']}] matchMedia ne rapporte pas reduce")

    await page.wait_for_selector(".tile-fx", timeout=5000)

    results = await page.evaluate(
        """(selectors) => {
            const out = [];
            for (const sel of selectors) {
                for (const el of document.querySelectorAll(sel)) {
                    const cs = getComputedStyle(el);
                    out.push({
                        selector: sel,
                        animationName: cs.animationName,
                        animationDuration: cs.animationDuration,
                    });
                }
            }
            return out;
        }""",
        SELECTORS,
    )

    if not results:
        failures.append(f"[{cfg['name']}] aucun noeud .tile-fx trouvé")

    for r in results:
        durations = [d.strip() for d in r["animationDuration"].split(",")]
        if r["animationName"] != "none":
            failures.append(
                f"[{cfg['name']}] {r['selector']}: animation-name={r['animationName']!r} (attendu 'none')"
            )
        if not all(d == "0s" for d in durations):
            failures.append(
                f"[{cfg['name']}] {r['selector']}: animation-duration={r['animationDuration']!r} (attendu '0s')"
            )

    print(f"[{cfg['name']}] {len(results)} noeuds vérifiés")
    await context.close()


async def main():
    failures = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            for cfg in VIEWPORTS:
                await run_one(browser, cfg, failures)
        finally:
            await browser.close()

    if failures:
        print("\n❌ ÉCHECS:")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("\n✅ prefers-reduced-motion: toutes les animations sont désactivées")


asyncio.run(main())