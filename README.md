# SEO & GEO Audit Agent

基于 DeepSeek 的开源搜索可见性审核工具。输入网页 URL 后，Agent 会抓取页面并分别执行 **SEO（搜索引擎优化）**与 **GEO（生成式引擎优化）**审核，最终生成评分、证据和可执行的优化清单。

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 功能特性

- Agent 流水线：规划、抓取、信号提取、SEO/GEO 并行审核、行动清单与报告持久化
- SEO 与 GEO 可单独或组合运行，未选择的审核不会调用 LLM
- 综合评分：双审核采用 SEO 55% + GEO 45%，单审核直接使用对应分数
- 支持 PC、Mobile、Googlebot 与 Baiduspider 等抓取身份
- 支持多 URL 批量审核、历史报告、多用户隔离和管理员管理
- 内置 SSRF、CSRF、会话加固和登录会话再生等安全控制

## 系统截图

### 审核工作台

![SEO 与 GEO 审核工作台](docs/images/workspace.png)

### Agent 执行进度

![Agent 审核执行进度](docs/images/agent-progress.png)

### 审核报告

![SEO 与 GEO 审核报告](docs/images/report.png)

截图使用隔离环境中的合成账号、`example.com` 和演示报告生成，不包含真实密钥或用户数据。

## 工作原理

```text
URL 输入
  ↓
安全抓取与 DNS/IP 校验
  ↓
页面信号提取
  ↓
SEO 审核  ∥  GEO 审核
  ↓
评分合成与行动优先级
  ↓
SQLite 报告与历史记录
```

## 快速开始

环境要求：Node.js 18 或更高版本。

```bash
git clone https://github.com/lorin-code/seo-geo-audit-agent.git
cd seo-geo-audit-agent
npm install

cp .env.example .env
# 编辑 .env，填写 DeepSeek API Key、会话密钥和首次管理员凭据

npm start
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。首次启动且用户表为空时，服务会根据环境变量创建管理员账号。

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | 是 | — | DeepSeek API Key，仅用于 SEO/GEO 模型调用 |
| `SESSION_SECRET` | 生产环境必填 | 开发环境内置回退值 | Cookie 会话签名密钥 |
| `PORT` | 否 | `3000` | HTTP 服务端口 |
| `DEFAULT_ADMIN_USERNAME` | 首次初始化时需要 | — | 用户表为空时创建的管理员用户名 |
| `DEFAULT_ADMIN_PASSWORD` | 首次初始化时需要 | — | 管理员密码，至少 12 个字符 |
| `LOG_LEVEL` | 否 | `info` | Winston 日志级别 |
| `NODE_ENV` | 否 | `development` | 设为 `production` 时强制 secure cookie |

请勿把 `.env`、数据库或日志提交到 Git。仓库只提供不含密钥值的 `.env.example`。

## 使用方式

1. 登录后进入审核工作台。
2. 输入 URL，选择抓取身份以及 SEO、GEO 审核范围。
3. 提交任务并查看 Agent 时间线和实时进度。
4. 完成后查看综合评分、主要发现、证据和优先级行动清单。
5. 在历史页管理报告；管理员可创建和管理用户。

批量模式支持多 URL 输入，前端默认最多同时提交 3 个任务。

## API 概览

| 路由 | 说明 |
|---|---|
| `POST /api/login`、`POST /api/logout`、`GET /api/check-session` | 认证与会话 |
| `GET/POST/PUT/DELETE /api/users` | 用户管理，仅管理员可用 |
| `POST /api/agent/jobs` | 创建 SEO/GEO Agent 任务 |
| `GET /api/agent/jobs/:id` | 获取任务状态与步骤进度 |
| `POST /api/save-report` | 保存报告 |
| `GET /api/get-history`、`GET /api/get-report` | 获取历史和报告详情 |
| `DELETE /api/reports/:id` | 删除当前用户有权访问的报告 |

除登录接口外，业务接口均需要有效 Cookie 会话。

## 项目结构

```text
server.js                 Express 入口、中间件和路由
server/
  agent_runner.js         Agent 流水线编排
  agent_store.js          任务与步骤持久化
  agent_routes.js         Agent API
  fetcher.js              安全抓取与 SSRF 防护
  page_signals.js         页面信号提取
  seo_analyzer.js         SEO 审核
  geo_analyzer.js         GEO 审核
  report_composer.js      评分与行动清单合成
  auth.js                 密码与权限控制
  security.js             会话与 CSRF 安全策略
  db.js                   SQLite 数据访问
web/                      原生 HTML、CSS 与 JavaScript 前端
test/                     Node.js 测试
docs/images/              README 脱敏截图
```

## 测试

```bash
npm test
```

测试覆盖 Agent 路由与流水线、任务存储、报告合成、页面信号、SSRF、防 DNS rebinding、CSRF、会话安全和公开仓库元数据。

## 安全说明

- 抓取前解析目标域名并拒绝私网、环回及其他不安全地址；网络请求锁定已验证地址以降低 DNS rebinding 风险。
- 写请求校验 `Origin` 或 `Referer` 是否同源。
- 会话 Cookie 使用 `httpOnly` 和 `sameSite`，登录时重新生成会话；生产环境强制 `secure`。
- 用户密码使用 bcrypt 哈希，不以明文存储。
- 生产环境必须配置高强度 `SESSION_SECRET`，并妥善保护 DeepSeek API Key。

如发现安全问题，请不要在公开 Issue 中粘贴密钥、用户数据或可直接利用的敏感细节。

## 已知限制

- 任务在应用进程内执行，尚未接入独立队列或全局并发限制。
- LLM 请求当前没有独立超时；上游长时间无响应可能导致任务挂起。
- 任一已选择的审核失败会使整个任务失败，不保留另一方向的部分结果。
- 前端通过 CDN 加载 Tailwind CSS 和 Font Awesome，离线环境无法完整显示。

## 参与贡献

欢迎提交 Issue 和 Pull Request。提交前请运行 `npm test`，并确保新增示例、日志和截图不包含真实凭据或用户数据。

## License

本项目采用 [MIT License](LICENSE)。

## 作者

你好小赵同学（轻描淡写这一页）

- GitHub：https://github.com/zw-user1202
- 邮箱：3535188074@qq.com
- 微信：EA7_1202
