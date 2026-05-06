# Smart Image Gen — SillyTavern 扩展

NSFW 感知 ComfyUI 直连生图扩展。中文意图分类 → 英文 booru tag 自动映射，支持 Pony Realism / NoobAI vPred / majicMIX 三模型路由，配合 [smart-phone-st](https://github.com/Xinshuer/smart-phone-st) 可实现角色一致性参考图工作流。

## 功能亮点

- **ComfyUI 直连** — POST `/prompt` + 轮询 `/history` + 取 `/view`，三个工作流模板内联代码（无需外部 json 文件）
- **三模型路由**：
  - **Pony Realism**（832×1216, cfg 6.5, dpmpp_2m_sde+karras）— 欧美写实/默认
  - **NoobAI vPred**（832×1216, cfg 7.0, euler+normal）— 动漫/暗调，含 RescaleCFG (0.7) + LoRA strength 0.5
  - **majicMIX v7**（768×1152, cfg 7.0, euler_ancestral+karras）— 亚洲写真
- **中文 NSFW 词典** — "奶子/小穴/掏出/脱光" 自动映射到 `topless / pussy / breasts out / nude` 等 booru tag
- **SFW 守门** — 用户没显式触发 NSFW 时自动剥离 AI 偷塞的裸露词，防止意外裸露
- **角色锁定** — 配合 smart-phone-st 时，参考图与聊天图复用同一 seed + sdPrompt，跨消息保持外貌一致

## 安装

### ST 扩展菜单一键装（推荐）

1. SillyTavern 扩展菜单 → 安装扩展（URL）
2. 填入：`https://github.com/Xinshuer/smart-image-gen-st`
3. 重启酒馆，扩展菜单里勾选启用

### 手动安装

```bash
cd SillyTavern/data/default-user/extensions/
git clone https://github.com/Xinshuer/smart-image-gen-st.git
```

## 配置

ComfyUI 启动时必须加 CORS 头，否则浏览器会拦：

```bat
python main.py --enable-cors-header *
```

ComfyUI 地址默认 `http://127.0.0.1:8188`，可在 smart-phone 设置页修改。

## 模型要求

需要在 ComfyUI 安装：
- **Pony Realism** 模型 + 对应 VAE
- **NoobAI vPred** 模型 + 对应 LoRA（可选）
- **majicMIX v7** 模型

模型不全也能用，只要选用已安装的那个即可。

## 与 smart-phone-st 的协作

- smart-phone-st 解析 AI 输出的 `<pic prompt="...">` 标签
- 通过 `window.smartImageGen.generateFromPicTag(picTag, { contacts, hint })` 调用本扩展
- 本扩展返回 imageUrl，smart-phone 把它插入手机 UI

也能独立使用：本扩展会监听所有 AI 消息中的 `<pic prompt="...">` 标签自动生图（当 smart-phone 没启用时）。

## 触发 NSFW

用户消息含以下词时切到 explicit 模式（生成裸露/性描写图像）：

- 阴部：小穴 / 阴道 / 阴蒂 / 肉穴 / 蜜穴 / 骚穴 / 屄 ...
- 胸部：奶子 / 咪咪 / 乳头 / 乳晕（→ topless / nipples）
- 肛部：屁眼 / 屁穴 / 菊穴 / 肛门 ...
- 阳具：屌 / 鸡巴 / 阴茎 / 肉棒 / 男根 / 巨根 ...
- 行为：做爱 / 操 / 内射 / 自慰 / 高潮 / 潮吹 ...
- 暴露：脱光 / 全裸 / 裸体 / 掏出 / 露胸 / 撩起 / 解开 ...

完整词典见 `lib/nsfw-classifier.js`。

## 许可

MIT
