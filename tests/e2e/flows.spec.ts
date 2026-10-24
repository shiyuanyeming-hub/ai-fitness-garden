import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const IMG = path.join(__dirname, "../../public/icon-512.png");
const IMG2 = path.join(__dirname, "../../public/apple-touch-icon.png");

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
});

async function ready(page: Page, url = "/") {
  await page.goto(url);
  await expect(page.getByText("正在打开你的花园")).toHaveCount(0);
}

async function scanAndConfirm(page: Page, img = IMG) {
  await ready(page, "/scan");
  await page.getByTestId("library-input").setInputFiles(img);
  await expect(page.getByText("识别结果")).toBeVisible();
}

async function startFreeAndAdd(page: Page, query: string, exerciseName: string) {
  await ready(page, "/workout");
  if (await page.getByRole("button", { name: "自由开始训练" }).isVisible()) await page.getByRole("button", { name: "自由开始训练" }).click();
  await page.getByRole("button", { name: "＋ 添加动作" }).click();
  await page.getByRole("tab", { name: "搜索动作" }).click();
  await page.getByPlaceholder("搜索动作、肌群…").fill(query);
  await page.getByRole("listitem").filter({ hasText: exerciseName }).first().click();
  await expect(page.getByTestId(/exercise-/).filter({ hasText: exerciseName })).toBeVisible();
}

async function fillRow(page: Page, i: number, load: string | null, reps: string) {
  if (load != null) await page.getByLabel("重量").nth(i).fill(load);
  await page.getByLabel("次数").nth(i).fill(reps);
  await page.getByLabel("次数").nth(i).blur();
}

/** Tick the next unconfirmed set and wait until the write is reflected in the UI. */
async function tick(page: Page, times = 1) {
  for (let i = 0; i < times; i++) {
    const before = await page.getByRole("button", { name: "取消完成" }).count();
    await page.getByRole("button", { name: "完成这一组" }).first().click();
    await expect(page.getByRole("button", { name: "取消完成" })).toHaveCount(before + 1);
  }
}

async function finishWorkout(page: Page) {
  await page.getByRole("button", { name: "结束训练" }).click();
  await expect(page.getByRole("heading", { name: "训练完成" })).toBeVisible();
}

test("测试1+3：拍照多功能器械 → 选单臂侧平举 → 左右不同组数", async ({ page }) => {
  await scanAndConfirm(page);
  await expect(page.getByRole("radio").filter({ hasText: "双滑轮功能训练器" })).toBeVisible();
  await page.getByRole("button", { name: "确认器械，选择动作" }).click();
  await expect(page.getByText("你这次做的是哪个动作？")).toBeVisible();
  // No exercise is pre-recorded: the start button needs an explicit choice
  await expect(page.getByRole("button", { name: "选择一个动作后开始记录" })).toBeDisabled();
  await page.getByRole("listitem").filter({ hasText: "单臂绳索侧平举" }).click();
  await page.getByRole("button", { name: "开始记录" }).click();

  await expect(page).toHaveURL(/\/workout$/);
  await page.getByRole("tab", { name: "左右分别" }).click();
  await expect(page.getByText("左侧", { exact: true })).toBeVisible();
  // left lane rows 0..2, right lane rows 3..5
  for (let i = 0; i < 3; i++) await fillRow(page, i, "5", "12");
  for (let i = 3; i < 5; i++) await fillRow(page, i, "5", "10");
  // remove right lane third set
  await page.getByLabel("更多").nth(5).click();
  await page.getByRole("button", { name: "删除此组" }).click();
  await expect(page.getByLabel("次数")).toHaveCount(5);
  await tick(page, 5);
  await expect(page.getByRole("timer")).toBeVisible();
  await finishWorkout(page);
  await expect(page.getByText("左3组 / 右2组")).toBeVisible();
});

