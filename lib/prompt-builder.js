// Build positive/negative prompts per model.
// Inputs: { aiPrompt, characterAnchor, intent: {level, tags}, model }
// Output: { positive, negative, width, height, cfg, steps, sampler, scheduler }
//
// Honors:
//   - SFW vs NSFW different prefixes (esp. NoobAI safe/nsfw flip)
//   - Character anchor merged so locked characters keep consistent appearance
//   - Intent tags spliced in (the user's "看看小穴" → pussy, close-up actually appear)
//   - Per-model technical params from 工作流接入指南.md

import { isNSFW, stripNsfwTokens, stripAppearanceTokens, stripOutfitTokens, hasOutfitTokens, STRONG_SFW_NEGATIVE } from './nsfw-classifier.js';
import { matchLoRAs, aggregateLoRATags } from './lora-matcher.js';

// Anti-censorship tags applied to ALL noobai* + majicmix negatives — without these,
// noobai/illustrious models routinely add black bars / mosaics / pixelation over genitals
// even when intent is clearly NSFW (the model's training data has many censored images).
// v0.7.9 trim：原 4 个加权 → 1 个核心 (censored:1.4)
const ANTI_CENSOR = '(censored:1.4), mosaic, mosaic censoring, bar censor, pixelated, pixelation, white censor, black censor, pussy censor, nipple censor, censor bar, blur censor';

// v0.7.3 SDXL Negative Textual Inversion embeddings — 已在 v0.7.4 关闭。
// 实测开 negativeXL_D + unaestheticXL_cbp62-neg 会**严重规整美学**，让 WAI-Illustrious
// 输出从"软插画+渐变阴影"变成"平涂动漫"，损失插画细节。与 PAG 串联尤甚。
// 留空字符串保留接口（`${NEGATIVE_EMBEDDINGS_SDXL}` 拼接位点不变），按需可重新填回。
const NEGATIVE_EMBEDDINGS_SDXL = '';

// v0.8.1 替换 asian_realism 模型为 illustAsianCoser_v3（保留 model id 'asian_realism' 兼容用户保存的 settings）。
//        新模型训练集是 cosplay 棚拍，自带蓝/绿/紫胶片灯 prior，必须在 negative 加 anti-color-tint 暗示词
//        把模型拉回自然光。所有 anti-light 标签**无加权**（之前加权触发 CLIP 超载 RGB 噪点）。
const NEGATIVE = {
    // v0.11.11 cosplay 灯光 prior 全面爆发问题修复：anti-color-tint 关键词加权 + 加新词
    // 实测方彤彤 (校服 + tareme + G-cup) 触发青蓝灯爆发，无加权词压不住已触发 prior。
    asian_realism: `score_4, score_5, score_6, worst quality, low quality, bad anatomy, bad hands, missing fingers, extra fingers, deformed, blurry, watermark, text, signature, anime, cartoon, 3d, cgi, neon lighting, colored gel lighting, (blue lighting:1.5), (cyan lighting:1.5), (green lighting:1.4), (purple lighting:1.4), studio gel lights, dramatic colored lighting, harsh shadows, color grading, (color tint:1.4), (color cast:1.4), (chromatic aberration:1.3), blue tint, cyan tint, monochrome lighting, ${ANTI_CENSOR}`,
    // waiANIHENTAIPONYXL v60 — 作者推荐 negative：score_4-6 + 基础 anti-deformity + anti-furry。
    wai_anihentai: `score_4, score_5, score_6, worst quality, low quality, bad anatomy, bad hands, missing fingers, fewer digits, source_furry, source_pony, source_cartoon, 3d, blurry, ${ANTI_CENSOR}`,
    // unholyDesireMixSinister v80 — 作者推荐 negative（一大段 anti-deformity）。
    unholy_desire: `bad quality, worst quality, worst detail, sketch, censor, extra limbs, deformed fingers, bad anatomy, mutated body, lowres, low quality, low score, bad score, blurry, text, ugly, hooded eyes, watermark, pale, bad hands, bad anatomy, bad proportions, poorly drawn face, poorly drawn hand, missing finger, extra limbs, blurry, pixelated, distorted, lowres, jpeg artifacts, watermark, signature, text, (deformed:1.5), (bad hand:1.3), overexposed, underexposed, censored, mutated, extra finger, cloned face, bad eyes, ${ANTI_CENSOR}`,
    // divingIllustriousFlat v70VAE — Illustrious 派生 flat 风格，作者推荐 negative 简洁。
    diving_illustrious: `bad quality, worst quality, worst detail, sketch, censor, extra limbs, deformed fingers, bad anatomy, mutated body, lowres, blurry, text, watermark, signature, bad hands, missing fingers, extra fingers, ${ANTI_CENSOR}`,
    // LUSTIFY! v8 Apex — 写实 NSFW 旗舰 (NOT Pony, NOT Illustrious)。
    // 作者警告 "shizoprompting harms"，negative 保持简洁，不用 score_X / source_X 系列。
    // 反 anime/3d/cartoon 把模型拉回 photo 模态，反基础解剖错误。
    lustify_v8: `(low quality:1.2), lowres, worst quality, bad anatomy, bad hands, bad fingers, missing fingers, extra fingers, deformed, blurry, jpeg artifacts, watermark, text, signature, anime, cartoon, 3d, cgi, illustration, painting, drawing, sketch, ${ANTI_CENSOR}`,
    // Nova Asian XL Illustrious v5.0 — v0.11.7 anime 路径 negative，删反 anime/cartoon/painting
    // （那些是模型本身风格不该反），只反基础 deformity。
    nova_asian_il: `bad quality, worst quality, worst detail, sketch, censor, extra limbs, deformed fingers, bad anatomy, mutated body, lowres, blurry, text, watermark, signature, bad hands, missing fingers, extra fingers, ${ANTI_CENSOR}`,
    // Nova Orange XL Rex v1.0 (v0.11.20) — Illustrious 派生。直接采用作者推荐 negative：
    // 加 anti-old/cartoon/graphic/text/painting/abstract（推 "newest" 训练分布）；
    // 加 (worst quality:1.2) (bad quality:1.2) 加权；加 conjoined / bad ai-generated 反 AI 畸形；
    // 删作者列表里的 'simple background'（用户场景多样，简单背景应保留）。
    nova_orange_xl: `modern, recent, old, oldest, cartoon, graphic, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured, long body, lowres, bad anatomy, bad hands, missing fingers, extra digits, fewer digits, cropped, very displeasing, (worst quality:1.2), (bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, conjoined, bad ai-generated, ${ANTI_CENSOR}`,
};

// ──────────────────────────────────────────────────────────────────────────
// Quality boost system (Booru-style SD prompt engineering best practice):
//   1. ANATOMY_QUALITY — always added (human subjects). Fixes general body errors.
//   2. CLOTHES_BODY_NEG — always added. Fixes clothing-through-skin / merged limbs.
//   3. GENITALIA_BOOST — added when explicit body parts in intent. Sharper private areas.
//   4. BODY_PART_FOCUS_BOOST — added when intent has X-focus tags (legs/breast/ass/pussy focus).
// ──────────────────────────────────────────────────────────────────────────

