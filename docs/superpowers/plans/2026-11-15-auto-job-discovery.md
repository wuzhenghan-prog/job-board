# 自动岗位发现 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 每日从公开网页发现适合用户的岗位，生成待审核推荐，且不自动创建正式岗位。

**Architecture:** Cloudflare Cron 创建幂等运行记录并投递独立 Queue；消费者先做公开搜索和硬过滤，再用一次批量模型调用结构化和评分，结果写入 Discovery D1 表。用户确认推荐后才创建正式 Opportunity。

**Tech Stack:** React、TypeScript、Hono、Zod、D1、Cloudflare Queues、Workers Cron、Vitest、Playwright。

## Global Constraints

- 自动发现默认关闭，保存有效偏好并启用后，次日北京时间 08:00 运行。
- 自动任务只写偏好、运行记录和推荐，不写 `opportunities`。
- 每轮最多 20 个候选、10 个推荐，最多一次批量模型调用。
- 手动刷新每日最多 3 次，间隔至少 30 分钟。
- 推荐保留 30 天、最多 200 条，按规范 URL 和公司+岗位+地点指纹去重。
- 仅使用公开网页，不接登录态、Cookie、验证码或自动投递。
- 保存推荐必须先经过可编辑确认表单。

### Task 1: 领域模型和迁移

- [x] 编写失败测试：偏好校验、URL 规范化、薪资保守解析、去重指纹、保留清理。
- [x] 运行测试确认模块缺失。
- [x] 新增 Discovery D1 表和类型；实现纯领域函数。
- [x] 运行目标测试并提交。

### Task 2: 公开岗位搜索和模型评分

- [x] 用固定 HTML、Bing RSS 和假模型响应编写失败测试。
- [x] 实现 JSON-LD `JobPosting` 解析、正文兜底、硬过滤和批量模型契约。
- [x] 验证最多 20 个候选、最多 10 个推荐、无候选不调用模型。
- [x] 运行目标测试并提交。

### Task 3: Queue、Cron 和 API

- [x] 编写失败测试：定时幂等、手动限流、Queue 重试、保存推荐后仅创建一个正式岗位。
- [x] 新增 Cron scheduled handler、Queue dispatcher 和 `/api/discovery/*` 子路由。
- [x] 实现偏好、状态、刷新、忽略、确认保存和清理。
- [x] 运行目标测试并提交。

### Task 4: 岗位库发现视图

- [x] 编写失败组件测试：双视图、禁用空状态、偏好、推荐卡、保存和忽略。
- [x] 实现发现视图、偏好表单、推荐确认页和概览站内提醒。
- [x] 保持手机五项底栏和现有 Apple 式视觉变量。
- [x] 运行组件测试并提交。

### Task 5: 全量验证与发布

- [x] 运行全部测试、生产构建、本地迁移和 Wrangler 预检。
- [x] 备份 D1 恢复点，创建 `job-board-discovery` Queue，应用迁移并部署 Worker/Pages。
- [x] 用真实公开岗位运行一次发现，审核保存一个测试推荐后清理。
- [x] 验证手机发现视图、Cron 状态和旧岗位/AI 助理无回归。