test("测试2：都不是 → 自定义动作，之后可重复使用", async ({ page }) => {
  await scanAndConfirm(page);
  await page.getByRole("button", { name: "确认器械，选择动作" }).click();
  await page.getByRole("button", { name: "都不是 / 自定义动作" }).click();
  await expect(page.getByRole("heading", { name: "自定义动作" })).toBeVisible();
  await page.getByPlaceholder("例如：单臂绳索Y字上举").fill("绳索Y字上举");
  await page.getByRole("button", { name: "三角肌中束" }).first().click();
  await page.getByRole("button", { name: "斜方肌中下部" }).nth(1).click();
  await page.getByRole("button", { name: "单侧", exact: true }).click();
  await page.getByRole("button", { name: "保存并开始记录" }).click();
  await expect(page.getByTestId(/exercise-custom_/)).toContainText("绳索Y字上举");

  // Re-scan the same machine: cached result, existing card, custom exercise listed
  await scanAndConfirm(page);
  await expect(page.getByText("来自缓存")).toBeVisible();
  await page.getByRole("button", { name: /使用「/ }).click();
  await page.getByRole("button", { name: "确认器械，选择动作" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "绳索Y字上举" })).toBeVisible();
});

test("测试10：AI 识别失败时手动登记，训练记录不丢失", async ({ page }) => {
  await startFreeAndAdd(page, "卧推", "杠铃卧推");
  await fillRow(page, 0, "40", "10");
  await tick(page);

  await page.route("**/api/recognize", (r) =>
    r.request().method() === "POST" ? r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "upstream", message: "模拟：AI 服务暂时不可用" }) }) : r.continue(),
  );
  await ready(page, "/scan");
  await page.getByTestId("library-input").setInputFiles(IMG2);
  await expect(page.getByText("模拟：AI 服务暂时不可用")).toBeVisible();
  await page.getByPlaceholder("搜索器械（中文 / 日本語 / English）").fill("哑铃");
  await page.getByRole("button", { name: /哑铃（含训练凳）/ }).click();
  await page.getByRole("listitem").filter({ hasText: "哑铃侧平举" }).click();
  await page.getByRole("button", { name: "开始记录" }).click();
  await expect(page.getByTestId("exercise-db_lateral_raise")).toBeVisible();
  // earlier confirmed set is still there
  await expect(page.getByTestId("exercise-barbell_bench_press")).toContainText("1/");
});

test("测试4：方向性动作保留方向，总结按方向显示", async ({ page }) => {
  await startFreeAndAdd(page, "躯干旋转", "躯干旋转");
  await expect(page.getByText("向左", { exact: true })).toBeVisible();
  await expect(page.getByText("不代表只有同侧肌肉参与")).toBeVisible();
  for (const i of [0, 1, 3, 4]) await fillRow(page, i, "20", "15");
  // remove 3rd row of each lane (indices shift after first delete)
  await page.getByLabel("更多").nth(5).click();
  await page.getByRole("button", { name: "删除此组" }).click();
  await page.getByLabel("更多").nth(2).click();
  await page.getByRole("button", { name: "删除此组" }).click();
  await tick(page, 4);
  await finishWorkout(page);
  await expect(page.getByText("向左2组 / 向右2组")).toBeVisible();
});

test("测试11：辅助引体向上显示为辅助重量", async ({ page }) => {
  await startFreeAndAdd(page, "辅助引体", "辅助引体向上");
  await expect(page.getByText("这里填写的是辅助重量")).toBeVisible();
  await expect(page.getByText("辅助kg").first()).toBeVisible();
});

test("测试12：恢复倒计时随本地时间自动更新（无需请求服务器）", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-22T10:00:00Z") });
  await startFreeAndAdd(page, "杠铃卧推", "杠铃卧推");
  for (let i = 0; i < 3; i++) await fillRow(page, i, "40", "10");
  await tick(page, 3);
  await finishWorkout(page);
  await page.getByRole("button", { name: "完成" }).click();
  await ready(page, "/farm");
  const plot = page.getByRole("button", { name: /^胸大肌中下部：/ });
  await expect(plot).toContainText("约");
  let apiCalls = 0;
  page.on("request", (r) => r.url().includes("/api/") && apiCalls++);
  await page.clock.fastForward(72 * 3600 * 1000);
  await expect(plot).toContainText("可以训练啦");
  expect(apiCalls).toBe(0);
});

