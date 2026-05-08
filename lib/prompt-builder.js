// Build positive/negative prompts per model.
// Inputs: { aiPrompt, characterAnchor, intent: {level, tags}, model }
// Output: { positive, negative, width, height, cfg, steps, sampler, scheduler }
//
// Honors:
//   - SFW vs NSFW different prefixes (esp. NoobAI safe/nsfw flip)
//   - Character anchor merged so locked characters keep consistent appearance
//   - Intent tags spliced in (the user's "看看小穴" → pussy, close-up actually appear)
//   - Per-model technical params from 工作流接入指南.md

import { isNSFW, stripNsfwTokens, stripAppearanceTokens, stripOutfitTokens, STRONG_SFW_NEGATIVE } from './nsfw-classifier.js';

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
    asian_realism: `score_4, score_5, score_6, worst quality, low quality, bad anatomy, bad hands, missing fingers, extra fingers, deformed, blurry, watermark, text, signature, anime, cartoon, 3d, cgi, neon lighting, colored gel lighting, blue lighting, green lighting, purple lighting, cyan lighting, studio gel lights, dramatic colored lighting, harsh shadows, color grading, color tint, chromatic aberration, ${ANTI_CENSOR}`,
    // waiANIHENTAIPONYXL v60 — 作者推荐 negative：score_4-6 + 基础 anti-deformity + anti-furry。
    // PONY-XL 派生 anime，反 source_furry/source_pony/source_cartoon 压住非 anime 风格。
    wai_anihentai: `score_4, score_5, score_6, worst quality, low quality, bad anatomy, bad hands, missing fingers, fewer digits, source_furry, source_pony, source_cartoon, 3d, blurry, ${ANTI_CENSOR}`,
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
// 保留核心 6：solo / 1girl / perfect anatomy / korean idol face / fit body / flat stomach
// 其余韩日明星脸 / 健身网红 tag 改为无加权（暗示，避免挤压 weight 段）
const ANATOMY_QUALITY_POS_REALISTIC = '(solo:1.4), (1girl:1.4), (perfect anatomy:1.2), detailed body, realistic proportions, correct anatomy, pointed chin, beautiful face, (korean idol face:1.3), japanese model face, (fit body:1.3), athletic body, toned abs, (flat stomach:1.3), defined waist, slim waist, toned body, slender curves, natural breast shape, balanced proportions, aesthetic body, body harmony, fitness influencer';
// 默认（兼容旧调用，等价于写实版）—— 新代码请用 getAnatomyPos(model)
const ANATOMY_QUALITY_POS = ANATOMY_QUALITY_POS_REALISTIC;
function getAnatomyPos(m) {
    if (m === 'wai_anihentai') return ANATOMY_QUALITY_POS_ANIME;
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
    return model === 'wai_anihentai' ? processPromptAnime(p) : processPromptRealistic(p);
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
    return model === 'wai_anihentai' ? ANATOMY_QUALITY_NEG_ANIME : ANATOMY_QUALITY_NEG_REALISTIC;
}

// v0.7.9 trim 11→3 时砍多了，三视图 bug 复现。v0.7.10 加回 6 个核心 anti-三视图加权。
// v0.7.11 trim turnaround/chibi 转无加权（让位给 anti-pasty 加权），只保留 5 个核心 1.5 加权 anti-多人。
const ANTI_MULTI_CHAR_NEG = '(multiple girls:1.5), (multiple characters:1.5), (character sheet:1.5), (multiple views:1.5), (front and back view:1.5), turnaround, chibi, 2girls, 3girls, twins, split screen, two side by side, mirror image, duplicate, reference sheet, round face, chubby face, baby face, mini character, mini people, small character on side, picture-in-picture, character inset, side character';

// v0.7.9 trim：原 3 个加权 → 1 个核心 (clothing through skin 1.3)
const CLOTHES_BODY_NEG = '(clothing through skin:1.3), merged limbs, object overlap, clothing distortion, weird clothing, melted clothes';

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
    asian_realism: 'score_9, score_8_up, score_7_up, masterpiece, best quality, ultra detailed, photorealistic, asian, raw photo, sharp focus, detailed skin, daylight, natural lighting, soft lighting, white background, indoor lighting, even lighting',
    // waiANIHENTAIPONYXL v60 — 作者推荐 PREFIX (PONY-XL 派生 anime hentai)。
    // SFW/NSFW 的 rating 标签 (rating_safe / rating_explicit) 由 buildPrompt 路径动态注入。
    wai_anihentai: 'score_9, score_8_up, score_7_up, source_anime, masterpiece, best quality, amazing quality',
};

const SIZE = {
    asian_realism: { width: 832, height: 1216 },
    wai_anihentai: { width: 832, height: 1216 },
};