// Always-on anatomy quality (cheap insurance against deformed bodies)
// solo + 1girl 双重锁定（NoobAI/Illustrious 对 1girl 比 solo 更敏感）。
// 脸型修饰：只保留"反 chibi/反圆脸"最低限度（pointed chin），让卡片视觉档案的"脸型/五官/眼形"
// 独有 tag 有空间发挥，**避免全局美学 tag 把所有原创角色脸都拉到"标准偶像脸"模板**。
// 写实模型（asian_realism）对模板化 tag 反应特别敏感，过多全局美学会导致角色长一样。
//
// ⚠️ 拆成两份的关键原因（v0.7.1 学到的教训）：
// `realistic proportions` / `model figure` / `fit body` / `toned body` / `correct anatomy` 这些
// tag 在 anime 模型（WAI-Illustrious / NoobAI）上会**反向污染**为 3D/CG 风（因为这些 tag 训练于
// photo + 3D figurine 数据）。`model figure` 甚至会让模型把人物画在圆形展台上（手办化）。
// 所以 anime 模型走 ANATOMY_QUALITY_POS_ANIME，写实模型走 ANATOMY_QUALITY_POS_REALISTIC。
// v0.7.2 加美感修饰：natural breast shape + balanced proportions + aesthetic body
// 防止 (gigantic breasts:1.4+) + voluptuous + soft + milky 一堆 tag 叠加导致"枕头胸/气球胸"畸形。
// v0.7.4 删 'anime artwork, anime coloring, flat color'。
// v0.7.5 anime 防 balloon body 强化：natural breast shape / balanced proportions 升到 1.4。
// v0.7.8 回滚 v0.7.7 的 6 个加权软插画 tag —— 实测叠加后 CLIP token 段过密，
//        SDXL 出 RGB 彩色噪点 / 频道分离畸形（参见 memory 铁律：≤9 个加权水位）。
//        soft shading 等改成无加权暗示词，让基础风格 emerge。
// v0.7.9 trim anime POS：原 8 加权 → 4 加权（solo / 1girl / perfect anatomy / natural breast shape）
const ANATOMY_QUALITY_POS_ANIME = '(solo:1.4), (1girl:1.4), (perfect anatomy:1.2), detailed body, pointed chin, beautiful face, slender curves, (natural breast shape:1.4), balanced proportions, proportionate breasts, aesthetic body, body harmony, breasts smaller than torso';
// v0.7.9 trim realistic POS：原 14 加权 → 6 加权
// 保留核心：solo / 1girl / perfect anatomy / fit body / flat stomach
// v0.11.1 删除人种偏置 tag —— 用户决定不再指定人种（korean idol face / japanese model face）
// 改为 nova_asian_il / asian_realism 模型自带 prior + 卡里角色锚 tag 引导，不强行 bias。
const ANATOMY_QUALITY_POS_REALISTIC = '(solo:1.4), (1girl:1.4), (perfect anatomy:1.2), detailed body, realistic proportions, correct anatomy, pointed chin, beautiful face, (fit body:1.3), athletic body, toned abs, (flat stomach:1.3), defined waist, slim waist, toned body, slender curves, natural breast shape, balanced proportions, aesthetic body, body harmony, fitness influencer';
// 默认（兼容旧调用，等价于写实版）—— 新代码请用 getAnatomyPos(model)
const ANATOMY_QUALITY_POS = ANATOMY_QUALITY_POS_REALISTIC;
function getAnatomyPos(m) {
    // v0.10.1 wai_anihentai / unholy_desire / diving_illustrious 都是 anime 模型走同一路径
    if (m === 'wai_anihentai' || m === 'unholy_desire' || m === 'diving_illustrious') return ANATOMY_QUALITY_POS_ANIME;
    return ANATOMY_QUALITY_POS_REALISTIC;
}

// v0.7.2 反枕头胸 / 气球胸：视觉档案常写 (gigantic breasts:1.4) / (huge breasts:1.5)，
// 这些权重在 anime 模型上会触发"枕头胸"bias，画出比身体还大的卡通气球胸。
// 此函数在 prompt 进入模型前对超大胸权重 token 做 cap，最高 1.2，保留意图但防畸形。
// 不删 tag、不动小写词序，只对超阈值数字做截断。
const BREAST_SIZE_TOKENS = ['gigantic breasts', 'huge breasts', 'enormous breasts', 'massive breasts', 'extremely large breasts'];
function capBreastWeight(prompt, maxWeight = 1.2) {
    if (!prompt) return prompt;
    const re = new RegExp(`\\(((?:${BREAST_SIZE_TOKENS.join('|')})):([0-9.]+)\\)`, 'gi');
    return prompt.replace(re, (_m, tag, w) => {
        const n = parseFloat(w);
        return n > maxWeight ? `(${tag}:${maxWeight})` : `(${tag}:${w})`;
    });
}

// v0.7.4 Phase 8.A 隐式强化词降权：视觉档案常写一连串"质感"词
// (voluptuous breasts, soft breasts, milky breasts, bubble butt, soft ass, ...) 来描绘"丰满柔软"，
// 但这些词本身在训练数据里就强烈关联"超大胸/超大臀"，即使无显式权重也会触发模型放大 bias，
// 跟 (gigantic breasts:1.4) 协同压垮身体比例。本函数把已知隐式强化词包成 (tag:weight) 削弱。
// 不删 tag、保留作者意图，只压住 bias 共振。
//
// v0.7.5 模型分流：anime 模型（WAI / NoobAI 系）对 balloon-breast bias 严重，需重压（0.7 + cup 字母）；
// realistic 模型（Pony / asian_realism / majicmix）bias 轻，重压会让胸变小（用户反馈），故只用基础降权 0.85。
const IMPLICIT_BOOST_TOKENS_REALISTIC = [
    // breasts
    'voluptuous breasts', 'soft breasts', 'milky breasts', 'round breasts',
    'plump breasts', 'juicy breasts', 'bouncy breasts', 'jiggling breasts',
    // ass
    'bubble butt', 'soft ass', 'pale ass', 'plump ass', 'juicy ass',
    // thighs
    'soft thighs', 'pale thighs', 'plump thighs', 'juicy thighs',
];
const IMPLICIT_BOOST_TOKENS_ANIME = [
    ...IMPLICIT_BOOST_TOKENS_REALISTIC,
    // v0.7.5 anime 加 cup 字母（视觉档案 schema 罩杯行）— 单独写时也会推 size bias
    'F-cup', 'G-cup', 'H-cup', 'I-cup', 'J-cup', 'K-cup', 'L-cup', 'M-cup',
];
function dampenImplicitBreastBoost(prompt, weight, tokens) {
    if (!prompt) return prompt;
    const lookup = new Set(tokens.map(t => t.toLowerCase()));
    return prompt.split(',').map((seg) => {
        const stripped = seg.trim();
        if (!stripped) return seg;
        // skip already-weighted tags like (soft breasts:0.85)
        if (/^\(.+:[\d.]+\)$/.test(stripped)) return seg;
        if (lookup.has(stripped.toLowerCase())) {
            return ` (${stripped}:${weight})`;
        }
        return seg;
    }).join(',');
}
// v0.7.5 双轨防护组合 — anime 走重压，realistic 走轻压。
// 调用方按 model 选 processPrompt：
//   anime   → cap 1.0 + dampen 0.7 + cup-letter 也降
//   realistic → cap 1.2 + dampen 0.85 (与 v0.7.4 一致)
function processPromptAnime(p) {
    return dampenImplicitBreastBoost(capBreastWeight(p, 1.0), 0.7, IMPLICIT_BOOST_TOKENS_ANIME);
}
function processPromptRealistic(p) {
    return dampenImplicitBreastBoost(capBreastWeight(p, 1.2), 0.85, IMPLICIT_BOOST_TOKENS_REALISTIC);
}
function processPromptForModel(p, model) {
    return isAnimeModel(model) ? processPromptAnime(p) : processPromptRealistic(p);
}
// 反赘肉系：plus size / chubby / fat / overweight / belly fat / fupa（小肚腩）
// 反丑脸系：ugly face / asymmetric face
// 反枕头胸系（v0.7.2）：deformed/balloon/pillow breasts —— 配合 capBreastWeight() 双重防护
// v0.7.9 严重 trim：v0.7.5/0.7.8 负面 weighted tag 多达 42 个（是 15 安全水位的 2.8x），
//        SDXL CLIP 75-token 段塞爆 → 部分 prompt（古风/汉服+巨胸）出 RGB 彩色噪点/频道分离。
//        砍掉所有"次要"加权（asymmetric/uneven/oversized/gigantic-deformity/obese 等），
//        只保留 5 个核心加权防畸形：bad anatomy / deformed-breasts / balloon-breasts / pillow-breasts / fat。
//        其余反赘肉/反气球用无加权词列出（仍能影响输出，但不挤压 weight 段）。
// v0.7.11 加 anti-pasty 加权 (pasties:1.5)。
// v0.7.12 配套 anti-topless 加权（在 STRONG_SFW_NEGATIVE 里）—— v0.7.11 实测只挡 pasties 不挡 topless，
//         模型直接从"打贴"推到"露乳头全裸"。同时降权 nipple cover + balloon breasts 让位。
const ANATOMY_QUALITY_NEG_ANIME = '(bad anatomy:1.3), bad hands, bad fingers, extra fingers, missing fingers, fused fingers, mutated hands, malformed hands, deformed, mutation, disfigured, extra limbs, missing limbs, distorted body, wrong anatomy, anatomy error, malformed, (fat:1.4), plus size, chubby, overweight, obese, excess body fat, fupa, belly fat, bulky body, thick body, sagging belly, double chin, ugly face, asymmetric face, derpy face, (deformed breasts:1.4), balloon breasts, (pillow breasts:1.4), asymmetric breasts, uneven breasts, oversized breasts, gigantic breasts deformity, distorted breasts, melted breasts, breast bigger than torso, breast warping, bag of sand breasts, (pasties:1.5), nipple cover, star pasties, heart pasties, chest decoration, nipple stickers, chest sticker, boob window, underboob, breasts pasties';
// v0.7.9 同样 trim realistic：核心 5 个加权（bad anatomy / fat / love handles / waist fat / muffin top）
const ANATOMY_QUALITY_NEG_REALISTIC = '(bad anatomy:1.3), bad hands, bad fingers, extra fingers, missing fingers, fused fingers, mutated hands, malformed hands, deformed, mutation, disfigured, extra limbs, missing limbs, distorted body, wrong anatomy, anatomy error, malformed, (fat:1.5), plus size, chubby, overweight, obese, (love handles:1.5), (muffin top:1.5), (waist fat:1.5), belly roll, flabby, soft belly, fat waist, thick waist, excess body fat, fupa, belly fat, bulky body, thick body, sagging belly, double chin, ugly face, asymmetric face, derpy face, deformed breasts, balloon breasts, pillow breasts, asymmetric breasts, uneven breasts, distorted breasts, melted breasts, oversized breasts deformity, breast warping, bag of sand breasts';
// v0.7.5 默认（兼容旧调用）= realistic 版（更宽松，向后兼容）
const ANATOMY_QUALITY_NEG = ANATOMY_QUALITY_NEG_REALISTIC;
function getAnatomyNeg(model) {
    return isAnimeModel(model) ? ANATOMY_QUALITY_NEG_ANIME : ANATOMY_QUALITY_NEG_REALISTIC;
}

