# 数据模型

存储：浏览器 IndexedDB（Dexie），库名 `ai-fitness-garden`，定义见 `src/data/db.ts`。所有主键为 UUID（内置动作/器械用稳定字符串 id）。时间一律存 UTC ISO 字符串；「训练属于哪一天」按**开始时间**在用户时区（默认 Asia/Tokyo）计算。

## 表

| 表 | 对应需求实体 | 说明 |
|---|---|---|
| `profile` | UserProfile + Goal | 单行 `id="me"`：身高、体重、经验、时区、每周天数、每次时长、部位优先级（重点/维持/暂不优先）、目标列表、开始/目标日期、排除动作、伤痛限制、当前健身房 |
| `trainingPlans` | TrainingPlan | 计划记录（开始/结束/状态）。阶段内容由 `buildPlan(profile)` 派生 |
| `gyms` | Gym | |
| `equipmentTypes` | Equipment（自定义部分） | 内置 52 类在代码里（含有氧器械）（`seed/equipment.ts`），用户新建的存这里 |
| `gymEquipment` | GymEquipment | 某健身房的一台实际器械：类型、自定义名、品牌、型号、照片、可用、收藏、最近使用 |
| `exercises` | Exercise（自定义部分） | 内置 94 个在代码里；自定义力量动作含完整肌群映射，自定义有氧动作不映射肌群 |
| `equipmentExercises` | EquipmentExercise（自定义部分） | 用户建立的器械↔动作关联，可限定到某台器械。内置关联在 `Exercise.equipmentTypes` |
| `sessions` | WorkoutSession | status: active/completed；source: planned/free/imported；recommendationId；主观疲劳；备注 |
| `workoutExercises` | WorkoutExercise | 一次训练中的一个动作；gymEquipmentId（可空）；entryMode（左右相同/分别，仅 UI） |
| `sets` | WorkoutSet | side(left/right/both)、movementDirection(left/right/none)、setType、loadValue/loadUnit/loadKind、reps、duration、distance、rir、rpe、**completedAt（null = 未确认，不计入训练）**、notes |
| `feedback` | RecoveryFeedback | 每日精神/睡眠（muscleId=null）或某肌群某侧的酸痛/疼痛 |
| `bodyWeights` | BodyWeightLog | 每天一条，记录后同步更新 profile.weightKg |
| `photos` | — | 压缩图（≈1024px）与缩略图 Blob、SHA-256 指纹 |
| `recognitionLogs` | RecognitionLog | 指纹、照片、状态（success/failed/confirmed/corrected）、模型结果、确认的器械/动作 |
| `recommendations` | DailyRecommendation / PlannedWorkout | 每天首次展示的推荐快照 + 按推荐开始时的快照。只用于对照，不是训练事实 |
| `tombstones` | — | 删除记录（表名+id+时间），供合并导入与未来同步 |
| `meta` | — | 安装时间、上次备份时间、访问口令等本机设置 |

**MuscleLoad / RecoveryEstimate 没有建表**：它们是派生数据，每次渲染由 `computeDerived()` 从事实重算（个人规模的数据量下耗时为毫秒级），带 `calculationVersion` 标签。这样不存在「缓存过期」或「重复累计」的问题。

## 关键约束与校验（`repo.ts`）

- 重量 0–1000、次数 0–1000 且为整数、RIR 0–10、RPE 1–10、时间 0–36000 秒、体重 20–300kg；非法值拒绝写入并提示。
- 没有次数/时间/距离的组不能打勾完成。
- 训练结束时间不能早于开始，一次训练不超过 12 小时；修改开始时间时，该次训练内所有动作和组的时间一起平移。
- 结束训练时，未打勾的预填组被删除（并提示数量），永远不会被当作真实训练。
- 补录的训练直接以「已完成」创建，打勾时时间戳落在该次训练内，而不是「现在」。
- 自定义动作已有训练记录时不能删除（只能改名和改肌群；改肌群后历史会按新映射重算）。
- 至少保留一个健身房。

## 删除规则

| 删除 | 结果 |
|---|---|
| 训练 | 级联删除其动作和组，写墓碑；所有统计/恢复/推荐自动重算 |
| 动作（训练内） | 级联删除其组 |
| 器械卡片 | 删除照片及其识别记录；历史训练保留 gymEquipmentId（显示为「已删除的器械」） |
| 健身房 | 删除其器械清单与照片；历史训练保留 |
| 照片 | 同时删除引用它的识别记录，器械卡片的照片置空 |

## 侧别存储

- 双侧动作：每组一行，`side=both, movementDirection=none`。
- 单侧 / 左右交替：左右各自一条「泳道」，`side=left|right`，`setIndex` 在各自泳道内编号，两侧组数可以不同。
- 有氧（`kind = cardio`）：每一「段」一行，`durationSeconds`（界面按分钟输入）、可选 `distanceM`（界面按公里）、可选 `rpe` 作为强度 1–10。
- 方向性（躯干旋转、Pallof、伐木）：`side=both, movementDirection=left|right`。方向不等于肌群侧别，肌群映射用 `directional_uncertain` 规则，只记核心整体负荷。

## 备份格式

```json
{ "format": "ai-fitness-garden-backup", "version": 1, "exportedAt": "...",
  "tables": { "profile": [...], "sessions": [...], "sets": [...], ..., "tombstones": [...] },
  "photos": [{ "id", "hash", "createdAt", "data": "data:image/jpeg;base64,...", "thumb": "..." }] }
```

导入：「合并」按 id 匹配、`updatedAt` 新的覆盖、应用墓碑，同一文件重复导入是幂等的；「完全替换」先清空本机再导入。
