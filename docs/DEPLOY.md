# 部署与长期维护

## 1. 部署到 Vercel（推荐）

1. 登录 https://vercel.com （可用 GitHub 账号），点 **Add New → Project**，导入 `shiyuanyeming-hub/ai-fitness-garden`。
2. Framework 会自动识别为 Next.js，构建命令和输出目录保持默认。
3. 在 **Environment Variables** 添加：

| 变量 | 必填 | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 识别功能需要 | 在 https://console.anthropic.com 创建。只在服务器端使用，**不要**加 `NEXT_PUBLIC_` 前缀 |
| `APP_ACCESS_TOKEN` | 强烈建议 | 任意一串随机文字。部署后的网址是公开的，没有口令时别人也能调用你的识别接口、消耗你的额度。设置后在应用「我的 → AI 识别设置」里填同一个口令 |
| `RECOGNITION_MODEL` | 可选 | 默认 `claude-sonnet-5-5` |
| `COACH_MODEL` | 可选 | AI 每日建议用的模型，默认同 `RECOGNITION_MODEL` |
| `RECOGNITION_PROVIDER` | 仅测试 | 设为 `mock` 返回固定的模拟结果，不调用 AI |

4. 点 Deploy。之后每次推送到 `main` 都会自动重新部署。

> 不配置 API Key 也能完整使用：拍照识别会提示「未配置」，手动搜索/创建器械、记录、恢复估计、推荐都不受影响。

**检查是否接通**：App「我的 → AI 设置 → 测试 AI 连接」会逐项检查：服务器 → API Key → 访问口令 → 实际调用一次模型（只用几个 token），哪一步失败就显示哪一步的原因。

**口令排查**：
- 显示「还没有填写访问口令」：这台设备（或这个主屏幕 App）里没填。注意主屏幕 App 和 Safari 标签页的设置是分开的。
- 显示「不一致」：区分大小写。全角字符、首尾空格和换行会被自动忽略。改了 Vercel 里的变量后必须 **Redeploy** 才生效。
- 口令输入框不再是密码框，iOS 不会再用钥匙串密码自动替换它；输入时自动保存，并显示已保存的字符数。

**成本控制**：手机端先把照片压缩到约 1024px；同一张照片在本机和服务器都有缓存，不会重复调用；每次识别约一次视觉请求。

## 2. 安装到 iPhone

1. 用 **Safari** 打开部署后的网址。
2. 分享按钮 → **添加到主屏幕**。
3. 以后都从主屏幕图标打开。

重要：**主屏幕 App 和 Safari 标签页的数据是分开存放的**。请一直从主屏幕图标使用。第一次打开后，即使健身房没有信号也能记录。

## 3. 数据备份

数据只保存在手机的浏览器存储里，删除 App、清除网站数据或换手机都会丢失。

- 「我的 → 数据备份 → 导出 JSON」，保存到「文件」App 或 iCloud Drive。建议每 1–2 周一次（超过 14 天未备份会以黄色提示）。
- 换手机/恢复：在新设备上安装 → 「选择备份文件…」。
  - **合并**：按记录 id 合并，更新时间较新的保留，同一个文件导入多次也不会重复。
  - **完全替换**：清空本机后导入。
- 「导出（含照片）」会把器械照片也打包（文件较大）。

应用启动时会向浏览器申请「持久存储」，降低被系统自动清理的可能，但仍请定期备份。

## 4. 本地运行

```bash
npm install
cp .env.example .env.local   # 可只填 ANTHROPIC_API_KEY
npm run dev                  # 开发模式（不注册 Service Worker）
npm run build && npm start   # 生产模式（离线功能生效）
```

手机在同一局域网测试时，注意 iOS 的相机和 Service Worker 需要 HTTPS（`localhost` 除外），所以手机上的完整测试请用 Vercel 的预览部署。

## 5. 测试

```bash
npm test                     # 67 项单元/数据层/接口测试
npm run build && npm run e2e # 9 个端到端验收流程（自动以 mock 识别启动生产服务器）
```

## 6. 长期维护

- **依赖升级**：每几个月运行 `npm outdated`，升级后跑 `npm test && npm run build && npm run e2e`。
- **改算法**：只改 `src/core/params.ts`，递增 `CALCULATION_VERSION`，同步更新 `docs/ALGORITHMS.md`。历史数据会自动用新规则重算（派生数据不持久化）。
- **改数据结构**：在 `src/data/db.ts` 新增 `version(n)` 并写 `upgrade()`，不要修改已有版本；同时更新 `BACKUP_VERSION` 的兼容处理。
- **更新 App 缓存**：修改 `public/sw.js` 的 `VERSION` 常量会让手机在下次联网打开时更新缓存。
- **换识别模型/供应商**：设置 `RECOGNITION_MODEL`，或实现 `RecognitionProvider` 接口。

## 7. 后续升级建议

1. **云同步（第二阶段）**：Supabase/Postgres，按 `updatedAt` 做最后写入优先，用 `tombstones` 传播删除；登录后首次同步用「合并」逻辑。
2. **识别质量**：把用户纠正过的识别（`recognitionLogs.status = corrected`）作为少样本示例回传给模型；为常去的健身房缓存品牌/型号。
3. **个人化恢复**：积累 2–3 个月反馈后，按肌群拟合 τ（目前是有界的逐步调整）。
4. **训练解释**：用 LLM 把规则引擎输出的原因改写成更自然的话（数字仍由规则计算）。
5. **Apple Health**：PWA 无法直接写入；如需要可考虑 Capacitor 打包成原生壳。
6. **休息结束提醒**：iOS 16.4+ 支持主屏幕 PWA 的 Web Push，但需要推送服务端。