// v0.7.9 trim 11→3 时砍多了，三视图 bug 复现。v0.7.10 加回 6 个核心 anti-三视图加权。
// v0.7.11 trim turnaround/chibi 转无加权（让位给 anti-pasty 加权），只保留 5 个核心 1.5 加权 anti-多人。
const ANTI_MULTI_CHAR_NEG = '(multiple girls:1.5), (multiple characters:1.5), (character sheet:1.5), (multiple views:1.5), (front and back view:1.5), turnaround, chibi, 2girls, 3girls, twins, split screen, two side by side, mirror image, duplicate, reference sheet, round face, chubby face, baby face, mini character, mini people, small character on side, picture-in-picture, character inset, side character';

// v0.7.9 trim：原 3 个加权 → 1 个核心 (clothing through skin 1.3)
const CLOTHES_BODY_NEG = '(clothing through skin:1.3), merged limbs, object overlap, clothing distortion, weird clothing, melted clothes';

// v0.11.14 男方身体压制 — hetero NSFW 场景下，SD 模型有"男方屁股/腿入画"的 prior
// （pov 解读漂移 / mating press 下从下往上拍能看到男方屁股 / missionary 默认带男方背影）。
// 触发条件：prompt 含 1boy + 任一性行为/cum 类 tag → 在 negative 末尾追加这一组抑制
// tag，让画面回归"女主为主体，男方仅必要可见（手/penis）"。
//
// v0.11.15 矫枉过正修复：1.4 加权过狠把男方整个抹掉（用户反馈"好几张图都不生成男 npc"）。
// 区分：
//   ✅ 抑制构图：男方屁股/腿/躯干占大块入画 → 保留（降到 1.1-1.2 加权）
//   ❌ 抑制存在：male body 本身 → 删除（large male body / big male body / full body male）
// 加正向：penetration 场景额外推 (penis visible:1.2) 确保关键部位 visible。
const MALE_BODY_SUPPRESS_NEG = '(male butt focus:1.2), (male ass focus:1.2), (male buttocks in foreground:1.2), (male back focus:1.1), (hairy male butt:1.1), (male butt close-up:1.2), male torso dominant, male body covering female, male ass crack, hairy male legs in foreground';
const MALE_PENIS_BOOST_POS = '(visible penis:1.2), (penis:1.1)';
const MALE_SUPPRESS_TRIGGER_TAGS = ['1boy', '1 boy', 'multiple boys', 'hetero', 'sex', 'penetration', 'missionary', 'cowgirl', 'mating press', 'doggystyle', 'standing sex', 'full nelson', 'reverse cowgirl', 'creampie', 'cum in pussy', 'cumshot', 'facial', 'bukkake'];
const PENIS_BOOST_TRIGGER_TAGS = ['penetration', 'missionary', 'cowgirl', 'mating press', 'doggystyle', 'standing sex', 'full nelson', 'reverse cowgirl', 'creampie', 'cum in pussy', 'cumshot', 'paizuri', 'titfuck', 'fellatio', 'deepthroat', 'handjob', 'footjob'];

function needsMaleSuppress(prompt) {
    if (!prompt) return false;
    const low = String(prompt).toLowerCase();
    return MALE_SUPPRESS_TRIGGER_TAGS.some((t) => low.includes(t));
}

function needsPenisBoost(prompt) {
    if (!prompt) return false;
    const low = String(prompt).toLowerCase();
    return PENIS_BOOST_TRIGGER_TAGS.some((t) => low.includes(t));
}

// Genitalia detail boost (when explicit private parts in intent)
// v0.8.0 简化：只剩 PONY-XL 派生模型，删 noobai/majicmix 字典条目，统一一个 GENITALIA_BOOST_NEG 字符串
const GENITALIA_BOOST_POS = '(detailed pussy:1.3), (perfect pussy:1.2), detailed labia, detailed clitoris, vulva detail, anatomically correct, sharp focus on genitals, realistic genitals';
const GENITALIA_BOOST_NEG = {
    pony: '(bad genitals:1.3), (deformed pussy:1.3), malformed genitalia, poorly drawn genitals, ugly genitals, censored genitals, blurry genitals, mosaic',
};
const GENITALIA_TRIGGER_TAGS = ['pussy', 'vagina', 'vulva', 'labia', 'spread legs', 'open legs', 'sex', 'penetration', 'creampie', 'cum inside', 'cumshot', 'anus', 'anal', 'pussy focus', 'spread pussy'];

// Body-part focus boost (when user told the character to "拍腿/拍胸/拍屁股/拍小穴")
// Each focus tag in intent → corresponding quality boost for that body part
const BODY_FOCUS_BOOSTS = {
    'legs focus':    '(thigh focus:1.2), (long legs:1.2), beautiful legs, smooth legs',
    'thigh focus':   '(thigh gap:1.1), beautiful thighs, plump thighs',
    'breast focus':  '(detailed breasts:1.2), (cleavage:1.1), beautiful breasts, soft breasts',
    'ass focus':     '(detailed ass:1.2), (huge ass:1.2), beautiful ass, plump ass, round ass',
    'pussy focus':   '(detailed pussy:1.3), (vulva detail:1.2), spread pussy, glistening pussy',
};

function needsGenitaliaBoost(intentTags = []) {
    return intentTags.some((t) => GENITALIA_TRIGGER_TAGS.some((g) => t.toLowerCase().includes(g)));
}

function getBodyFocusBoosts(intentTags = []) {
    const boosts = [];
    for (const tag of intentTags) {
        const low = tag.toLowerCase();
        for (const [focusKey, boost] of Object.entries(BODY_FOCUS_BOOSTS)) {
            if (low === focusKey || low.includes(focusKey)) {
                boosts.push(boost);
                break;
            }
        }
    }
    return boosts;
}

// v0.8.1 asian_realism 改用 illustAsianCoser_v3。
//        作者推荐 PREFIX 极简：score_9 系 + photorealistic 基础 + 无加权自然光暗示词。
//        加 daylight/natural lighting/white background/indoor lighting/even lighting 反棚拍胶片灯 prior。
const PREFIX = {
    // v0.11.1 删除 'asian' tag 时把色彩平衡也带掉 → v0.11.11 修复：
    //   - 恢复 `asian` —— 此处不是人种偏置，是 illustAsianCoser 训练分布的 daylight 锚点
    //     （删了会让 cosplay 棚拍胶片灯 prior 爆发，实测方彤彤校服触发青蓝色污染）
    //   - 加显式色彩校准 tag 加固
    asian_realism: 'score_9, score_8_up, score_7_up, masterpiece, best quality, ultra detailed, photorealistic, asian, raw photo, sharp focus, detailed skin, (natural color balance:1.3), (true to life colors:1.3), (neutral skin tone:1.2), daylight, natural lighting, soft lighting, white background, indoor lighting, even lighting',
    wai_anihentai: 'score_9, score_8_up, score_7_up, source_anime, masterpiece, best quality, amazing quality',
    // unholyDesireMixSinister v80 — 作者推荐 PREFIX
    unholy_desire: 'unholy-aesthetic, masterpiece, best quality, amazing quality, very aesthetic, absurdres, ultra detailed face, ultra detailed eyes',
    // divingIllustriousFlat v70VAE — flat 风格 anime（作者推荐 (anime coloring, anime screencap:1.5) 推 flat）
    // v0.11.4: 权重 1.4 → 1.5 严格匹配作者推荐。
    diving_illustrious: '(anime coloring:1.5), (anime screencap:1.5), masterpiece, best quality, amazing quality, very aesthetic, absurdres, ultra detailed face',
    // LUSTIFY! v8 Apex — 写实 NSFW 旗舰 (NOT Pony, NOT Illustrious)。
    // 作者警告：shizoprompting 有害，PREFIX 保持极简。
    // 选用作者列出的"高视觉影响"tag：analog photo + glamour photography + cinematic lighting + film grain。
    lustify_v8: 'masterpiece, best quality, ultra detailed, photorealistic, raw photo, sharp focus, detailed skin, analog photo, glamour photography, cinematic lighting, soft lighting, film grain, depth of field',
    // Nova Asian XL Illustrious v5.0 — v0.11.7 最终归 anime 组。
    // 复杂 prompt 下 photo 路径色爆，作为亚洲脸特化的 Illustrious 动漫模型用。
    nova_asian_il: 'masterpiece, best quality, amazing quality, very aesthetic, high resolution, ultra-detailed, absurdres, ultra detailed face, ultra detailed eyes',
    // Nova Orange XL Rex v1.0 (v0.11.20) — Illustrious 派生。
    // 作者推荐 PREFIX 含 newest（推最新训练分布）+ 4k + very aesthetic + ultra-detailed。
    // 删作者列表里的 'scenery'（user 场景以人物为主，scenery 会推背景而压制 1girl 主体）。
    nova_orange_xl: 'masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, ultra detailed face, ultra detailed eyes',
};

