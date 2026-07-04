# Agent Town

Web 端轻量类 Stanford Generative Agents 的 AI NPC 小镇 Demo。项目使用 Vite + TypeScript + Phaser 3，在浏览器中展示 NPC 的日程、记忆、检索、反思、计划、移动、对话、事件传播、玩家交互和社交推理玩法。

公开访问地址：

https://jiat-t.github.io/Agent-Town/

> GitHub Pages 只部署静态前端。没有本地 LLM proxy 或 API Key 时，Demo 会自动进入 fallback 模式，仍可展示地图、玩家移动、NPC 行为、事件、推理模式和模板对话。

## 技术栈

- Vite + TypeScript
- Phaser 3
- DOM HUD
- 本地 Node LLM proxy
- Template fallback dialogue / planning
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

如果 Windows 上 `node.exe` 被系统路径里的 Codex/WindowsApps 版本拦截，项目脚本会自动跳过不可执行的 `node.exe`，改用可运行的本地 Node。也可以直接运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-node.ps1 scripts/dev-all.mjs
```

生产构建：

```bash
pnpm run build
```

如果本机没有 `pnpm`，也可以使用项目已安装的本地依赖执行等价命令：

```bash
node ./node_modules/typescript/bin/tsc
node ./node_modules/vite/bin/vite.js build
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

浏览器直接打开 base URL 没有页面是正常的。真实请求由本地 proxy 转发，前端不会直接暴露 API Key。没有 API Key、proxy 未启动、模型不可用、超时或返回非法 JSON 时，Demo 会进入 fallback 模式，继续使用本地规则和模板对话。

注意：GitHub Pages 公开地址只托管静态前端，不能运行 `server/index.ts`，因此外部访问者如果没有自己的本地 proxy，会看到 fallback。要让公开网址也使用真实 LLM，需要额外部署一个后端 proxy，并把前端 LLM endpoint 指向该后端。

## 为 GitHub Pages 部署 LLM 后端

仓库包含 Vercel serverless proxy：`api/llm/[type].js`。它提供与本地 proxy 一致的接口：

- `GET /api/llm/health`
- `POST /api/llm/test`
- `POST /api/llm/plan`
- `POST /api/llm/dialogue`
- `POST /api/llm/player-dialogue`
- `POST /api/llm/reflection`

推荐部署方式：

1. 在 Vercel 导入 `JiaT-T/Agent-Town`。
2. Framework 选择 `Other` 或保持默认；后端函数会读取仓库根目录的 `api/`。
3. 默认不要在 Vercel 暴露自己的 `OPENAI_API_KEY`，让玩家在创建角色页输入自己的 API Key。
4. 如果你确实要让公开站点共用服务器 API Key，在 Vercel 环境变量中设置：

```bash
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
AIVILIZATION_ALLOW_SERVER_KEY=1
```

这会让任何访问公开站点的人都能消耗该 Key，不建议长期公开使用。

部署完成后，把 Vercel 后端地址写入 GitHub 仓库变量：

```bash
VITE_LLM_ENDPOINT=https://your-vercel-project.vercel.app/api/llm
```

然后重新运行 GitHub Pages workflow。前端会在构建时读取该变量，让 `https://jiat-t.github.io/Agent-Town/` 调用远程 proxy，而不是本机 `127.0.0.1:8787`。

## 当前功能

- 俯视海边小镇地图：居民区、中央森林公园、沙滩、海洋、码头、农场和多栋功能建筑。
- 15 个 NPC Agent：包含流动居民、建筑内店长和固定柜台店员。
- 店员 / 店长系统：固定店员不会离开柜台，店长平时限制在所属建筑内活动，部分紧急行为可临时外出。
- 预留交易接口：带 trade profile 的 NPC 在对话面板中显示 Trade 入口，目前写入占位日志。
- 玩家 WASD / Shift 控制角色移动，E 与 NPC、事件、建筑或农作物交互，B 打开背包。
- 背包与金币：采集农作物会进入背包格子并增加金币，物品数量显示在格子右下角。
- 创建角色页：支持 Life simulation、Protect Mayor、Play Shapeshifter 三种模式，以及 API 配置和外观 preset / 肤色 / 发型 / 服饰颜色选择。
- Agent Loop: Observe -> Retrieve -> Reflect -> Plan -> Move -> Act -> Converse -> Remember。
- LLM 只生成计划、对话、反思和结构化意图；坐标、碰撞、移动和状态机仍由客户端执行。
- 玩家 Broadcast 和 Demo Event 会改变 NPC 计划并写入 memories。
- Debug: Show Path / Grid / Obstacles，Perf HUD 显示 FPS 和显示对象数量。

