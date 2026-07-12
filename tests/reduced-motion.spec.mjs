// Automated UI test — verifies that when `prefers-reduced-motion: reduce`
// is active, all category tile animations are disabled
// (animation-name: none, animation-duration: 0s).
//
// Run with the dev server up on http://localhost:8080:
//   node tests/reduced-motion.spec.mjs
//
// Exits with code 0 on success, 1 on failure.

import { chromium, devices } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";
const AGE_KEY = "bnv_age_verified";
const AGE_VALUE = "1";

const VIEWPORTS = [
  { name: "mobile", device: devices["iPhone 13"] },
  { name: "desktop", viewport: { width: 1280, height: 900 } },
];

const failures = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

async function runOne(browser, cfg) {
  const context = await browser.newContext({
    ...(cfg.device ?? {}),
    ...(cfg.viewport ? { viewport: cfg.viewport } : {}),
    reducedMotion: "reduce",
  });

  const page = await context.newPage();

  // Bypass age gate before the app boots.
  await page.addInitScript(
    ([k, v]) => {
      try {
        localStorage.setItem(k, v);
      } catch {}
    },
    [AGE_KEY, AGE_VALUE],
  );

  await page.goto(`${BASE_URL}/boutique`, { waitUntil: "networkidle" });

  // Sanity: matchMedia reports reduced motion.
  const prefersReduced = await page.evaluate(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  assert(
    prefersReduced,
    `[${cfg.name}] matchMedia should report prefers-reduced-motion: reduce`,
  );

  // Wait for tiles to render.
  await page.waitForSelector(".tile-fx", { timeout: 5000 });

  // Collect animation-name / animation-duration for every animated node
  // inside the category tiles.
  const results = await page.evaluate(() => {
    const selectors = [
      ".tile-fx",
      ".tile-fx__photo",
      ".tile-fx__mist",
      ".tile-fx__warm",
      ".tile-fx__cold",
      ".tile-fx__particles",
    ];
    const out = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        out.push({
          selector: sel,
          animationName: cs.animationName,
          animationDuration: cs.animationDuration,
          transitionDuration: cs.transitionDuration,
        });
      }
    }
    return out;
  });

  assert(results.length > 0, `[${cfg.name}] no tile-fx nodes found`);

  for (const r of results) {
    // Every duration listed must be 0s. `animation-duration` can be a
    // comma-separated list when multiple animations are declared.
    const durations = r.animationDuration.split(",").map((s) => s.trim());
    const allZero = durations.every((d) => d === "0s");
    assert(
      r.animationName === "none",
      `[${cfg.name}] ${r.selector}: animation-name should be "none" but is "${r.animationName}"`,
    );
    assert(
      allZero,
      `[${cfg.name}] ${r.selector}: animation-duration should be "0s" but is "${r.animationDuration}"`,
    );
  }

  console.log(
    `[${cfg.name}] checked ${results.length} nodes — reduced motion honored`,
  );

  await context.close();
}

const browser = await chromium.launch();
try {
  for (const cfg of VIEWPORTS) {
    await runOne(browser, cfg);
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("\n❌ FAILURES:");
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}
console.log("\n✅ prefers-reduced-motion: all animations disabled");