const SIZE = {
    asian_realism: { width: 832, height: 1216 },
    wai_anihentai: { width: 832, height: 1216 },
    unholy_desire: { width: 832, height: 1216 },
    diving_illustrious: { width: 896, height: 1152 }, // 作者推荐尺寸
    // LUSTIFY v8 Apex 原生 1536px 支持 → 用 1024×1536 portrait（ESRGAN x2 后 = 2048×3072）
    lustify_v8: { width: 1024, height: 1536 },
    nova_asian_il: { width: 832, height: 1216 }, // Illustrious 标准尺寸
    nova_orange_xl: { width: 832, height: 1216 }, // Illustrious 标准尺寸 (v0.11.20)
};

// v0.11.12 接入 DMD2 4step LoRA。5 个模型走 LCM + simple + 8 步 + CFG 1.6 + LoRA 0.7
// 速度: 30 步 → 8 步，~4× 提速。unholy_desire 保持原配置（已自蒸馏，叠 DMD2 过度蒸馏）。
const TECH = {
    asian_realism: { cfg: 1.6, sampler: 'lcm', scheduler: 'simple', steps: 8 },
    wai_anihentai: { cfg: 1.6, sampler: 'lcm', scheduler: 'simple', steps: 8 },
    // unholy_desire 保持作者原推荐（自蒸馏，不接 DMD2）
    unholy_desire: { cfg: 2.5, sampler: 'dpmpp_2m', scheduler: 'karras', steps: 16 },
    diving_illustrious: { cfg: 1.6, sampler: 'lcm', scheduler: 'simple', steps: 8 },
    lustify_v8: { cfg: 1.6, sampler: 'lcm', scheduler: 'simple', steps: 8 },
    nova_asian_il: { cfg: 1.6, sampler: 'lcm', scheduler: 'simple', steps: 8 },
    nova_orange_xl: { cfg: 1.6, sampler: 'lcm', scheduler: 'simple', steps: 8 }, // DMD2 路径 (v0.11.20)
};

// v0.11.7 isAnimeModel — nova_asian_il 最终归类为 anime
// 实测：复杂 NSFW prompt 下 Nova Asian XL CLIP 过载色爆，不论是否 hires fix 都救不回来。
// 用户决定接受当作"亚洲动漫风格"模型用。
// anime 4 个：wai_anihentai / unholy_desire / diving_illustrious / nova_asian_il
// 写实 2 个：asian_realism / lustify_v8
function isAnimeModel(m) {
    return m === 'wai_anihentai' || m === 'unholy_desire' || m === 'diving_illustrious' || m === 'nova_asian_il' || m === 'nova_orange_xl';
}
// v0.11.0 LUSTIFY 是 NOT Pony / NOT Illustrious，不能注入 score_X / source_X / rating_X tag。
// 该函数用于跳过 PONY-XL 系列的 rating tag 注入（rating_safe / rating_explicit）。
function isPonyOrIllustriousFamily(m) {
    return m !== 'lustify_v8';
}

// ────────────────────────────────────────────────────────────────────────
// v0.11.9 LUSTIFY 专用"年轻 + 精致五官 + 斯拉夫/拉美 + 反婴儿肥"美貌增强
// 迭代历史：
//   v0.11.6a Kardashian 重妆 → "更丑了"
//   v0.11.6 Slavic Pinterest 清纯 → "脸还是不够漂亮"
//   v0.11.6.5 加 expressive eyes / defined eyebrows → "太老态了"
//   v0.11.9 年轻 + 精致 + 斯拉夫/拉美 + 反婴儿肥 → 用户参考图证实方向
// 关键 tag：
//   - young woman, age 19, youthful face → 把 "mature" 角色 archive 拉年轻
//   - slavic / latina features → 用户接受的两种欧美脸
//   - slim face + defined facial features + refined bone structure → 反婴儿肥
//     用 slim/defined 替代 petite/small/dainty（后者会推圆脸 baby fat 方向）
//   - smooth skin → 替换 porcelain，去掉 freckles 走精美光滑感
// v0.11.9 整合中文 SD 圈高频 beauty tag（搜索 prompthero / civitai / 知乎 / bilibili 经验）：
//   - symmetrical face / perfectly proportioned face → 五官对称 + 完美比例（颜值核心）
//   - expressive deep eyes / highly detailed glossy eyes → 眼睛有神 + 精细发光（眼睛是颜值灵魂）
//   - skin pores → 真实肤质（防过度磨皮塑料感）
//   - stunning beauty / beauty → 通用美貌强化
//   - glowing face → 光泽脸
//   - slender → 苗条
// v0.11.10 删 'slender girl'（推全身瘦削，和卡里 J-cup/wide hips/thick thighs 矛盾）；
//          其余 face-only tag 保留。
const LUSTIFY_BEAUTY_BOOST = '(beautiful young face:1.4), (symmetrical face:1.3), (slavic features:1.3), (refined delicate features:1.3), (youthful face:1.3), (slim face:1.2), beauty, stunning beauty, young woman, age 19, slavic, eastern european, nordic, scandinavian, exquisite features, defined facial features, refined bone structure, perfectly proportioned face, slim jawline, sharp jawline, high cheekbones, fresh-faced, glowing face, dewy skin, glowing skin, smooth skin, skin pores, natural makeup, expressive deep eyes, highly detailed glossy eyes, captivating eyes, full natural eyebrows';
// 配套 LUSTIFY 专用 anti-baby-fat negative tags（追加到 LUSTIFY 路径 negative 末尾）
const LUSTIFY_ANTI_BABYFAT_NEG = '(baby fat:1.3), (chubby cheeks:1.3), (baby face:1.3), (round face:1.2), asymmetrical face, puffy face, swollen face, double chin, fat face';

// ────────────────────────────────────────────────────────────────────────
// v0.11.3 写实欧美 prompt 模板（LUSTIFY 专用 westernize）
// 用户决策：lustify_v8 是写实欧美 NSFW 模型，遇到原创角色应该出欧美脸而不是亚洲脸。
// 现卡里视觉档案 booru tag 偏东亚（phoenix eyes / hanfu / porcelain / black hair 等），
// 在 buildPrompt 末端做映射转换——亚洲 tag → 欧美等价 tag。
//
// 触发条件：
//   - model === 'lustify_v8'
//   - 角色 charAnchor 为空 / '—' / '原创'（非 booru canon 名人）
//
// 不处理：
//   - 已有 booru anchor 的 canon 角色（chun-li (street fighter)/yuigahama yui 等）
//     这些角色本身就是亚洲身份，西化等于改人物。
//   - 通用 booru tag（1girl/solo/sex/breast/hip 等）
//
// 映射表保守——不动身体（hourglass/cup 字母/breasts），只动**种族识别**部位
// （眼形/眼色/发色/脸型/皮肤质地/五官形态/民族服装/发饰）。
// ────────────────────────────────────────────────────────────────────────
const ASIAN_TO_WESTERN_MAP = [
    // 眼形（亚洲专属术语 → 欧美对等）
    ['phoenix eyes', 'almond eyes'],
    ['fox eyes', 'cat eyes'],
    ['monolid eyes', 'almond eyes'],
    ['epicanthic fold', ''],
    // 眼色 — 黑眼睛在欧美少见，全转蓝
    [/\(black eyes:([0-9.]+)\)/g, '(blue eyes:$1)'],
    [/\bblack eyes\b/g, 'blue eyes'],
    // 发色 — 黑发转棕（更欧美中性）
    [/\(black hair:([0-9.]+)\)/g, '(brown hair:$1)'],
    [/\bblack hair\b/g, 'brown hair'],
    // 脸型 — 鸭蛋脸是东亚专用描述
    [/\boval face\b/g, 'heart-shaped face'],
    [/\bpointed chin\b/g, 'soft jaw'],
    // 皮肤 — v0.11.9 删 freckles（参考图都精美光滑肤质，freckles 反而削弱"精美"感）
    [/\bporcelain skin\b/g, 'smooth fair skin'],
    [/\bporcelain\b/g, 'smooth skin'],
    // 五官 — delicate nose 偏东亚
    [/\bdelicate nose\b/g, 'dainty nose'],
    // v0.11.9 年龄洗白 — 卡里 mature/熟女标签拉老脸，LUSTIFY 路径转年轻
    // v0.11.10 修正：不动 'mature female body'（body type，"mature" 在身体语境=发育成熟，
    //   不映射成 'slim athletic body' 因为 athletic 会推小屁股小胸；body 由角色 archive
    //   其他 tag——huge ass / wide hips / J-cup 等——自身决定）。仅洗 face/age 信号。
    [/\bmature woman\b/gi, 'young woman'],
    [/\bmilf\b/gi, 'young woman'],
    // 'mature' 单独出现一般指年龄（在 archive 是 "年龄类: 熟女 → mature"），转年轻
    // 但要小心不破坏 'mature female body' 这种 phrase——用负向 lookahead 避开
    [/(?<![\w-])mature(?![\w-])(?!\s+female\s+body)/gi, 'young woman age 19'],
    // 民族服装 — 中式日式传统服转西方等价
    [/\b(?:pink |red |green |blue |purple |black |white |gold |silver )?hanfu\b/gi, 'flowing silk dress'],
    [/\b(?:long |short |red |black |pink |white )?kimono\b/gi, 'silk robe'],
    [/\bqipao\b/gi, 'cocktail dress'],
    [/\bcheongsam\b/gi, 'evening dress'],
    [/\bchina dress\b/gi, 'evening dress'],
    [/\b(?:traditional )?chinese clothes\b/gi, 'elegant dress'],
    [/\b(?:traditional )?japanese clothes\b/gi, 'silk robe'],
    [/\btraditional clothes\b/gi, 'elegant dress'],
    [/\bphoenix print\b/gi, 'embroidered'],
    [/\bdragon print\b/gi, 'embroidered'],
    // 发饰 — 玉簪 → 现代发夹
    [/\bhair stick\b/gi, 'hair clip'],
    [/\bhair bun\b/gi, 'updo'],
    [/\bjade pendant\b/gi, 'pendant'],
];

