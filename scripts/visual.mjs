// Visual review: performs a short real workout in a throwaway browser profile, then screenshots each screen.
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3200";
const out = process.argv[3] ?? "/tmp/shots";
const scheme = process.env.SCHEME ?? "light";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, timezoneId: "Asia/Tokyo" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("dialog", (d) => d.accept());
const go = async (p) => { await page.goto(base + p); await page.getByText("正在打开你的花园").waitFor({ state: "detached" }).catch(() => {}); await page.waitForTimeout(600); };
const shot = async (name, full = true) => page.screenshot({ path: `${out}/${scheme}-${name}.png`, fullPage: full });

await go("/workout");
await shot("workout-start", false);
await page.getByRole("button", { name: "自由开始训练" }).click();
const add = async (q, name) => {
  await page.getByRole("button", { name: "＋ 添加动作" }).click();
  await page.getByRole("tab", { name: "搜索动作" }).click();
  await page.getByPlaceholder("搜索动作、肌群…").fill(q);
  await page.getByRole("listitem").filter({ hasText: name }).first().click();
  await page.waitForTimeout(300);
};
await add("杠铃卧推", "杠铃卧推");
for (let i = 0; i < 3; i++) { await page.getByLabel("重量").nth(i).fill("40"); await page.getByLabel("次数").nth(i).fill("10"); }
await page.getByLabel("次数").nth(2).blur();
for (let i = 0; i < 3; i++) { const n = await page.getByRole("button", { name: "取消完成" }).count(); await page.getByRole("button", { name: "完成这一组" }).first().click(); await page.getByRole("button", { name: "取消完成" }).nth(n).waitFor(); }
await add("单臂绳索侧平举", "单臂绳索侧平举");
await page.getByRole("tab", { name: "左右分别" }).click();
await page.waitForTimeout(300);
await shot("workout-active");
await page.getByRole("button", { name: "结束训练" }).click();
await page.waitForTimeout(800);
await shot("summary", false);
await page.getByRole("button", { name: "完成" }).click();
for (const [p, n] of [["/", "home"], ["/farm", "farm"], ["/history", "history"], ["/me", "me"], ["/equipment", "equipment"], ["/scan", "scan"], ["/about", "about"]]) { await go(p); await shot(n); }
await go("/history"); await page.getByRole("tab", { name: "成长分析" }).click(); await page.waitForTimeout(500); await shot("growth");
await go("/farm"); await page.getByRole("button", { name: /^胸大肌中下部：/ }).click(); await page.waitForTimeout(700); await shot("muscle-sheet", false);
console.log(JSON.stringify(errors));
await browser.close();
