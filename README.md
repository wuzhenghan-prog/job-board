# 求职机会看板

单用户求职机会管理网站。上传同一岗位的多张 JD 截图后，后台视觉模型提取基础信息、职责、要求、能力画像和匹配依据；确认后进入岗位库与六阶段投递看板。

> 这是公开作品展示快照：已移除真实访问码、Cloudflare D1/KV ID 和私人使用数据。部署前请使用自己的 Cloudflare 资源替换 `wrangler.toml` 中的占位 ID。

个人作品集：https://personal-portfolio-ake.pages.dev

## 本地运行

要求 Node.js 24 或更高版本。

```powershell
npm.cmd install
npm.cmd run db:migrate:local
npm.cmd run dev
```

打开 `http://localhost:5173`，首次进入点击“首次设置”并创建至少 12 位的访问码。本地开发密钥保存在 `.dev.vars`，该文件不会提交到 Git。

手机访问需要与电脑处在允许设备互访的同一局域网，并打开 `http://电脑局域网IP:5173`。Windows 防火墙首次询问时必须允许 Node.js 在所用网络类型（通常是“专用网络”）中接收连接。不要使用 `localhost`、`127.0.0.1` 或 VMware 网卡的地址。

如果校园网启用了设备隔离，手机无法直接访问电脑端口；请优先把网站部署到 Cloudflare，或使用受控的 HTTPS 隧道，不要关闭整个防火墙。

本地数据库已有浏览器验收数据时，可以直接登录；如需从空白数据库重做首次设置，请先停止开发服务并删除 `.wrangler/state`，该操作只清理本地开发数据。

本地浏览器验收可能已经创建测试访问码和示例岗位。请用你设置的访问码登录；若不记得本地验收访问码，可停止开发服务后删除 `.wrangler/state` 重置本地数据。

首次进入“设置”页，填写：

- OpenAI 兼容的 Chat Completions HTTPS 地址，例如服务商提供的 `/v1/chat/completions`
- 支持图片输入的消息模型名称
- 你在模型平台充值后取得的 API Key
- 每日识别上限，默认 30 次

如果服务商使用不同于 OpenAI 的请求格式，需要为该服务添加适配器，不能只更换 URL。

能力档案支持导入 Markdown、TXT、Word（`.docx`）和带文字层的 PDF。文档解析在浏览器内完成，原文不会上传；旧版二进制 `.doc` 需先另存为 `.docx`，扫描版 PDF 如无法选中文字则需先做 OCR。

## 验证

```powershell
npm.cmd test
npm.cmd run build
```

浏览器冒烟脚本会启动系统 Chrome，因此本机需要安装 Chrome。脚本位于 `scripts/`，截图输出到 `.codex-visual/`。

## Cloudflare 免费部署

网站使用 Workers Free、D1 Free、R2 Free 和 Queues Free。不要开通 Workers Paid。自定义域名完全可选，第一版可使用免费的 `workers.dev` 子域名。

1. 登录 Cloudflare：`npx.cmd wrangler login`
2. 创建 D1：`npx.cmd wrangler d1 create job-board-db`
3. 将返回的 `database_id` 写入 `wrangler.toml` 的 `REPLACE_WITH_D1_DATABASE_ID`。
4. 创建 R2：`npx.cmd wrangler r2 bucket create job-board-screenshots`
5. 创建队列：`npx.cmd wrangler queues create job-board-extraction`
6. 设置服务端密钥：

```powershell
npx.cmd wrangler secret put SESSION_SECRET
npx.cmd wrangler secret put AI_SECRET
```

两个值都应使用不同的长随机字符串。`AI_SECRET` 用于加密设置页保存的模型 API Key。
这两个值一经用于保存 API Key，不要随意更换，否则需要重新填写模型密钥。

7. 应用线上数据库迁移：

```powershell
npm.cmd run db:migrate:remote
```

8. 构建并部署：

```powershell
npm.cmd run deploy
```

部署完成后访问 Wrangler 给出的 `*.workers.dev` 地址。线上使用 HTTPS，会话 Cookie 会自动启用 `Secure`。

## 数据与隐私

- 原始截图保存在私有 R2，只通过登录后的 API 访问。
- 模型 API Key 以 AES-GCM 加密存入 D1，接口不会把 Key 返回给浏览器。
- 发送给模型的个人档案只含能力摘要，不含姓名、电话和邮箱。
- 删除岗位会删除关联截图对象、面试记录和阶段历史。
- 70 行个人简历与 `career_profile.md` 不会被自动发送或提交到项目仓库。

## 费用边界

Cloudflare 部分按免费套餐设计，不需要服务器订阅。视觉模型调用由你提供的 API Key 支付，网站不提供额度或自动充值。每日上限在请求写入队列前检查，达到上限时返回提示，不继续产生模型费用。

Cloudflare 和第三方模型服务可以调整免费额度与价格；部署后应在 Cloudflare Dashboard 查看实际用量。