// 检测 charAnchor 是否是 booru canon 角色（如 chun-li (street fighter) / yuigahama yui）。
// canon 角色保持亚洲身份不动；原创角色（'—' / '原创' / 空）走 westernize 路径。
function isBooruCanonCharacter(anchor) {
    if (!anchor) return false;
    const a = String(anchor).trim();
    if (!a || a === '—' || a === '-' || a === '原创' || a === 'original') return false;
    // 含字母数字且不含明显中文 = 大概率是 booru anchor
    return /[a-z][\w-]+/i.test(a);
}

function westernizePrompt(prompt) {
    if (!prompt) return prompt;
    let out = prompt;
    for (const [from, to] of ASIAN_TO_WESTERN_MAP) {
        if (from instanceof RegExp) {
            out = out.replace(from, to);
        } else {
            const re = new RegExp('(?<![\\w-])' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'gi');
            out = out.replace(re, to);
        }
    }
    return out;
}

export function buildPrompt({ aiPrompt = '', characterAnchor = '', characterFullPrompt = '', intent = { level: 'sfw', tags: [] }, model = 'wai_anihentai', styleHint = 'auto', userText = '', loraTriggerText = '' }) {
    // v0.11.19 触发式 LoRA — matcher 过滤架构兼容 + NSFW gate + trigger 命中 → 返回 0-3 个 LoRA
    // 同输入永远同输出（reroll 一致）；返回值里 lorasApplied 数组传给 comfyui-bridge 注入工作流节点
    // v0.11.21 LoRA trigger 用 loraTriggerText（仅本回合）替代 userText（3 条历史），修跨回合 LoRA 泄漏。
    // loraTriggerText 缺省时回退到 userText，保 backwards 兼容；index.js 已显式传 latestUserMessage。
    const lorasApplied = matchLoRAs({ userText: loraTriggerText || userText, aiPrompt, intent, model });
    const loraInjectTags = aggregateLoRATags(lorasApplied);
    const nsfw = isNSFW(intent.level);
    // v0.10.1 加 unholy_desire + diving_illustrious 两个 anime 模型校验
    const VALID_MODELS = ['asian_realism', 'wai_anihentai', 'unholy_desire', 'diving_illustrious', 'lustify_v8', 'nova_asian_il', 'nova_orange_xl'];
    const m = VALID_MODELS.includes(model) ? model : 'wai_anihentai';

    // SFW gate: strip NSFW tokens that AI may have snuck into <pic prompt="...">.
    let cleanedAiPrompt = nsfw ? aiPrompt : stripNsfwTokens(aiPrompt);
    // When using full anchor, strip appearance tokens from aiPrompt to avoid
    // conflicts with locked character (AI may have put "black hair" when char is purple)
    if (characterFullPrompt) cleanedAiPrompt = stripAppearanceTokens(cleanedAiPrompt);

    // v0.8.0 simplified family detection — only 2 models left, both PONY-XL family.
    // wai_anihentai = anime PONY-XL；asian_realism = realistic PONY-XL。
    const isAnime = isAnimeModel(m);
    const isRealistic = (m === 'asian_realism');
    let prefix = PREFIX[m];
    let negative = NEGATIVE[m];

    if (!nsfw) negative = `${STRONG_SFW_NEGATIVE}, ${negative}`;

    // v0.11.9 LUSTIFY 专用 anti-baby-fat negative（防 boost 过度年轻化推圆脸）
    if (m === 'lustify_v8') negative = `${LUSTIFY_ANTI_BABYFAT_NEG}, ${negative}`;

    // Always-on anatomy quality + clothes-body separation + anti-multi-character negatives.
    // These are cheap insurance against deformed bodies, clothing-through-skin artifacts,
    // and the "extra chibi character in corner" bug common to NoobAI / Illustrious models.
    // v0.7.3 加 SDXL negative embeddings 到最前（embedding token 在 prompt 头部权重最高）。
    // v0.7.5 ANATOMY_QUALITY_NEG 按模型分流（anime 重压，realistic 轻压）。
    negative = `${NEGATIVE_EMBEDDINGS_SDXL}, ${getAnatomyNeg(m)}, ${CLOTHES_BODY_NEG}, ${ANTI_MULTI_CHAR_NEG}, ${negative}`;

    // Genitalia quality boost: add anatomy detail tags when explicit genitalia are in intent
    const genBoost = nsfw && needsGenitaliaBoost(intent.tags);
    if (genBoost) {
        // v0.8.0 简化：只剩 PONY-XL 派生模型，统一用 pony 的 GENITALIA_BOOST_NEG
        negative = `${GENITALIA_BOOST_NEG.pony}, ${negative}`;
    }

    // Body-part focus boost: when intent has "legs focus" / "breast focus" etc.
    const bodyFocusBoosts = getBodyFocusBoosts(intent.tags);

    const parts = [];

    // v0.11.18 服装冲突检测 —— 若 AI prompt 含明确 outfit token（"emperor robe / business suit / cheongsam"
    // 等），SFW 路径下也要剥离锚点的原始 outfit，防止锚点的 "dark blue armor, cape, boots" 跟 AI 的
    // "imperial dragon robe" 同时塞进模型 → 钢架军装 + 龙袍混搭畸形（v0.14.43 用户报告）。
    const aiHasOutfit = hasOutfitTokens(cleanedAiPrompt);

    if (characterFullPrompt) {
        // Locked character with rich SD prompt — use it as the dominant base.
        // SFW: strip NSFW tokens AI may have left in. NSFW: strip outfit tokens
        // (hanfu/school uniform/blazer etc.) so they don't conflict with intent's
        // "nude / breasts out / spread legs" — without this strip, model gets
        // "wear hanfu" + "be naked" simultaneously and produces ugly artifacts.
        // Lingerie/stockings/jewelry/hair ornaments are kept (legit NSFW + identity).
        // capBreastWeight: 把视觉档案 (gigantic breasts:1.4+) 截到 cap，防"枕头胸"畸形（v0.7.2）。
        // dampenImplicitBreastBoost: 隐式强化词 (voluptuous/soft/milky breasts) 降权（v0.7.4）。
        // v0.7.5 模型分流：anime 走 cap 1.0 + dampen 0.7 + cup-letter，realistic 走 cap 1.2 + dampen 0.85。
        // v0.11.18 SFW + AI 指定新服装时也走 stripOutfit
        // v0.11.18 audit fix: SFW 路径下 stripNsfwTokens 不可丢，否则 anchor 里残留的 NSFW token 漏到 SFW prompt
        let anchorAfterStrip = characterFullPrompt;
        if (nsfw) {
            anchorAfterStrip = stripOutfitTokens(anchorAfterStrip);
        } else {
            anchorAfterStrip = stripNsfwTokens(anchorAfterStrip);
            if (aiHasOutfit) anchorAfterStrip = stripOutfitTokens(anchorAfterStrip);
        }
        const cleanedFullAnchor = processPromptForModel(anchorAfterStrip, m);
        // v0.11.0 rating tag 仅对 PONY/Illustrious 派生模型生效（LUSTIFY 不是该家族，跳过）
        if (isPonyOrIllustriousFamily(m)) {
            parts.push(`${nsfw ? 'rating_explicit' : 'rating_safe'}, ${cleanedFullAnchor}`);
        } else {
            parts.push(cleanedFullAnchor);
        }
    } else {
        // Standard path: prefix + appearance anchor.
        // Same outfit-strip logic applies for symmetry — if user put clothing
        // in the short anchor.prompt, NSFW intent should still take over.
        // v0.11.18 SFW + AI 指定新服装时也走 stripOutfit
        parts.push(prefix);
        if (characterAnchor) {
            // v0.7.5 模型分流双重防护
            // v0.11.18 audit fix: SFW + aiHasOutfit 时仅剥 outfit 不动 NSFW（短 anchor 没经过 stripNsfwTokens 路径，
            // 它本身不该含 NSFW token，所以保持原行为不加 stripNsfwTokens 已足够）
            const anchorAfterStrip = (nsfw || aiHasOutfit) ? stripOutfitTokens(characterAnchor) : characterAnchor;
            parts.push(processPromptForModel(anchorAfterStrip, m));
        }
        // v0.11.0 rating tag 仅 PONY/Illustrious 家族（asian_realism / wai_anihentai / unholy_desire / diving_illustrious / nova_asian_il）
        if (isPonyOrIllustriousFamily(m)) {
            parts.unshift(nsfw ? 'rating_explicit' : 'rating_safe');
        }
    }

    // Always-on anatomy quality (insurance against deformed bodies)
    // 模型分流：anime 模型（wai/noobai）用反 3D 版本，写实模型（pony/asian_realism/majicmix）用原版。
    parts.push(getAnatomyPos(m));

    // v0.7.12 SFW positive bonus —— anti-pasty/anti-topless 即使加权 1.5 也压不住 anime 模型
    // huge breasts + 校服/紧身衣 的 ecchi pasty prior（实测徐雪娇/水冰月仍出 heart pasties），
    // 必须用正向 (intact clothing:1.3) (covered breasts:1.3) 主动拉模型回穿衣状态。
    // 仅在 SFW 路径加，NSFW 路径用户故意要露不应该被这些 tag 阻挡。
    if (!nsfw) parts.push('(intact clothing:1.3), (covered breasts:1.3), (clothed:1.2), fully clothed, no exposed breast');

    // Intent tags (NSFW/setting hints from user message)
    if (intent.tags?.length) parts.push(intent.tags.join(', '));

    // v0.11.19 LoRA trigger tags — 跟 intent tags 同语义层（场景/动作 token）
    if (loraInjectTags.positive) parts.push(loraInjectTags.positive);

    // Genitalia quality boost positive tags
    if (genBoost) parts.push(GENITALIA_BOOST_POS);

    // Body-part focus quality boosts (legs/breast/ass/pussy focus)
    if (bodyFocusBoosts.length) parts.push(bodyFocusBoosts.join(', '));

    // AI-supplied scene/action prompt (with conflicts stripped).
    // Per-tag weighting (1.15) so scene gets more influence than long character anchor without
    // wrapping the entire blob in nested parens — wrapping caused parser corruption when
    // the AI prompt itself contained weighted tokens like `(jade pendant:1.2)` (broken images).
    if (cleanedAiPrompt) {
        const weighted = cleanedAiPrompt
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => /^\(.*:[\d.]+\)$/.test(t) ? t : `(${t}:1.15)`)
            .join(', ');
        parts.push(weighted);
    }

    let positive = parts.filter(Boolean).join(', ');

    // v0.8.1 删除 Stable_Yogis trigger 词强制前置逻辑 — asian_realism 已替换为
    // illustAsianCoser_v3，没有 LoRA，不再需要 trigger 词。

    // v0.11.3 LUSTIFY 自动 westernize：把卡里东亚 booru tag 换成欧美等价
    // （仅对**非 canon 角色**，canon 角色如 chun-li 视觉档案的 charAnchor 仍在 prompt 里
    //  作为强 booru anchor 锁亚洲身份，本映射不动 anchor token，只动其他描述部位）。
    if (m === 'lustify_v8') {
        positive = westernizePrompt(positive);
        // v0.11.6 末尾追加 beauty boost 推欧美网红脸 / glamour model 美貌
        positive = `${positive}, ${LUSTIFY_BEAUTY_BOOST}`;
    }
    // v0.11.7 删除 nova_asian_il BREAK 尾段（已归 anime，不再走 photo 路径）

    // v0.11.14 hetero NSFW 场景男方身体压制（解决"男方屁股入画占大块"问题）
    // 检测整 positive prompt 含 1boy + 性行为类 tag → 在 negative 追加压制 tag
    // v0.11.15 矫枉过正修复：1.4 降到 1.1-1.2 + 删抑制存在 tag + penetration 场景加正向 penis 推力
    if (needsMaleSuppress(positive)) {
        negative = `${negative}, ${MALE_BODY_SUPPRESS_NEG}`;
        if (needsPenisBoost(positive)) {
            positive = `${positive}, ${MALE_PENIS_BOOST_POS}`;
        }
    }

    // v0.11.19 LoRA 负面 trigger tags 加到 negative 头部（高位置权重）
    if (loraInjectTags.negative) negative = `${loraInjectTags.negative}, ${negative}`;

    return {
        positive,
        negative,
        ...SIZE[m] || SIZE.pony,
        ...TECH[m] || TECH.pony,
        // v0.11.19 给 comfyui-bridge：注入 LoraLoader 节点用
        lorasApplied,
    };
}

