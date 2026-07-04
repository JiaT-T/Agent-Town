# Agent Town

Web 端轻量类 Stanford Generative Agents 多 Agent 小镇 Demo。项目使用 Vite + TypeScript + Phaser 3 展示 NPC 的日程、记忆检索、反思、计划、A* 寻路、对话、事件传播，以及玩家如何通过可控角色影响 NPC 行为。

公开访问地址：

https://jiat-t.github.io/Agent-Town/

> GitHub Pages 只部署静态前端。没有本地 LLM proxy 或后端 API 时，Demo 会自动进入 fallback 模式，仍可展示地图、玩家移动、NPC 行为、事件和模板对话。

## 技术栈

- Vite + TypeScript
- Phaser 3
- DOM HUD
- 本地 Node LLM proxy
- Template fallback provider
- Kenney CC0 外部美术资产

## 本地运行

```bash
pnpm install
pnpm run dev
```

`pnpm run dev` 会同时启动 Vite 前端和本地 LLM proxy。需要单独调试时可以分别运行：

```bash
pnpm run dev:client
pnpm run server
```

生产构建：

```bash
pnpm run build
```

## LLM 配置

复制 `.env.example` 为 `.env`，填入自己的模型配置：

```bash
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
PORT=8787
```

DeepSeek 默认配置：

- Base URL: `https://api.deepseek.com`
- Model: `deepseek-v4-flash`
- Chat endpoint: `/chat/completions`

浏览器直接打开 base URL 没有页面是正常的。真实请求由本地 proxy 转发，前端不会直接暴露 API Key。没有 API Key、proxy 未启动、模型不可用、超时或模型返回非法 JSON 时，Demo 会进入 fallback 模式，继续使用本地规则和模板对话。

## 当前功能

- 俯视海边小镇地图：居民区、中央森林公园、沙滩、海洋、码头。
- 15 个 NPC Agent，包括流动居民、建筑内店长和固定柜台店员。
- 店员/店长系统：固定店员不会离开柜台，店长活动范围限制在所属建筑内。
- 预留交易接口：带 trade profile 的 NPC 会显示 Trade 入口，目前只写入占位日志。
- 玩家 WASD / Shift 控制角色移动，E 与 NPC、事件或建筑互动。
- 创建角色页支持 API 配置和外观 preset / 肤色 / 发型 / 服饰颜色选择；创建完成后才启动 NPC 和 Agent Loop。
- Agent Loop: Observe -> Retrieve -> Reflect -> Plan -> Move -> Act -> Converse -> Remember。
- 玩家 Broadcast 和 Demo Event 会改变 NPC 计划并写入 memories。
- LLM 只生成计划、对话和反思；坐标、碰撞、移动仍由客户端 Agent Loop / 状态机执行。
- Debug: Show Path / Grid / Obstacles，Perf HUD 显示 FPS 和显示对象数量。

## Generative Agents 对齐说明

本项目不迁移 Stanford 原项目的 Django 前端、Tiled 地图和完整服务器结构，而是在当前 Vite + Phaser 客户端中实现核心认知机制：

- Memory Stream：每条记忆包含类型、重要性、poignancy、last accessed、evidence 和 tags。
- Retrieval：按 recency、importance、relevance 三项加权检索，当前 relevance 使用本地词法匹配，后续可接 embedding。
- Reflection：高重要性记忆达到阈值后生成 focal questions、insights，并以 `[reflection]` 写回记忆流。
- Planning：保留日程驱动，同时生成 daily plan 和 task decomposition；LLM 计划必须通过合法地点校验。
- Conversation：NPC-NPC 和 Player-NPC 对话都会写入 memory；玩家连续多轮对话会把最近 turn history 传给 LLM。
- Replay：simulation 会记录 plan、dialogue、reflection、event，用于后续调试或演示回放。

真实 LLM 只负责生成文本和结构化意图，不直接控制 Phaser 坐标、碰撞体或渲染对象。

## 演示流程

1. 打开页面，创建玩家角色。
2. 展示 15 个 NPC 自动出现在不同建筑和小镇区域。
3. 操作玩家用 WASD 走到 Nora 附近，按 E 对话。
4. 点击 `Demo Event` 注入 `18:00 Town Square has a music party`。
5. 点击 Nora 或 Sami，展示 Agent Loop、reason、retrieved memories、reflection。
6. 打开 Show Path，展示 A* 路径不会穿墙或进水。
7. 点击 `17:50`，加速展示 NPC 聚集和事件传播。

## GitHub Pages 部署

仓库包含 `.github/workflows/deploy-pages.yml`。推送到 `main` 后，GitHub Actions 会自动执行：

```bash
pnpm install --frozen-lockfile
pnpm run build
```

并将 `dist/` 发布到 GitHub Pages。

如果首次部署后页面没有出现，需要在 GitHub 仓库设置中确认 Pages 使用 GitHub Actions：

`Settings -> Pages -> Build and deployment -> Source: GitHub Actions`

## 后续优化

- 用更完整的角色动画表替换当前正面小人 + 左右镜像方案。
- 将大地图拆为多个 RenderTexture chunk，进一步降低大分辨率设备上的显存压力。
- 增加真实地图编辑器导出的 tilemap 和更细粒度的家具碰撞。
- 为 LLM prompt 增加更强的 structured intent schema 和回放记录。
