// v0.11.19 触发式 LoRA 系统 — 注册表
// 每个 LoRA 配置项：
//   id              唯一标识（priority tie-break 时按字母序）
//   file            ComfyUI/models/loras/ 下的文件名（可含子目录前缀）
//   baseModel       架构家族 'illustrious' | 'pony' | 'sdxl' | 'sd15'
//   triggers        RegExp[] 任一命中即激活（同时扫 userText + aiPrompt）
//   injectPositive  string  匹配后追加到正面 prompt 的 booru tag（trigger token + 强化词）
//   injectNegative  string  追加到负面 prompt
//   weight          { model, clip }  作者推荐权重
//   requireNSFW     bool    true 时仅 intent.level==='explicit' 才激活
//   priority        number  冲突时高优先级胜出（同优先级按 id 字母序）
//   conflictsWith   string[] 命中该 LoRA 时禁用列表里的其他 LoRA
//
// 架构兼容性铁律：LoRA 必须跟底模同架构。SDXL/Illustrious/Pony/SD1.5 互不通用。
// 用户当前 6 个模型架构映射（见 lora-matcher.js MODEL_ARCH）：
//   nova_asian_il / unholy_desire / diving_illustrious → illustrious
//   wai_anihentai / asian_realism → pony (PONY-XL)
//   lustify_v8 → sdxl (非 Pony 非 IL)