// ─────────────────────────────────────────────────────────────────────────
// v0.10.0 陌生人锚点 helpers - 检测 kind + 抽取 core
// 用于剧情中出现的临时 NPC，自动锚定外貌使多次出现视觉一致
// ─────────────────────────────────────────────────────────────────────────

// 检测陌生人类别（按 AI 写的 pic prompt 推断）
// 返回: 'real_origin_female' | 'fictional_male' | 'fictional_female'
export function detectStrangerKind(picPrompt, hint = {}) {
    if (!picPrompt) return 'fictional_female';
    const text = picPrompt.toLowerCase();

    // 检测 booru character anchor 格式 "name (source)"，如 chun-li (street fighter)
    // 排除常见非角色括号词如 (cum:1.3) 加权语法
    const charAnchorRe = /\b([a-z][\w\-]+(?:[ _][a-z][\w\-]+)? \([\w\s\-]+\))/i;
    const m = charAnchorRe.exec(text);
    if (m && !m[0].match(/^\(\w+:[\d.]+\)/)) return 'real_origin_female';

    // 男角色：1boy / 关键男性 tag 且无 1girl
    const hasBoy = /\b(1boy|2boys|multiple boys|mature male|aged man|young man|dirty old man|beggar|nobleman|construction worker|delivery man|eunuch|ugly bastard)\b/.test(text);
    const hasGirl = /\b1girl\b/.test(text);
    if (hasBoy && !hasGirl) return 'fictional_male';

    return 'fictional_female';
}

// 男角色核心抽取（职业 + 年龄 + 体型 + 标志服装，4-5 个 tag）
function extractMaleCore(picPrompt) {
    const text = picPrompt.toLowerCase();
    const collected = [];
    const REGEXES = [
        // 职业 / 身份
        /\b(beggar|homeless man|construction worker|delivery man|waiter|cleaner|nobleman|eunuch|servant|young man|aged man|mature male|middle-aged man|ugly bastard|dirty old man|businessman|soldier)\b/i,
        // 衣着 / 标志服装
        /\b(scruffy|ragged clothes|unkempt|dirty clothes|formal wear|business suit|necktie|robes|uniform|helmet|armor)\b/i,
        // 体型
        /\b(muscular|tan skin|fat|skinny|tall|short|young adult|fit body|stocky)\b/i,
        // 标志特征
        /\b(beard|mustache|bald|shaved head|long hair|short hair|gray hair|white hair|black hair|brown hair|glasses|scar)\b/i,
        // 种族（兜底）
        /\b(asian|east asian|chinese|japanese|korean|european|african|middle eastern)\b/i,
    ];
    for (const re of REGEXES) {
        const m = picPrompt.match(re);
        if (m) collected.push(m[0].toLowerCase());
        if (collected.length >= 5) break;
    }
    return collected.join(', ');
}

