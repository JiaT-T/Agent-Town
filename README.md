# Agent Town

公开前端地址：

https://jiat-t.github.io/Agent-Town/

## 已实现功能

- 俯视 2D 小镇地图：住宅、咖啡馆、餐厅、图书馆、学校、诊所、工作室、工坊、杂货店、面包店、旅店、邮局、农场、广场、码头等地点。
- 15 个 NPC：包含自由行动居民、建筑内活动店长、固定柜台店员。
- 玩家角色：创建角色后进入小镇，支持 WASD 移动、Shift 加速、E 互动、B 打开背包。
- NPC 行为：日程、needs、A* 寻路、对话、记忆、反思、事件响应、玩家指令响应。
- AI 行为闭环：LLM 生成文本和结构化意图，本地 Action Contract 校验后执行，不让 LLM 直接控制 Phaser 坐标。
- Belief / Rumor：NPC 可以把亲眼所见、听来的谣言、怀疑和证伪信息区分开。
- AI Debug：选中 NPC 后可查看最近 LLM 输出、接受/拒绝动作、belief、rumor、证据和关系变化。
- 玩家广播事件：输入事件后，NPC 会根据兴趣、信念和关系决定是否响应。
- 背包与金币：农场作物可采集进入背包，物品数量显示在格子右下角。
- 交易系统：带 trade profile 的店长/店员支持买卖入口，商品与背包/金币联动。
- NPC 主动委托：NPC 有请求时头顶显示消息图标，玩家靠近按 E 可触发委托对话。
- 对话节奏：NPC-NPC 对话时双方会停下，长文本会切成短句显示。
- 中英文：创建页可选择 English / 中文，静态 UI 和新生成文本会按语言显示。

## 三种模式

### Life Simulation

生活模拟模式。玩家在小镇里自由移动、对话、交易、采集、接受 NPC 委托，也可以广播事件观察 NPC 如何改变计划。

包含：

- NPC 自主日程
- 玩家指令影响 NPC 行为
- 记忆、信念、谣言和关系变化
- 交易、背包、农场采集
- AI Debug 面板

### Protect Mayor

保护镇长模式。玩家知道谁是镇长，需要在白天通过对话和证据判断谁是变形怪。夜晚玩家选择嫌疑人；如果清除所有变形怪则胜利，如果变形怪杀死镇长则失败。

包含：

- NPC-NPC 高频短句对话
- Dialogue History 历史对话
- Evidence Board 证据板
- NPC suspicion 怀疑值
- 夜晚嫌疑人选择
- Win / Lose 结算

### Play Shapeshifter

玩家扮演变形怪。玩家不知道镇长是谁，需要在白天通过有限对话、误导和技能收集线索，夜晚选择目标。如果杀到镇长则胜利；如果多次失败或被 NPC 怀疑过高，则失败。

可用技能：

- Listen：偷听近期对话
- Forge：伪造线索嫁祸他人
- Lure：引诱 NPC 前往合法公共地点

## 如何游玩

1. 打开页面或本地运行项目。
2. 在创建角色界面选择语言、模式、角色信息、外观和 API 配置。
3. 点击 Create 进入小镇。
4. 使用 WASD 移动，Shift 加速。
5. 靠近 NPC、建筑、农作物或事件点后按 E 互动。
6. 按 B 打开背包。
7. 右键拖拽地图，滚轮缩放视角。
8. 点击 NPC 查看右侧状态面板和 AI Debug。
9. 点击 Demo Event 可快速注入演示事件。
10. 在推理模式中，白天收集线索，夜晚完成投票或击杀选择。

## LLM 配置

```bash
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
PORT=8787
```

没有 API Key 或 LLM 请求失败时，Demo 会自动进入 fallback 模式，仍可运行地图、NPC 行为、推理模式、模板对话和本地规则。
