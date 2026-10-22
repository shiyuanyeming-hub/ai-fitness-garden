# 架构

## 总体

```
iPhone (PWA, 添加到主屏幕)
 ├─ UI (Next.js App Router, React 19, Tailwind v4)        src/app, src/features, src/components
 ├─ 派生计算（纯函数，无 React 依赖）                      src/core
 ├─ 本地存储 IndexedDB (Dexie)                             src/data
 └─ Service Worker（离线缓存应用代码）                     public/sw.js
          │  仅拍照识别时
          ▼
Next.js API Routes（Vercel 服务端）                         src/app/api, src/server
  /api/recognize 拍照识别 · /api/coach AI 每日建议 · /api/ai/test 连接测试
          │  API Key 只在这里
          ▼
Claude 视觉模型（可替换 provider）
```

**原则**

1. **事实与派生分离。** 只有 session / workoutExercise / set / feedback / bodyWeight 是事实。肌群负荷、恢复、推荐、统计每次都由 `computeDerived()`（`src/data/derived.ts`）从事实重新计算。没有持久化的派生缓存，所以修改、删除、补录之后所有数字自动正确，也不会重复累计。
2. **确定性优先。** 记录、肌群映射、负荷、恢复、推荐全部是确定性规则（`src/core`），可单测、可审计。LLM 只做两件事：看照片给出「器械候选 + 动作提示」（必须经用户确认）；以及「AI 教练」——读取规则引擎算好的摘要（`src/features/ai/coach-input.ts`：训练习惯、近 14 天训练、各部位恢复与本周组数、规则建议、可用动作候选），选择今天练哪些动作、几组并解释原因。重量、次数、RIR 仍由规则计算。两类输出都在服务端白名单清洗（`src/server/recognition/sanitize.ts`、`src/server/coach/sanitize.ts`）：动作只能来自候选列表，组数有上限，「暂不优先」部位被剔除。
   AI 建议保存在 `recommendations` 表（id `ai-<日期>`，`view.source = "ai"`），与规则建议一样只作对照，永远不是训练事实；按 AI 建议开始训练时，预填的组同样要打勾才算数。
3. **离线优先。** 所有读写在 IndexedDB 本地完成；网络只在 AI 识别时需要。
4. **建议 ≠ 记录。** 推荐快照（`recommendations` 表）与实际训练分开存放，未执行的推荐永远不会成为训练事实。

## 目录

```
src/
  core/                     纯 TypeScript 算法（无 UI 依赖，全部有单测）
    types.ts                领域类型
    muscles.ts              肌群库（20 个，含是否分左右）
    params.ts               ★ 所有可调系数集中于此，并标注「依据 / 估计」
    time.ts                 时区、训练日期归属（按开始时间）、补录时间换算
    muscle-analysis/        动作→肌群→侧别的有效组数计算
    recovery/               恢复估计、状态、个人化系数学习
    recommendation/         plan（3 阶段计划）/ daily（每日推荐）/ progression（双重渐进）/ substitution（替换）
    analytics/              频率、部位周组数、动作进步、PR、左右差异
    gamification/           植物阶段、成就
    summary.ts              训练后总结（只用真实记录）
  data/
    db.ts                   Dexie schema（17 张表）
    repo.ts                 所有写操作 + 校验
    derived.ts              loadFacts() + computeDerived()
    backup.ts               JSON 导出/导入（合并按 id + updatedAt，幂等）
    seed/                   器械目录（29 类）、动作库（61 个，含肌群映射）
  server/recognition/       识别 provider 接口、Anthropic 实现、mock、输出清洗
  server/coach/             AI 每日建议：提示词、mock、输出清洗
  server/auth.ts            访问口令校验（NFKC 规范化、去空白、常数时间比较，区分「没填/不一致」）
  server/ai-errors.ts       把上游错误翻译成可操作的中文提示（Key 无效、余额不足、限流、繁忙…）
  features/ai/              AI 教练卡片、输入摘要构建、请求与快照
  features/                 各页面的 UI 组件（workout / recognition / garden / history / me / equipment / exercise / home）
  components/               通用 UI（Button/Sheet/Segmented…）、图表、AppShell（底部导航、离线提示、计时条）
  app/                      路由：/ /workout /scan /equipment /exercise /farm /history /me /about /api/recognize
tests/
  unit/                     core / data / recognition
  e2e/flows.spec.ts         9 个验收流程（生产构建 + mock 识别）
```

## 页面

| 路由 | 内容 |
|---|---|
| `/` | 今日状态一句话、精神/睡眠打卡、恢复地图、AI 教练建议（每天联网时自动生成一次，可重新生成）、规则建议（原因、替换、按建议开始，离线可用）、快速开始 |
| `/workout` | 进行中的训练；`?id=` 编辑历史；`?backfill=1` 补录；`?add=&ge=` 深链加动作 |
| `/scan` | 拍照/相册 → AI 识别 → 确认器械（可选已有卡片）→ 选动作 →「都不是」自定义 → 开始记录；失败时手动搜索/新建器械 |
| `/equipment` | 当前健身房器械卡片、收藏、可练部位、详情（照片更换/删除、动作列表、最近记录、可用状态） |
| `/exercise` | 动作库；`?new=1` / `?edit=` 自定义动作表单 |
| `/farm` | 肌肉农场 / 人体图、肌群详情（倒计时、原因、反馈、推荐动作）、成就 |
| `/history` | 训练日历（推荐 vs 实际）、成长分析（目标进度、频率、部位组数、动作进步、PR、左右差异、体重） |
| `/me` | 资料、目标、部位优先级、排除动作、健身房、计划、显示、备份、AI 设置（访问口令、测试 AI 连接）与照片隐私 |
| `/about` | 计算说明与参考文献 |

动态内容全部用查询参数而不是动态路由，这样 Service Worker 预缓存的少数页面就覆盖全部离线导航。

## 技术选型

| 选择 | 理由 |
|---|---|
| Next.js 15 + PWA（而非原生 App） | 一套代码，iPhone 添加到主屏幕即可用；API Route 正好做 AI 代理，Key 不进浏览器 |
| Dexie / IndexedDB | 浏览器里唯一适合结构化离线数据的存储；`useLiveQuery` 让 UI 随数据自动刷新 |
| 不用 Supabase（第一阶段） | 个人自用，本地 + JSON 备份足够，零运维；表结构已预留同步字段 |
| 手写 Service Worker（而非 next-pwa/Serwist） | 需求简单（应用壳离线），少一个依赖，行为完全可控 |
| 自写 UI 组件（未用 shadcn/Radix） | shadcn 需要联网 CLI 生成；本项目组件少，自写更轻、离线构建也稳定 |
| 自写 SVG 图表（未用 Recharts） | 单系列图表很简单，减少约 100KB 包体积 |
| framer-motion | 农场生长与面板动画；自动遵守「减少动态效果」 |
| Vitest + fake-indexeddb + Playwright | 算法、数据层、真实浏览器流程分别覆盖 |

## 给后续维护者

- 改系数：只改 `src/core/params.ts`，同时递增 `CALCULATION_VERSION`，并更新 `docs/ALGORITHMS.md`。
- 加动作：在 `src/data/seed/exercises.ts` 追加一行（id 永久不变）。
- 加器械类型：`src/data/seed/equipment.ts`（`cues` 会发给视觉模型）。
- 改表结构：在 `db.ts` 增加 `this.version(2).stores({...}).upgrade(...)`，不要修改 version(1)。
- 换模型供应商：实现 `RecognitionProvider`（`src/server/recognition/types.ts`），在 `getProvider()` 里选择。
