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
        injectPositive: 'dogeza, prostration, all fours, head down, top-down bottom-up',
        injectNegative: '',
        weight: { model: 0.85, clip: 0.85 },
        requireNSFW: true,
        priority: 10,
        notes: '全裸土下座 — 作者推荐 CFG 5-7 / steps 25-40；DMD2 路径下效果减弱',
    },
    {
        id: 'spread_anus_anima',
        file: 'LoRA2FSpreadAnusAnimaPreview3.safetensors',
        baseModel: 'illustrious', // Anima 是 CircleStone 的 Illustrious 派生
        triggers: [
            /(?:掰开|两指).{0,5}(?:肛|屁眼)/,
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
        // 通用 18R 姿势库 — 任意 NSFW 性行为关键词激活作铺底
        triggers: [
            /(?:操|肏|干|做爱|搞|进|插|顶|捅)(?:她|你|妈|妹|姐|妻|女|逼|穴|屄)/,
            /missionary|cowgirl|doggystyle|reverse cowgirl|spooning/i,
            /mating press|paizuri|titfuck|fellatio|deepthroat|cunnilingus/i,
            /骑乘|后入|正常位|侧位|颜面骑乘|乳交|口交|深喉|颜射|内射|中出/,
            /sex|fucking|penetration|orgasm/i,
        ],
        injectPositive: '', // 作者明示无 trigger token，纯作姿势 prior 铺底
        injectNegative: '',
        weight: { model: 0.45, clip: 0.45 }, // 作者推荐起始 0.4 — 不抢主导
        requireNSFW: true,
        priority: 1, // 最低 — 优先让位特异性 LoRA，cap 时第一个被丢
        notes: '1500 张 18R 姿势库通用 LoRA — 任意 NSFW 体位铺底，无 trigger，权重起始 0.4',
    },
    {
        id: 'pinned_doggy_il',
        file: 'Pinned_sex__pinned_doggystyle__pinned_pronebone__etc___-_Illustrious_V2_epoch_10.safetensors',
        baseModel: 'illustrious',
        triggers: [
            /pinned\s+(?:doggy|prone)/i,
            /按住.{0,4}(?:狗趴|后入|趴|操|干)/,
            /压住.{0,3}(?:操|干|做)/,
            /按头.{0,2}(?:操|干|做|顶)/,
            /(?:pinned doggystyle|pinned pronebone|prone bone)/i,
        ],
        injectPositive: 'pinned doggystyle, head pinned down, held down',
        injectNegative: '',
        weight: { model: 0.85, clip: 0.85 },
        requireNSFW: true,
        priority: 10,
        notes: 'Illustrious V2 — 75% pinned doggy + 10-20% pronebone；剩余少量其他体位',
    },
];
