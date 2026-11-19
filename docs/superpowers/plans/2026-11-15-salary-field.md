# 岗位薪资原文字段实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在岗位识别、保存、编辑和展示链路中加入可空薪资原文，不改变其他业务行为。

**Architecture:** 为 `opportunities` 增加 `salary TEXT`，从视觉模型 JSON、确认草稿、岗位 API 到 React 类型逐层透传；薪资不解析、不筛选、不排序。

**Tech Stack:** React、TypeScript、Hono、Zod、D1、Vitest。

## Global Constraints

- 薪资按截图原文保存，例如“15-25K·14薪”或“面议”。
- 薪资为空时显示“未识别”或“未填写”，不得猜测。
- 不改分类、匹配、投递阶段、页面视觉结构或筛选行为。
- 所有新行为必须先由失败测试覆盖。

### Task 1: 识别与 API 数据契约

- [x] 在 extraction、AI 和 opportunity 测试中加入薪资样例。
- [x] 运行目标测试并确认因缺少 `salary` 字段失败。
- [x] 增加 Zod schema、类型映射、插入值和确认接口透传。

### Task 2: 数据库与索引

- [x] 新增 `0005_salary_field.sql` 为岗位增加可空 `salary` 列。
- [x] 新增 `0006_backfill_assistant_salary.sql` 重建岗位 AI 索引。
- [x] 更新测试数据库迁移加载和目标 API 断言。

### Task 3: 页面展示与编辑

- [x] 在识别确认表单、手动编辑表单中加入薪资输入。
- [x] 在详情、概览和岗位库加入薪资原文。
- [x] 训练 AI 索引包含薪资，不增加任何薪资筛选。

### Task 4: 验证与发布

- [x] 运行全部测试、生产构建和部署预检。
- [x] 部署 D1 增量迁移、Worker 与 Pages。
- [x] 用公网页面和真实识别结果验证薪资原文。