test("测试13：补录跨日训练（23:50 → 00:20）归属开始日", async ({ page }) => {
  await ready(page, "/workout?backfill=1&date=2026-10-20");
  await page.locator('input[type="time"]').first().fill("23:50");
  await page.locator('input[type="time"]').nth(1).fill("00:20");
  await page.getByRole("button", { name: "创建补录" }).click();
  await expect(page.getByText("2026-10-20 23:50")).toBeVisible();
  await page.getByRole("button", { name: "＋ 添加动作" }).click();
  await page.getByRole("tab", { name: "搜索动作" }).click();
  await page.getByPlaceholder("搜索动作、肌群…").fill("高位下拉");
  await page.getByRole("listitem").filter({ hasText: "高位下拉" }).first().click();
  await fillRow(page, 0, "35", "10");
  await tick(page);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page).toHaveURL(/\/history/);
  await page.getByRole("button", { name: "上个月" }).waitFor();
  // navigate calendar to 2026-10 and pick the 20th
  await page.getByRole("button", { name: /^20/ }).first().click();
  await expect(page.getByText("23:50 – 00:20")).toBeVisible();
  await expect(page.getByText("高位下拉").first()).toBeVisible();
});

test("测试9：离线记录，关闭后重新打开数据仍在", async ({ page, context }) => {
  await ready(page, "/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // warm the cache for the workout route
  await startFreeAndAdd(page, "哑铃卧推", "哑铃卧推");
  await page.waitForTimeout(500);
  await context.setOffline(true);
  await fillRow(page, 0, "14", "10");
  await tick(page);
  await page.reload();
  await expect(page.getByTestId("exercise-db_bench_press")).toContainText("1/");
  await expect(page.getByLabel("次数").first()).toHaveValue("10");
  await expect(page.getByText("离线中")).toBeVisible();
  await context.setOffline(false);
});

test("AI 连接测试与每日 AI 建议（模拟模式）", async ({ page }) => {
  await ready(page, "/me");
  await page.getByTestId("ai-test").click();
  await expect(page.getByTestId("ai-test-result")).toContainText("模拟调用成功");
  // token field saves while typing (no blur needed) and reports its length
  await page.getByTestId("app-token").fill("ａｂｃ");
  await expect(page.getByText("已保存在本机 · 3 个字符")).toBeVisible();
  await page.getByTestId("app-token").fill("");

  await ready(page, "/");
  // auto-generated once per day when AI is reachable
  await expect(page.getByTestId("ai-coach-headline")).toBeVisible();
  await expect(page.getByText("规则计算的建议 · 离线可用")).toBeVisible();
  const start = page.getByTestId("ai-coach-start");
  if (await start.isVisible()) {
    await start.click();
    await expect(page).toHaveURL(/\/workout/);
    // prefilled sets are not facts until ticked
    await expect(page.getByRole("button", { name: "取消完成" })).toHaveCount(0);
  }
});

test("手动新建库里没有的有氧器械 → 不用选动作直接记录分钟", async ({ page }) => {
  await ready(page, "/scan?manual=1");
  await page.getByTestId("type-search").fill("攀爬机");
  await expect(page.getByText("没有找到「攀爬机」")).toBeVisible();
  await page.getByTestId("create-type").click();
  await expect(page.getByTestId("new-type-name")).toHaveValue("攀爬机");
  await page.getByTestId("new-type-cardio").click();
  await page.getByTestId("create-type-confirm").click();
  // exercise auto-created and preselected
  await expect(page.getByTestId("start-logging")).toHaveText("开始记录");
  await page.getByTestId("start-logging").click();
  await expect(page).toHaveURL(/\/workout/);
  await page.getByLabel("分钟").first().fill("20");
  await page.getByLabel("公里").first().fill("1.5");
  await page.getByLabel("分钟").first().blur();
  await tick(page);
  await finishWorkout(page);
  await expect(page.getByText(/攀爬机 20分钟 1\.5km/)).toBeVisible();
});

test("库里已有的动感单车：自动选中，直接开始记录", async ({ page }) => {
  await ready(page, "/scan?manual=1");
  await page.getByRole("button", { name: "有氧", exact: true }).click();
  await page.getByRole("button", { name: /^动感单车/ }).click();
  await expect(page.getByTestId("start-logging")).toHaveText("开始记录");
});

test("手动新建力量器械：没有动作时可以只保存器械", async ({ page }) => {
  await ready(page, "/scan?manual=1");
  await page.getByTestId("create-type").click();
  await page.getByTestId("new-type-name").fill("胸推划船二合一机");
  await page.getByTestId("new-type-fixed").click();
  await page.getByTestId("create-type-confirm").click();
  await expect(page.getByText("这个器械还没有关联动作")).toBeVisible();
  await page.getByTestId("save-equipment-only").click();
  await expect(page).toHaveURL(/\/equipment/);
  await expect(page.getByText("胸推划船二合一机").first()).toBeVisible();
});
