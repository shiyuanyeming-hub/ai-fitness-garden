// Usage: node scripts/shot.mjs <baseUrl> <outDir> <path...>   (iPhone-size screenshots + console errors)
import { chromium } from "@playwright/test";
const [base, out, ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: process.env.SCHEME || "light" });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
for (const p of paths) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const name = p.replace(/[^a-z0-9]+/gi, "_") || "home";
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
console.log(JSON.stringify(errors, null, 1));
await browser.close();