const TECH = {
    // illustAsianCoser_v3 作者推荐: dpmpp_sde + beta scheduler + 30 steps + ≥832x1216
    asian_realism: { cfg: 6.5, sampler: 'dpmpp_sde', scheduler: 'beta', steps: 30 },
    // waiANIHENTAIPONYXL v60 作者推荐: Euler a + CFG 7 + 30 steps
    wai_anihentai: { cfg: 7.0, sampler: 'euler_ancestral', scheduler: 'normal', steps: 30 },
};

export function buildPrompt({ aiPrompt = '', characterAnchor = '', characterFullPrompt = '', intent = { level: 'sfw', tags: [] }, model = 'wai_anihentai', styleHint = 'auto' }) {
    const nsfw = isNSFW(intent.level);
    const m = (model === 'asian_realism' || model === 'wai_anihentai') ? model : 'wai_anihentai';

    // SFW gate: strip NSFW tokens that AI may have snuck into <pic prompt="...">.
    let cleanedAiPrompt = nsfw ? aiPrompt : stripNsfwTokens(aiPrompt);
    // When using full anchor, strip appearance tokens from aiPrompt to avoid
    // conflicts with locked character (AI may have put "black hair" when char is purple)
    if (characterFullPrompt) cleanedAiPrompt = stripAppearanceTokens(cleanedAiPrompt);

    // v0.8.0 simplified family detection — only 2 models left, both PONY-XL family.
    // wai_anihentai = anime PONY-XL；asian_realism = realistic PONY-XL。
    const isAnime = (m === 'wai_anihentai');
    const isRealistic = (m === 'asian_realism');
    let prefix = PREFIX[m];
    let negative = NEGATIVE[m];

    if (!nsfw) negative = `${STRONG_SFW_NEGATIVE}, ${negative}`;

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
        const cleanedFullAnchor = processPromptForModel(nsfw
            ? stripOutfitTokens(characterFullPrompt)
            : stripNsfwTokens(characterFullPrompt), m);
        // v0.8.0 简化：两个模型都是 PONY-XL 家族，统一用 rating_safe / rating_explicit
        parts.push(`${nsfw ? 'rating_explicit' : 'rating_safe'}, ${cleanedFullAnchor}`);
    } else {
        // Standard path: prefix + appearance anchor.
        // Same outfit-strip logic applies for symmetry — if user put clothing
        // in the short anchor.prompt, NSFW intent should still take over.
        parts.push(prefix);
        if (characterAnchor) {
            // v0.7.5 模型分流双重防护
            parts.push(processPromptForModel(nsfw ? stripOutfitTokens(characterAnchor) : characterAnchor, m));
        }
        // v0.8.0 PONY 家族 rating 标签（asian_realism / wai_anihentai）
        parts.unshift(nsfw ? 'rating_explicit' : 'rating_safe');
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
// v0.8.0 简化：只剩 asian_realism + wai_anihentai 两个模型。
export function buildReferencePromptFull({ sdPrompt = '', model = 'wai_anihentai' }) {
    const m = (model === 'asian_realism' || model === 'wai_anihentai') ? model : 'wai_anihentai';
    // capBreastWeight + dampenImplicitBreastBoost：双重防"枕头胸"（v0.7.2 + v0.7.4）。
    const cleaned = processPromptForModel(stripNsfwTokens(sdPrompt), m);
    const PORTRAIT_FRAMING = '(looking at viewer:1.2), upper body, simple background';
    let positive, negative;
    if (m === 'asian_realism') {
        // v0.8.1 illustAsianCoser_v3：无 LoRA trigger 词，直接 rating_safe
        positive = `${PREFIX.asian_realism}, rating_safe, ${cleaned}, ${PORTRAIT_FRAMING}, ${ANATOMY_QUALITY_POS_REALISTIC}`;
        negative = `${NEGATIVE_EMBEDDINGS_SDXL}, ${ANATOMY_QUALITY_NEG_REALISTIC}, ${CLOTHES_BODY_NEG}, ${ANTI_MULTI_CHAR_NEG}, ${STRONG_SFW_NEGATIVE}, ${NEGATIVE.asian_realism}`;
    } else {
        // wai_anihentai —— PONY-XL 派生 anime hentai
        positive = `${PREFIX.wai_anihentai}, rating_safe, ${cleaned}, ${PORTRAIT_FRAMING}, ${ANATOMY_QUALITY_POS_ANIME}`;
        negative = `${NEGATIVE_EMBEDDINGS_SDXL}, ${ANATOMY_QUALITY_NEG_ANIME}, ${CLOTHES_BODY_NEG}, ${ANTI_MULTI_CHAR_NEG}, ${STRONG_SFW_NEGATIVE}, ${NEGATIVE.wai_anihentai}`;
    }
    return {
        positive,
        negative,
        ...SIZE[m],
        ...TECH[m],
    };
}