## 社交推理模式

项目包含两个推理玩法：

- Protect Mayor：玩家知道谁是镇长，需要在白天对话和观察中找出变形怪，夜晚选择嫌疑人。
- Play Shapeshifter：玩家扮演变形怪，白天通过有限对话打听镇长身份，夜晚选择目标。

推理系统当前包含：

- Dialogue History：记录从 Day 1 开始的 NPC-NPC 与 Player-NPC 对话。
- Evidence Board / Town Notes：从对话、镇长误导、夜晚击杀、重复询问路线等事件生成线索卡片。
- NPC Suspicion：NPC 根据线索积累怀疑值，夜晚给出投票提示，但不直接泄露真实身份。
- Shapeshifter Skills：
  - Listen：偷听某个 NPC 的近期对话，生成玩家私有线索。
  - Forge：伪造一条可疑线索嫁祸给目标 NPC。
  - Lure：诱导目标 NPC 前往合法公共地点，仍使用 A* 寻路。
- Role Requests：普通生活模式下，NPC 可按职业给玩家发布小委托，完成后奖励金币、声望和关系。
- Reputation / Trust：玩家声望和 NPC 对玩家的信任会影响变形怪模式中的怀疑增长速度。
- Day Recap：夜晚生成当天复盘，汇总对话数量、证据数量、最高怀疑、请求进展和夜晚结果。

## Generative Agents 对齐说明

本项目不迁移 Stanford 原项目的 Django 前端、Tiled 地图和完整服务端结构，而是在当前 Vite + Phaser 客户端中实现核心认知机制：

- Memory Stream：每条记忆包含类型、重要性、poignancy、last accessed、evidence 和 tags。
- Retrieval：按 recency、importance、relevance 三项加权检索，当前 relevance 使用本地词法匹配，后续可接 embedding。
- Reflection：高重要性记忆达到阈值后生成 focal questions、insights，并以 `[reflection]` 写回记忆流。
- Planning：保留日程驱动，同时生成 daily plan 和 task decomposition；LLM 计划必须通过合法地点校验。
- Conversation：NPC-NPC 和 Player-NPC 对话都会写入 memory；玩家连续多轮对话会把最近 turn history 传给 LLM。
- Replay：simulation 会记录 plan、dialogue、reflection、event，用于后续调试或演示回放。

真实 LLM 只负责生成文本和结构化意图，不直接控制 Phaser 坐标、碰撞体或渲染对象。

## 演示流程

1. 打开页面，创建玩家角色并选择模式。
2. Life simulation：展示 15 个 NPC 自动分布在不同建筑和小镇区域。
3. 操作玩家用 WASD 走到 NPC 附近，按 E 对话。
4. 点击 Demo Event 注入 `18:00 Town Square has a music party`。
5. 点击 Nora 或 Sami，展示 Agent Loop、reason、retrieved memories、reflection。
6. 打开 Show Path，展示 A* 路径不会穿墙或进入水域。
7. 选择 Protect Mayor，查看 Dialogue History、Evidence Board 和夜晚投票提示。
8. 选择 Play Shapeshifter，使用 Listen / Forge / Lure 跑通白天技能和夜晚击杀流程。
9. 夜晚打开 Day Recap，展示当天推理过程和结果复盘。

## GitHub Pages 部署

仓库包含 `.github/workflows/deploy-pages.yml`。推送到 `main` 后，GitHub Actions 会自动执行：

```bash
npm install
npm run build
```

并将 `dist/` 推送到 `gh-pages` 分支用于 GitHub Pages 发布。

如果首次部署后页面没有出现，需要在 GitHub 仓库设置中确认 Pages 使用 `gh-pages / root` 或对应的 Actions/branch 发布设置。

## 后续优化方向

- 将大地图拆为多个 RenderTexture chunk，降低大分辨率设备上的显存压力。
- 为角色补充更完整的方向动画和换装素材。
- 增加真实交易、背包物品使用和经济系统。
- 为推理模式增加尸体发现、公开辩论、更多伪造风险和技能反制。
- 将 relevance 检索升级为 embedding，并记录更完整的 replay 导入 / 导出。