export const LORA_REGISTRY = [
    {
        id: 'dogeza_il_v1',
        file: 'Dogeza (Pose) Illustrious.safetensors',
        baseModel: 'illustrious',
        triggers: [
            /土下座/,
            /dogeza/i,
            /跪伏/,
            /叩首/,
            /叩拜/,
        ],
        // v0.11.21 重写姿势锚 tag — 之前的 `all fours / top-down bottom-up` 跟仰躺岔腿不互斥，
        // LoRA 加权后模型回退到训练集常见的"裸体仰躺"模式（用户实测 bug）。
        // 新版用更具体的姿势锚 + 反向 negative 双向锁定。
        injectPositive: 'dogeza, kneeling, forehead to floor, head down, bowing deeply, prostration, ass up, hands flat on floor, back of head visible, no eye contact',
        // v0.11.21 反向压制竞争姿势：仰躺 / M 字开腿 / 面对镜头 — 这些是 dogeza 出错的常见 fallback
        injectNegative: 'looking at viewer, face visible, eye contact, on back, lying on back, supine, m_legs, spread legs wide open, leg lift, frog legs, missionary, face up, face shown',
        weight: { model: 0.85, clip: 0.85 },
        requireNSFW: true,
        priority: 10,
        notes: '全裸土下座 — 作者推荐 CFG 5-7 / steps 25-40；DMD2 路径下效果减弱（切 unholy_desire 满血）',
    },
    {
        id: 'spread_anus_anima',
        file: 'LoRA2FSpreadAnusAnimaPreview3.safetensors',
        baseModel: 'illustrious', // Anima 是 CircleStone 的 Illustrious 派生
        triggers: [
            /(?:掰开|两指).{0,5}(?:肛|屁眼)/,
            /掰开屁眼/, // v0.11.21 用户明确要求显式补一条
            /掰肛/, // v0.11.21 短形式（"她在掰肛"），上面长 regex 不命中"掰肛"两字版本
            /spread.{0,3}anus/i,
            /presenting anus/i,
            /anal invitation/i,
        ],
        // 作者明示 4 个 trigger token，全部注入
        injectPositive: '2-fingers spreading anus, spreading own anus, anal invitation, presenting anus',
        injectNegative: '',
        weight: { model: 0.9, clip: 0.85 },
        requireNSFW: true,
        priority: 15,
        notes: 'Anima 派生（CircleStone 非商用许可）；输出图可商用，但禁止用于训练竞争 model',
    },
    {
        id: 'dogeza_concept_v5',
        file: 'Concept-dogezaV5-000007.safetensors',
        baseModel: 'sd15', // ⚠️ 用户确认是 SD 1.5；当前 6 个模型均 SDXL 派生 → 不会激活
        triggers: [/土下座/, /dogeza/i],
        injectPositive: 'dogeza, clothes removed, completely nude, from above',
        injectNegative: '',
        weight: { model: 1.0, clip: 1.0 },
        requireNSFW: true,
        priority: 5,
        notes: '⚠️ SD 1.5 — 当前架构不兼容，纸面占位；如未来加 SD 1.5 模型则自动启用',
    },
    {
        id: 'xiaoxiao_pose',
        file: 'XiaoXiao_Pose.safetensors',
        baseModel: 'illustrious',
        // v0.11.21 大幅缩窄触发 — 之前 trigger 列表包含基础 missionary/cowgirl/doggy/任意 sex+pronoun，
        // 导致每个 NSFW 场景都自动启用 → 模型对简单姿势 prior 本来就强，xiaoxiao 1500 张 18R 数据
        // 反而把简单画面拉向复杂同人风。新版只匹配模型**搞不定**的复杂/复合体位。
        triggers: [
            // 复合英文体位词（模型 prior 弱）
            /mating press|piledriver|spitroast|reverse cowgirl|facesitting|amazon position|full nelson/i,
            /double penetration|triple penetration|gangbang|group sex|ffm threesome|mmf threesome/i,
            /deepthroat|irrumatio|throat bulge|throat fuck/i,
            /pile driver|prone bone/i,
            // 复合中文体位词
            /种付|压头种付|颜面骑乘|坐脸|双龙|一前一后|前后夹击|三明治|倒立位|折叠位|屈曲位/,
            // 多人 / 群交
            /(?:双飞|3p|4p|5p)/i,
            /(?:多人|N人)(?:轮流|操|玩)|轮(?:奸|流操|流干)/,
            // 顶喉特化（不是普通口交）
            /顶喉|喉深|喉肉/,
        ],
        injectPositive: '', // 作者明示无 trigger token，纯作姿势 prior 铺底
        injectNegative: '',
        weight: { model: 0.45, clip: 0.45 }, // 作者推荐起始 0.4 — 不抢主导
        requireNSFW: true,
        priority: 1, // 最低 — 优先让位特异性 LoRA，cap 时第一个被丢
        notes: '1500 张 18R 姿势库 — 仅在"模型搞不定的复合体位"触发（mating press / 颜面骑乘 / 双龙 / 多人 / 顶喉），简单 missionary/doggy/cowgirl 不触发',
    },
    {
        id: 'pinned_doggy_il',
        file: 'Pinned_sex__pinned_doggystyle__pinned_pronebone__etc___-_Illustrious_V2_epoch_10.safetensors',
        baseModel: 'illustrious',
        // v0.11.21 缩窄 trigger — LoRA 训练 75% 是 doggy/prone 体位，不是通用"被按住"。
        // 之前 /压住.{0,3}(?:操|干|做)/ 跟 /按头.{0,2}(?:操|干|做|顶)/ 不要求体位是 doggy/prone，
        // 在按住正常位 / 按住侧位 等场景都会误激活。改成强制要求 pin 动作词 + doggy/prone 上下文。
        triggers: [
            // 英文必含 pinned + doggy/prone
            /pinned\s+(?:doggy|prone)/i,
            /(?:pinned doggystyle|pinned pronebone|prone bone)/i,
            // 中文：按头/按背 必须搭配 后入/趴
            /按(?:头|背).{0,3}(?:狗趴|后入|从后|趴|prone|doggy)/i,
            // 中文：按住/按倒/压住 + doggy/prone 体位词
            /(?:按住|按倒|压住).{0,3}(?:狗趴|后入|趴下|趴着|prone)/,
            /(?:按|压|按住|压住)(?:头|背|身).{0,5}(?:从后|后入|背入|趴)/,
        ],
        injectPositive: 'pinned doggystyle, head pinned down, held down, face down ass up',
        injectNegative: '',
        weight: { model: 0.85, clip: 0.85 },
        requireNSFW: true,
        priority: 10,
        notes: 'Illustrious V2 — 75% pinned doggy + 10-20% pronebone；触发需明确 pin 动作 + doggy/prone 组合，普通"按住操"不触发',
    },
];