// 主入口：按 kind 抽取陌生人 core tag
export function extractStrangerCore(picPrompt, kind) {
    if (!picPrompt) return '';
    if (kind === 'real_origin_female') {
        // 抽 character anchor + 1-2 视觉标志
        const anchorRe = /\b([a-z][\w\-]+(?:[ _][a-z][\w\-]+)? \([\w\s\-]+\))/i;
        const m = anchorRe.exec(picPrompt);
        const anchor = m ? m[0] : '';
        const extras = extractCoreAppearance(picPrompt).split(',').slice(0, 2).map(s => s.trim()).filter(Boolean).join(', ');
        return [anchor, extras].filter(Boolean).join(', ');
    }
    if (kind === 'fictional_male') {
        return extractMaleCore(picPrompt);
    }
    // fictional_female 默认 - 复用 v0.9.0 已有的 extractCoreAppearance (头发/眼睛/肤色/标志)
    return extractCoreAppearance(picPrompt);
}

// ─────────────────────────────────────────────────────────────────────────
// v0.14.0 多角色合影 prompt 拼接（群聊模式 ② / ⑤ 专用）
// ─────────────────────────────────────────────────────────────────────────

// 从 sdPrompt 抽 5-7 个核心识别 tag (头发色 + 长度 + 造型 + 眼睛色 + 肤色 + 1-2 标志)
// 输入：完整 SD prompt（每行 booru tag 逗号分隔）
// 输出：plain tag string（无加权）
const HAIR_COLOR_RE = /\b(black|brown|blonde|red|pink|purple|blue|green|silver|white|gray|grey|orange|chestnut|auburn|platinum)\s*(hair)?\b/i;
const HAIR_LENGTH_RE = /\b(very long hair|long hair|medium hair|short hair|bob cut|waist[- ]length)\b/i;
const HAIR_STYLE_RE = /\b(twintails|ponytail|braids|braid|drill hair|bun|hair bun|side ponytail|messy hair|straight hair|wavy hair|curly hair)\b/i;
const HAIR_DECO_RE = /\b(hair ornament|hair flower|hair bow|hair ribbon|hairpin|crescent|crown|tiara)\b/i;
const EYE_COLOR_RE = /\b(black|brown|blue|green|purple|red|pink|amber|gold|hazel|gray|grey)\s*eyes?\b/i;
const SKIN_RE = /\b(fair skin|pale skin|tanned|dark skin|olive skin|asian|east asian|chinese|japanese|korean|european|white skin|brown skin)\b/i;
const FACE_FEATURE_RE = /\b(freckles|mole|beauty mark|scar|tattoo|glasses|fang|fangs|pointy ears|elf ears)\b/i;

export function extractCoreAppearance(sdPrompt) {
    if (!sdPrompt) return '';
    const text = sdPrompt.toLowerCase();
    const collected = [];
    const REGEXES = [HAIR_COLOR_RE, HAIR_LENGTH_RE, HAIR_STYLE_RE, HAIR_DECO_RE, EYE_COLOR_RE, SKIN_RE, FACE_FEATURE_RE];
    for (const re of REGEXES) {
        const m = text.match(re);
        if (m) collected.push(m[0].trim());
        if (collected.length >= 7) break;
    }
    return collected.join(', ');
}

// CLIP 加权水位红线 ≤ 24（铁律：positive ≤ 9 个加权 + negative ≤ 15 个加权）
// N=2 ≈ 16 加权 ✓ ; N=3 ≈ 22 加权 ⚠ 接近水位 ; N=4 必崩
//
// 多角色合影 buildGroupPrompt：
//   - memberCoreList: 每人 5-7 plain tag 的列表
//   - 多人 booru tag (2girls / 3girls / 1boy 1girl)
//   - 加 anti-merge negative
//   - 强制按当前 model 同化风格（asian_realism → realistic ; wai_anihentai → anime）
//   - 不锁 seed（多角色每次都重生成）
export function buildGroupPrompt({
    aiPrompt = '',          // AI 写的场景 pic prompt（不含具体外貌）
    memberCoreList = [],    // [{name, core}, ...] core 是 extractCoreAppearance 输出
    intent = { level: 'sfw', tags: [] },
    model = 'wai_anihentai',
    genderHint = 'all_female', // all_female | all_male | mixed
}) {
    const nsfw = isNSFW(intent.level);
    // v0.10.1 加 unholy_desire + diving_illustrious 两个 anime 模型校验
    const VALID_MODELS = ['asian_realism', 'wai_anihentai', 'unholy_desire', 'diving_illustrious', 'lustify_v8', 'nova_asian_il', 'nova_orange_xl'];
    const m = VALID_MODELS.includes(model) ? model : 'wai_anihentai';

    // 多人 booru tag 主体
    const N = memberCoreList.length;
    let multiTag;
    if (genderHint === 'all_male') {
        multiTag = N === 2 ? '2boys' : N === 3 ? '3boys' : N >= 4 ? 'multiple boys' : '1boy';
    } else if (genderHint === 'mixed') {
        // 简化：默认 1boy + (N-1)girl，更复杂的可由 ai prompt 自带
        multiTag = `1boy, ${N - 1 >= 2 ? (N - 1) + 'girls' : '1girl'}, hetero`;
    } else {
        multiTag = N === 2 ? '2girls' : N === 3 ? '3girls' : N >= 4 ? 'multiple girls' : '1girl';
    }

    // 拼接每人核心 (各 5-7 tag)
    const memberSection = memberCoreList
        .filter(m => m.core)
        .map(m => m.core)
        .join(', ');

    let prefix = PREFIX[m];
    let negative = NEGATIVE[m];
    if (!nsfw) negative = `${STRONG_SFW_NEGATIVE}, ${negative}`;
    negative = `${NEGATIVE_EMBEDDINGS_SDXL}, ${getAnatomyNeg(m)}, ${CLOTHES_BODY_NEG}, ${ANTI_MULTI_CHAR_NEG}, ${negative}`;

    // 多角色 anti-merge：防双胞胎脸 / 融合身体（CLIP 红线注意：仅 3 个加权，水位安全）
    negative = `(merged faces:1.3), (fused bodies:1.3), (clone:1.2), ${negative}`;

    // 强制同化模型风格（asian_realism 推 realistic / wai_anihentai 推 anime）
    // 让 anchor 抽出的可能含 anime/realistic 倾向 tag 被模型主导
    // v0.11.1 删除写实分支的 'asian' bias —— 群聊不强制锁亚洲面孔，让卡里角色锚自决定。
    const styleSteer = isAnimeModel(m)
        ? 'anime style, illustration, group photo, looking at viewer'
        : 'photorealistic, group photo, looking at viewer, natural lighting';

    const cleanedAiPrompt = nsfw ? aiPrompt : stripNsfwTokens(aiPrompt);
    // v0.11.0 rating tag 仅 PONY/Illustrious 家族
    const ratingTag = isPonyOrIllustriousFamily(m) ? (nsfw ? 'rating_explicit' : 'rating_safe') : '';
    const positiveParts = [
        prefix,
        ratingTag,
        multiTag,
        styleSteer,
        cleanedAiPrompt, // AI 写的场景/姿势/构图（plain tag）
        memberSection,   // 各成员核心外貌（plain tag）
        getAnatomyPos(m),
    ];

    if (intent.tags?.length) positiveParts.push(intent.tags.join(', '));

    let positive = positiveParts.filter(Boolean).join(', ');
    // v0.11.3 LUSTIFY 群聊也 westernize（保持单角色 / 群图同行为）
    if (m === 'lustify_v8') {
        positive = westernizePrompt(positive);
        positive = `${positive}, ${LUSTIFY_BEAUTY_BOOST}`;
    }
    // v0.11.7 Nova Asian 已归 anime，删 BREAK + photo tail
    return {
        positive,
        negative,
        ...SIZE[m] || SIZE.pony,
        ...TECH[m] || TECH.pony,
    };
}

// For reference image generation: prefer portrait, full anchor, locked seed, no NSFW.
export function buildReferencePrompt({ characterAnchor = '', model = 'pony' }) {
    return buildPrompt({
        aiPrompt: '1girl, solo, looking at viewer, upper body portrait, neutral expression, white background, studio lighting',
        characterAnchor,
        intent: { level: 'sfw', tags: [] },
        model,
    });
}

// For reference image generation using a full AI-generated SD prompt (from ✨ AI).
// Always SFW. Strips any NSFW tokens that might have leaked through.
// v0.11.10 修参考图出 NSFW 的 bug（仅影响参考图通道，不动 NSFW 聊天图/群聊合影/朋友圈）：
//   1. 加 SFW_POSITIVE_BONUS — 之前只 buildPrompt 有，参考图通道漏了
//   2. LUSTIFY 用专用 SFW PREFIX（去掉 'glamour photography' 这种 NSFW-pulling 词）
//   3. LUSTIFY 加专用 SFW 负面（显式压制 LUSTIFY NSFW prior）
const LUSTIFY_SFW_PREFIX = 'masterpiece, best quality, ultra detailed, photorealistic, raw photo, sharp focus, detailed skin, portrait photography, casual portrait, soft natural lighting, film grain, depth of field';
const SFW_POSITIVE_BONUS = '(intact clothing:1.3), (covered breasts:1.3), (clothed:1.2), fully clothed, no exposed breast, modest attire';
const LUSTIFY_SFW_EXTRA_NEG = '(nude:1.5), (naked:1.5), (topless:1.5), (exposed breasts:1.5), (nipples visible:1.5), bare chest, lingerie, underwear only, swimsuit, bikini, erotic pose, sexual';

