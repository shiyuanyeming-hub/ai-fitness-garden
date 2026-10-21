# AI Fitness Garden — 实施计划（个人自用版）

## Context
从零开发一款 iPhone 优先的离线 PWA 健身应用：拍照识别器械 → 选动作 → 快速记录（含左右分侧）→ 自动肌群负荷 → 恢复估计与倒计时 → 每日推荐 → 肌肉农场/恢复地图。
工作目录 /home/claude 下没有现成项目，全部新建。已确认的决策：

- 视觉模型：Claude API，经服务端 API 路由代理，provider 接口可替换（需要用户提供 ANTHROPIC_API_KEY；没 Key 时手动登记仍完整可用）
- 存储：纯本地 IndexedDB（Dexie），离线优先；数据表按可同步设计（UUID 主键、updated_at、软删除），云同步留到第二阶段
- 部署：Vercel + 添加到 iPhone 主屏幕；API 路由只做 AI 代理
- 开发顺序：训练记录与左右分侧 → 器械拍照与动作选择 → 恢复估计与今日推荐 → 肌肉农场/恢复地图

## 技术栈
Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui；Dexie (IndexedDB)；Vitest 做核心算法测试；Playwright 做移动视口与离线检查；Serwist 或手写 service worker 做 PWA 离线；Framer Motion 做农场动画（遵守 prefers-reduced-motion）。

## 目录结构（核心算法与 UI 分离）
```
src/
  core/                 # 纯 TypeScript，无 React 依赖，全部有单测
    muscle-analysis/    # 动作→肌群映射、有效组数、侧别口径
    recovery/           # 规则引擎、时间衰减、累计刺激、反馈修正
    recommendation/     # 今日推荐、动作替换、渐进超负荷
    load/               # 阻力类型归一（external/assistance/bodyweight/band）
  data/
    seed/               # 肌群表、动作库、器械目录、肌群映射（带来源/估计标注）
    db.ts, repositories/, export-import.ts, recompute.ts
  features/             # profile, equipment, exercise, recognition, workout, analytics, gamification
  app/                  # 页面 + api/recognize（服务端代理）
docs/                   # ARCHITECTURE.md, DATA_MODEL.md, ALGORITHMS.md（依据+估计标注）, DEPLOY.md
```

## 关键设计
1. **事实与派生分离**：WorkoutSession/Exercise/Set 是唯一事实源；MuscleLoad、RecoveryEstimate、DailyRecommendation 全部由 `recompute()` 从事实重算，修改/删除/补录历史后整体重算，避免重复累计。
2. **器械与动作分离**：Equipment —(EquipmentExercise)— Exercise 多对多；GymEquipment 表示某健身房的实体器械。识别只产出「器械候选 + 动作候选 + 置信度」，不自动记为已完成动作。
3. **侧别模型**：Set 同时存 `side`(left/right/both) 与 `movement_direction`(left/right/none)；ExerciseMuscleMapping.laterality_rule 决定肌群侧别归属，映射不可靠的方向性动作（如躯干旋转）只记核心整体负荷。双侧动作 3 组按 3 个有效组计，不翻倍。
4. **阻力类型**：assistance 负荷不当作外部重量，进度比较与 volume 计算对其单独处理；不同器械重量不跨器械比较。
5. **恢复模型 v1**：规则引擎 = 有效组数×强度/努力（RIR/RPE，缺失不伪造）→ 肌群负荷 → 按肌群与负荷分级的基础恢复窗口（范围而非固定 48h）→ 多次刺激按时间衰减累加 → 酸痛/疲劳/睡眠反馈修正 → 状态（恢复中/逐渐恢复/预计可训练/需要关注）。所有系数集中在一个带注释的配置文件，标注为产品估计参数。倒计时在客户端按本地时间计算，不请求服务端。
6. **时间与跨日**：时间一律存 UTC ISO，训练日期按 Asia/Tokyo 以开始时间归属；23:50→00:20 的训练归属开始日。
7. **推荐**：确定性规则（恢复状态、本周各肌群有效组数缺口、目标优先级胸背肩腹、当前健身房可用器械）；LLM 仅用于识别与可选的自然语言解释，不生成负荷数字。推荐与实际记录分表保存，未执行的推荐不入记录。
8. **AI 识别 API**：`/api/recognize` 接收压缩后的图片（客户端先缩放到约 1024px），服务端校验大小、超时、有限重试，结构化 JSON 输出，按图片哈希缓存；失败时返回明确错误，前端回退到手动搜索/创建，输入的训练记录不丢。照片可单独删除并连带识别记录。
9. **科学依据**：开发时用 WebSearch 查证 ACSM 抗阻训练立场声明及肌肥大训练量/频率/RIR 相关系统综述，写入 docs/ALGORITHMS.md，每条规则注明「有依据」或「产品估计规则」。

## 阶段与里程碑
- **M0 脚手架**：Next.js + PWA + Dexie schema + seed 数据 + 个人资料/目标设置 + 导入导出 JSON
- **M1 记录**：健身房/器械库、动作库、自定义动作；训练页（上次记录预填、复制上一组、左右分侧三种模式、热身/正式组、RIR/RPE 可选、休息计时、中途退出恢复、补录/修改/删除）
- **M2 识别**：拍照/相册上传 → 服务端识别 → 两阶段选择 → 器械卡片；「都不是」自定义动作；失败回退
- **M3 分析与恢复**：肌群映射、有效组数、负荷、恢复估计、倒计时、反馈输入、重算
- **M4 推荐**：今日推荐、动作替换、渐进超负荷、训练总结
- **M5 游戏化**：正反面肌群恢复地图（左右分显示）、农场视图、成熟交互、减少动效模式
- **M6 历史与成长**：日历、趋势、PR、左右差异、体重曲线、目标进度；移动端与深浅色打磨；部署文档

每个里程碑完成后跑对应测试再继续；全部约定功能完成前不宣称项目结束，未实现项明确标注。

## Verification
- `vitest`：覆盖 13 个验收场景中的算法类（左右不同组数不补齐、方向性动作不映射单侧、卧推辅助肌群计入恢复、辅助重量不当外部负荷、修改 3 组为 2 组后重算、双侧不翻倍、跨日 23:50→00:20 归属与补录重算、自主训练不计未执行推荐、器械替换）
- Playwright（iPhone 视口）：新建训练→记录→刷新数据仍在；断网后可记录；AI 路由返回失败/超时时回退手动登记且草稿不丢；恢复倒计时用模拟时钟推进后状态自动变化；深浅色与减少动效
- 手动：本地 `next build && next start` 验证；无 ANTHROPIC_API_KEY 时识别入口给出明确提示，其他功能不受影响

## 需要用户后续提供
- `ANTHROPIC_API_KEY`（仅服务端环境变量，识别功能用）
- Vercel/GitHub 账号用于部署（我可先在本地完成并写好 DEPLOY.md）
