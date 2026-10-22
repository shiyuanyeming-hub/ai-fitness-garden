# AI Fitness Garden

个人用的离线优先健身 PWA：拍照识别器械 → 选动作 → 快速记录（支持左右分侧）→ 自动肌群负荷 → 恢复估计与倒计时 → 每日建议 → 肌肉农场。

> 训练建议只是建议，实际记录才是事实。恢复时间是透明的工程估算，不是生理测量或医学诊断。

## 快速开始

```bash
npm install
cp .env.example .env.local      # 填 ANTHROPIC_API_KEY（只用于拍照识别；不填也能完整使用手动登记）
npm run dev                     # http://localhost:3000
```

没有 API Key 时想体验识别流程：`RECOGNITION_PROVIDER=mock npm run dev`（返回固定的模拟结果）。

| 命令 | 作用 |
|---|---|
| `npm test` | 单元 + 数据层测试（Vitest，67 项） |
| `npm run build && npm run e2e` | 生产构建 + 端到端测试（Playwright，iPhone 尺寸，8 个验收流程，含离线） |
| `npm run lint` | TypeScript 类型检查 |

部署到 iPhone：见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 功能状态

| 模块 | 状态 |
|---|---|
| AI 器械识别（Claude 视觉，服务端代理，两阶段：器械 → 动作，失败回退手动） | ✅ |
| 多功能器械候选动作、「都不是」自定义动作、器械卡片（照片/收藏/最近记录） | ✅ |
| 训练记录：上次自动预填、加一组、热身/正式/递减、RIR/RPE 可选、备注、组间计时、中途退出恢复 | ✅ |
| 左右分侧（相同 / 分别 / 复制到另一侧，组数可不同）、方向性动作（向左/向右） | ✅ |
| 阻力形式：外部负重 / 辅助（越大越轻松）/ 自重 / 弹力带档位；kg/lb | ✅ |
| 肌群映射、有效组数、主次肌群、侧别口径一致（双侧 3 组 ≠ 6 组） | ✅ |
| 恢复估计：累计刺激 + 时间衰减 + 主观反馈 + 个人化系数，倒计时在本机计算 | ✅ |
| 每日建议、3 个月分阶段计划、动作替换、双重渐进超负荷 | ✅ |
| 多健身房、器械清单、当前健身房可练部位 | ✅ |
| 人体正/背面恢复地图（左右分别）、肌肉农场、成就 | ✅ |
| 历史日历、补录/修改/删除（自动重算）、趋势、PR、左右差异、体重、目标进度、推荐 vs 实际对照 | ✅ |
| 离线（Service Worker + IndexedDB）、JSON 备份/恢复 | ✅ |
| 云端同步 / 多设备 | ⏳ 第二阶段（数据层已按可同步设计：UUID、updatedAt、删除墓碑） |
| AI 教练每日建议（结合训练习惯、本周训练量、肌群恢复；重量次数仍由规则计算） | ✅ |
| 「测试 AI 连接」逐项诊断（服务器 / Key / 口令 / 实际调用） | ✅ |
| 推送通知（组间休息结束提醒） | ⏳ 未实现（iOS PWA 限制较多；目前为屏幕提示 + Android 振动） |

## 文档

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：架构、目录、页面、技术选型理由
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md)：数据表、约束、删除规则、与需求实体的对应
- [docs/ALGORITHMS.md](docs/ALGORITHMS.md)：有效组数、恢复模型、推荐、渐进超负荷，以及每条规则的依据或「产品估计」标注
- [docs/DEPLOY.md](docs/DEPLOY.md)：部署、环境变量、安装到 iPhone、备份与长期维护
- [docs/PLAN.md](docs/PLAN.md)：最初的实施计划