// v0.11.21 ⭐ Anti-pattern-bleed — 防止旗袍/印花衣服的 embroidery 图案"印"到胸部/皮肤上
// 触发原因：SFW 参考图必走 SFW_POSITIVE_BONUS (intact clothing:1.3 + covered breasts:1.3)，
// 跟巨胸 + cheongsam/印花 anchor 组合时模型把衣服花纹延伸渲染到本应是皮肤的区域。
// 仅在 buildReferencePromptFull 用，buildPrompt NSFW 路径已经天然避免（不加 covered breasts 强压）。
const ANTI_PATTERN_BLEED_NEG = '(clothing through skin:1.5), (pattern on skin:1.5), (fabric pattern bleed:1.4), (embroidery on skin:1.4), (clothing showing through skin:1.4), pattern overlay on body, fabric texture on body, see through clothing, transparent clothing showing skin, double pattern, pattern duplication';

// v0.11.24 ⭐ Anti-pasties BOOST — anime 模型在巨胸 + 紧身衣 + (covered breasts:1.3) 组合下
// 会产生强 ecchi prior：在乳头/cleavage 位置塞各种"装饰物"作"模糊化覆盖"。
// 具体装饰物每次抽样不同：v0.11.24 是 ❤️ 心形乳贴，v0.11.25 用户报告 🔗 中国结/盘扣图案。
// 一个一个 tag 治治不完，改成**全装饰物变体大列表**+ 大幅扩展。
// 仅在 buildReferencePromptFull 注入；放 negative 最前面位置权重最高。
const ANTI_PASTIES_BOOST = '(heart pasties:1.8), (star pasties:1.8), (decorative pattern on chest:1.8), (decorative pattern on breast:1.8), (heart-shaped nipple cover:1.7), (chinese knot on skin:1.7), (frog button on chest:1.7), (medallion on breast:1.7), (decorative nipple cover:1.6), (pasty:1.6), (nipple pasties:1.6), (pattern on cleavage:1.6), (marking on breast:1.6), (design on chest:1.6), (chest sticker:1.5), (drawing on chest:1.5), heart shape on breast, star shape on breast, decorative chest, decorative breasts, fancy nipple cover, ornate nipple cover, ecchi pasties, x-shaped pasties, cross-shaped pasties, knot pattern on skin, brocade on skin, embroidered medallion on body, body decoration overlay, surface decoration on breasts';

// v0.11.25 ⭐ Pro-plain-skin — 正向告诉模型"胸部皮肤要干净"，跟 anti-decoration 双向夹击
// 单加 negative 压制不住"必须在乳头加东西"的 ecchi prior 时，正向锚定 plain skin 帮助锁定
const PLAIN_SKIN_POSITIVE = '(plain skin:1.3), (smooth chest:1.3), (clean chest:1.2), unblemished chest, bare skin, natural skin texture, undecorated chest';

// v0.11.25 ⭐ 锚点装饰 tag strip 列表 — 旗袍 anchor 里常带的装饰源材料
// 在 buildReferencePromptFull 主动从 cleaned anchor 里 strip，避免模型把装饰延伸到皮肤
// 保留旗袍结构 tag (cheongsam / sleeveless / high collar)，只删纹理/装饰修饰词
const DECORATIVE_TOKENS_TO_STRIP = [
    'embroidered pattern', 'embroidered design', 'gold embroidery', 'silver embroidery',
    'brocade', 'brocade pattern', 'intricate pattern', 'detailed pattern',
    'ornate pattern', 'fancy pattern', 'floral pattern', 'cloud pattern',
    'dragon pattern', 'phoenix pattern', 'embroidery', 'embroidered',
    'embroidered cheongsam', 'embroidered dress', 'patterned dress',
    'ornate clothing', 'decorated clothing', 'fancy clothing',
];

function stripDecorativePatterns(prompt) {
    if (!prompt) return '';
    const lowerTokens = DECORATIVE_TOKENS_TO_STRIP.map((t) => t.toLowerCase());
    const parts = prompt.split(',').map((p) => p.trim()).filter(Boolean);
    const safe = parts.filter((tag) => {
        const low = tag.toLowerCase().replace(/[()]/g, '').replace(/:[\d.]+/g, '').trim();
        return !lowerTokens.some((k) => low === k || low.endsWith(' ' + k));
    });
    return safe.join(', ');
}

export function buildReferencePromptFull({ sdPrompt = '', model = 'wai_anihentai' }) {
    // v0.10.1 加 unholy_desire + diving_illustrious 两个 anime 模型校验
    const VALID_MODELS = ['asian_realism', 'wai_anihentai', 'unholy_desire', 'diving_illustrious', 'lustify_v8', 'nova_asian_il', 'nova_orange_xl'];
    const m = VALID_MODELS.includes(model) ? model : 'wai_anihentai';
    // capBreastWeight + dampenImplicitBreastBoost：双重防"枕头胸"（v0.7.2 + v0.7.4）。
    // v0.11.25 anime 路径加 strip 装饰 tag — 去掉模型把装饰延伸到皮肤上的源材料
    let cleaned = processPromptForModel(stripNsfwTokens(sdPrompt), m);
    if (isAnimeModel(m)) {
        cleaned = stripDecorativePatterns(cleaned);
    }
    const PORTRAIT_FRAMING = '(looking at viewer:1.2), upper body, simple background';
    // v0.11.0 rating tag 仅 PONY/Illustrious 家族（LUSTIFY 跳过）
    const ratingTag = isPonyOrIllustriousFamily(m) ? 'rating_safe, ' : '';
    // v0.11.10 LUSTIFY 用专用 SFW PREFIX（去掉 glamour photography 这个强 NSFW 拉力词）
    const prefix = (m === 'lustify_v8') ? LUSTIFY_SFW_PREFIX : PREFIX[m];
    let positive, negative;
    if (isAnimeModel(m)) {
        // anime 模型分支 — wai_anihentai / unholy_desire / diving_illustrious 共用 anime 路径
        // v0.11.25 加 PLAIN_SKIN_POSITIVE 正向锁定胸部皮肤干净，跟 anti-decoration 双向夹击
        positive = `${prefix}, ${ratingTag}${cleaned}, ${PORTRAIT_FRAMING}, ${ANATOMY_QUALITY_POS_ANIME}, ${SFW_POSITIVE_BONUS}, ${PLAIN_SKIN_POSITIVE}`;
        // v0.11.21 加 ANTI_PATTERN_BLEED 防旗袍花纹印到皮肤
        // v0.11.24/v0.11.25 加 ANTI_PASTIES_BOOST 扩展版（含中国结/盘扣/medallion 等所有装饰物变体）
        negative = `${ANTI_PASTIES_BOOST}, ${NEGATIVE_EMBEDDINGS_SDXL}, ${ANATOMY_QUALITY_NEG_ANIME}, ${CLOTHES_BODY_NEG}, ${ANTI_MULTI_CHAR_NEG}, ${ANTI_PATTERN_BLEED_NEG}, ${STRONG_SFW_NEGATIVE}, ${NEGATIVE[m]}`;
    } else {
        // 写实分支 — asian_realism / lustify_v8 共用 realistic 路径
        positive = `${prefix}, ${ratingTag}${cleaned}, ${PORTRAIT_FRAMING}, ${ANATOMY_QUALITY_POS_REALISTIC}, ${SFW_POSITIVE_BONUS}`;
        // v0.11.21 加 ANTI_PATTERN_BLEED 防旗袍花纹印到皮肤
        negative = `${NEGATIVE_EMBEDDINGS_SDXL}, ${ANATOMY_QUALITY_NEG_REALISTIC}, ${CLOTHES_BODY_NEG}, ${ANTI_MULTI_CHAR_NEG}, ${ANTI_PATTERN_BLEED_NEG}, ${STRONG_SFW_NEGATIVE}, ${NEGATIVE[m]}`;
    }
    // v0.11.3 LUSTIFY 参考图也 westernize + beauty boost + 加专用 SFW 负面
    if (m === 'lustify_v8') {
        positive = westernizePrompt(positive);
        positive = `${positive}, ${LUSTIFY_BEAUTY_BOOST}`;
        negative = `${LUSTIFY_SFW_EXTRA_NEG}, ${negative}`;
    }
    // v0.11.5 Nova Asian 参考图也加 BREAK + photo tail
    if (m === 'nova_asian_il') positive = `${positive}, BREAK, depth of field, photorealistic details`;
    return {
        positive,
        negative,
        ...SIZE[m],
        ...TECH[m],
    };
}
