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
const ANTI_CENSOR = '(censored:1.4), (mosaic:1.3), (mosaic censoring:1.4), (bar censor:1.3), pixelated, pixelation, white censor, black censor, pussy censor, nipple censor, censor bar, blur censor';

// v0.7.3 SDXL Negative Textual Inversion embeddings — 已在 v0.7.4 关闭。
// 实测开 negativeXL_D + unaestheticXL_cbp62-neg 会**严重规整美学**，让 WAI-Illustrious
// 输出从"软插画+渐变阴影"变成"平涂动漫"，损失插画细节。与 PAG 串联尤甚。
// 留空字符串保留接口（`${NEGATIVE_EMBEDDINGS_SDXL}` 拼接位点不变），按需可重新填回。
const NEGATIVE_EMBEDDINGS_SDXL = '';

const NEGATIVE = {
    pony: 'score_4, score_5, score_6, lowres, worst quality, low quality, bad anatomy, bad hands, missing fingers, extra fingers, deformed, blurry, watermark, text, signature, censored, mosaic, mosaic censoring, bar censor, pussy censor, nipple censor',
    // Anti-dark + anti-UI tags prevent the underexposed/app-screenshot artifacts
    noobai: `worst quality, old, early, low quality, lowres, signature, username, logo, bad hands, mutated hands, mammal, anthro, furry, ambiguous form, feral, semi-anthro, (underexposed:1.3), dark, dim, low light, gloomy, monochrome, dark room, 3d, cgi, 3d render, figure, sculpture, plastic, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    noobai_sfw: `nsfw, worst quality, old, early, low quality, lowres, signature, username, logo, bad hands, mutated hands, mammal, anthro, furry, ambiguous form, feral, semi-anthro, (underexposed:1.3), dark, dim, low light, gloomy, monochrome, dark room, 3d, cgi, 3d render, figure, sculpture, plastic, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    // EasyNegative LoRA already removes most low-quality features at the UNet level (-0.6 strength).
    // Keep only the targeted tags the LoRA does NOT cover: anti-dark, anti-UI, anti-furry, anti-watermark, anti-censor.
    noobai_easyneg: `signature, username, logo, watermark, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    noobai_easyneg_sfw: `nsfw, signature, username, logo, watermark, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    // miaomiaoHarem style LoRA (+1.0) layered on top of EasyNegative — same negatives apply
    // but add anti-blurry/anti-low-detail to keep the style sharp.
    noobai_miaomiao: `signature, username, logo, watermark, blurry, jpeg artifacts, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    noobai_miaomiao_sfw: `nsfw, signature, username, logo, watermark, blurry, jpeg artifacts, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    majicmix: `(worst quality, low quality, normal quality:1.4), bad anatomy, bad hands, missing fingers, extra fingers, fewer digits, extra limbs, deformed, mutation, blurry, watermark, text, signature, lowres, jpeg artifacts, cartoon, 3d, anime, cgi, ${ANTI_CENSOR}`,
    // Asian Realism by Stable (PONY-based) — 继承 PONY 基础 negative，前置 Stable_Yogis_PDXL_Negatives-neg
    // trigger 词激活 negative LoRA。LoRA 已在 workflow 加载，这里 trigger 词必须在 negative prompt 开头。
    asian_realism: `Stable_Yogis_PDXL_Negatives-neg, score_4, score_5, score_6, lowres, worst quality, low quality, bad anatomy, bad hands, missing fingers, extra fingers, deformed, blurry, watermark, text, signature, censored, mosaic, mosaic censoring, bar censor, pussy censor, nipple censor, anime, cartoon, 3d, cgi`,
    // WAI-Illustrious — 作者明确建议精简 negative：长 negative 反而降画质。
    // 仅用作者推荐的 5 个核心 + ANTI_CENSOR (反 mosaic 必加) + anti-3D（v0.7.1 修：
    // anime 模型加 anatomy quality tag 后会被拉向 3D/CG 风，需 negative 反向纠正）。
    wai_illustrious: `(3d:1.3), (3dcg:1.3), (cgi:1.2), render, blender, unreal engine, photorealistic, plastic skin, doll, mannequin, figurine, smooth shading, bad quality, worst quality, worst detail, sketch, censor, ${ANTI_CENSOR}`,
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
// v0.7.4 删 'anime artwork, anime coloring, flat color'：v0.7.3 加入后实测把 WAI-Illustrious
// 从软插画风强行拉到平涂 cel-shaded，背景变饱和单色，丢失阴影渐变层次。
const ANATOMY_QUALITY_POS_ANIME = '(solo:1.4), (1girl:1.4), (perfect anatomy:1.2), (detailed body:1.1), (pointed chin:1.2), beautiful face, slender curves, (natural breast shape:1.2), (balanced proportions:1.2), aesthetic body, body harmony';
// 紧致曲线修饰：(model figure:1.2) + (fit body:1.2) 防"赘肉/plus-size"倾向（仅写实模型用）。
const ANATOMY_QUALITY_POS_REALISTIC = '(solo:1.4), (1girl:1.4), (perfect anatomy:1.2), (detailed body:1.1), (realistic proportions:1.1), correct anatomy, (pointed chin:1.2), beautiful face, (model figure:1.2), (fit body:1.2), toned body, slender curves, (natural breast shape:1.2), (balanced proportions:1.2), aesthetic body, body harmony';
// 默认（兼容旧调用，等价于写实版）—— 新代码请用 getAnatomyPos(model)
const ANATOMY_QUALITY_POS = ANATOMY_QUALITY_POS_REALISTIC;
function getAnatomyPos(m) {
    if (m === 'wai_illustrious' || m === 'noobai' || m === 'noobai_easyneg' || m === 'noobai_miaomiao') {
        return ANATOMY_QUALITY_POS_ANIME;
    }
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
// 跟 (gigantic breasts:1.4) 协同压垮身体比例。本函数把已知隐式强化词包成 (tag:0.85) 削弱。
// 不删 tag、保留作者意图，只压住 bias 共振。
const IMPLICIT_BOOST_TOKENS = [
    // breasts
    'voluptuous breasts', 'soft breasts', 'milky breasts', 'round breasts',
    'plump breasts', 'juicy breasts', 'bouncy breasts', 'jiggling breasts',
    // ass
    'bubble butt', 'soft ass', 'pale ass', 'plump ass', 'juicy ass',
    // thighs
    'soft thighs', 'pale thighs', 'plump thighs', 'juicy thighs',
];
function dampenImplicitBreastBoost(prompt, weight = 0.85) {
    if (!prompt) return prompt;
    const lookup = new Set(IMPLICIT_BOOST_TOKENS.map(t => t.toLowerCase()));
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
// 反赘肉系：plus size / chubby / fat / overweight / belly fat / fupa（小肚腩）
// 反丑脸系：ugly face / asymmetric face
// 反枕头胸系（v0.7.2）：deformed/balloon/pillow breasts —— 配合 capBreastWeight() 双重防护
const ANATOMY_QUALITY_NEG = '(bad anatomy:1.3), (deformed:1.2), (mutation:1.2), disfigured, extra limbs, missing limbs, fused fingers, distorted body, wrong anatomy, anatomy error, malformed, (bad hands:1.3), (bad fingers:1.3), (extra fingers:1.3), (missing fingers:1.3), fused fingers, mutated hands, malformed hands, (plus size:1.4), (chubby:1.4), (fat:1.4), (overweight:1.4), (obese:1.3), excess body fat, fupa, belly fat, bulky body, thick body, sagging belly, double chin, ugly face, asymmetric face, derpy face, (deformed breasts:1.3), (balloon breasts:1.3), (pillow breasts:1.3), (asymmetric breasts:1.2), (uneven breasts:1.2), distorted breasts, melted breasts, oversized breasts deformity, breast warping, bag of sand breasts';

// Anti-multiple-character: NoobAI / Illustrious models routinely hallucinate extra
// chibi/mini characters in corners, picture-in-picture artifacts, etc. Heavy weight.
// 反多人 1.5 是 NoobAI 健康水位。
// NoobAI 对 OL+黑丝特别容易出"character sheet 前后视角双人"，故 character sheet/multiple views/
// front and back view/turnaround 加 1.5 权重专门压制三视图模板。
const ANTI_MULTI_CHAR_NEG = '(multiple girls:1.5), (multiple characters:1.5), (2girls:1.5), (3girls:1.4), twins, split screen, two side by side, mirror image, duplicate, (character sheet:1.5), (multiple views:1.5), (front and back view:1.5), (turnaround:1.4), (reference sheet:1.4), (chibi:1.3), (round face:1.2), (chubby face:1.2), (baby face:1.2), mini character, mini people, small character on side, picture-in-picture, character inset, side character';

// Always-on clothing/body separation (anti-overlap — solves the "clothes intersect body" issue)
const CLOTHES_BODY_NEG = '(clothing through skin:1.3), (merged limbs:1.3), (object overlap:1.2), clothing distortion, weird clothing, melted clothes';

// Genitalia detail boost (when explicit private parts in intent)
const GENITALIA_BOOST_POS = '(detailed pussy:1.3), (perfect pussy:1.2), detailed labia, detailed clitoris, vulva detail, anatomically correct, sharp focus on genitals, realistic genitals';
const GENITALIA_BOOST_NEG = {
    pony:     '(bad genitals:1.3), (deformed pussy:1.3), malformed genitalia, poorly drawn genitals, ugly genitals, censored genitals, blurry genitals, mosaic',
    noobai:   '(bad genitals:1.3), (deformed pussy:1.3), malformed genitalia, poorly drawn genitals, ugly genitals, blurry genitals, mosaic',
    majicmix: '(bad genitals:1.3), (deformed pussy:1.3), malformed genitalia, poorly drawn genitals, blurry genitals, mosaic',
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

const PREFIX = {
    pony: 'score_9, score_8_up, score_7_up, masterpiece, best quality, detailed',
    // Explicit brightness prefix ensures NoobAI vPred outputs well-lit images after RescaleCFG
    noobai_realistic: 'masterpiece, best quality, newest, absurdres, highres, real photo, photorealistic, raw photo, photo of a real girl, detailed skin, sharp focus, bright, well-lit, daylight, high-key lighting, natural lighting',
    // anime path：NoobAI vPred 易出暗图，加 (bright lighting:1.2) 一个加权即可；
    // 不要堆多个 anime style 加权——叠加 miaomiaoHarem style LoRA 时会颜色过曝崩坏。
    noobai_anime: 'masterpiece, best quality, newest, absurdres, highres, anime style, anime coloring, illustration, (bright lighting:1.2), well-lit, daylight, soft lighting, detailed background',
    majicmix: 'Best quality, masterpiece, ultra high res, (photorealistic:1.4)',
    // Asian Realism by Stable (PONY-based) — Stable_Yogis_PDXL_Positives trigger 词激活 positive LoRA
    // 必须在 prompt 最开头（模型作者要求）。score_9 PONY 标准质量词跟在后面。
    asian_realism: 'Stable_Yogis_PDXL_Positives, score_9, score_8_up, score_7_up, masterpiece, best quality, ultra detailed, photorealistic, asian, raw photo, sharp focus, detailed skin',
    // WAI-Illustrious — 模型作者 mirabarukaso 官方工具默认（solo 在最前是反三视图/character sheet 的关键 token）
    // SFW/NSFW 的 rating 标签 (sensitive/nsfw) 由 buildPrompt 路径动态注入，不写在这里。
    // 加 (anime artwork:1.2) 防 ANATOMY tag 把模型拉向 3D/CG 风（v0.7.1 反 3D 修复）。
    wai_illustrious: 'solo, (anime artwork:1.2), masterpiece, best quality, amazing quality',
};

const SIZE = {
    pony: { width: 832, height: 1216 },
    noobai: { width: 832, height: 1216 },
    noobai_easyneg: { width: 832, height: 1216 },
    noobai_miaomiao: { width: 832, height: 1216 },
    majicmix: { width: 768, height: 1152 },
    asian_realism: { width: 832, height: 1216 },
    wai_illustrious: { width: 1024, height: 1360 },
};

const TECH = {
    pony: { cfg: 6.5, sampler: 'dpmpp_2m_sde', scheduler: 'karras', steps: 30 },
    noobai: { cfg: 7.0, sampler: 'euler', scheduler: 'normal', steps: 30 },
    noobai_easyneg: { cfg: 7.0, sampler: 'euler', scheduler: 'normal', steps: 30 },
    noobai_miaomiao: { cfg: 7.0, sampler: 'euler', scheduler: 'normal', steps: 30 },
    majicmix: { cfg: 7.0, sampler: 'euler_ancestral', scheduler: 'karras', steps: 30 },
    asian_realism: { cfg: 6.5, sampler: 'dpmpp_2m_sde', scheduler: 'karras', steps: 30 },
    // WAI-Illustrious 模型作者 mirabarukaso 官方工具默认: Euler a + CFG 7 + 30 steps
    wai_illustrious: { cfg: 7.0, sampler: 'euler_ancestral', scheduler: 'normal', steps: 30 },
};

export function buildPrompt({ aiPrompt = '', characterAnchor = '', characterFullPrompt = '', intent = { level: 'sfw', tags: [] }, model = 'pony', styleHint = 'auto' }) {
    const nsfw = isNSFW(intent.level);
    const m = model || 'pony';

    // SFW gate: strip NSFW tokens that AI may have snuck into <pic prompt="...">.
    let cleanedAiPrompt = nsfw ? aiPrompt : stripNsfwTokens(aiPrompt);
    // When using full anchor, strip appearance tokens from aiPrompt to avoid
    // conflicts with locked character (AI may have put "black hair" when char is purple)
    if (characterFullPrompt) cleanedAiPrompt = stripAppearanceTokens(cleanedAiPrompt);

    const isNoobaiFamily = (m === 'noobai' || m === 'noobai_easyneg' || m === 'noobai_miaomiao');
    const isPonyFamily = (m === 'pony' || m === 'asian_realism');
    const isIllustriousFamily = (m === 'wai_illustrious');
    let prefix, negative;
    if (m === 'pony') {
        prefix = PREFIX.pony;
        negative = NEGATIVE.pony;
    } else if (isNoobaiFamily) {
        // NoobAI is an anime/illustration model (NovelAI fork) — default to the anime prefix.
        // Forcing the realistic prefix conflicts with anime character anchors and produces
        // muddy/poor-quality images. Realistic is opt-in only (styleHint === 'realistic').
        const useRealistic = styleHint === 'realistic';
        prefix = useRealistic ? PREFIX.noobai_realistic : PREFIX.noobai_anime;
        prefix = `${prefix}, ${nsfw ? 'nsfw' : 'safe'}`;
        if (m === 'noobai_miaomiao') {
            negative = nsfw ? NEGATIVE.noobai_miaomiao : NEGATIVE.noobai_miaomiao_sfw;
        } else if (m === 'noobai_easyneg') {
            negative = nsfw ? NEGATIVE.noobai_easyneg : NEGATIVE.noobai_easyneg_sfw;
        } else {
            negative = nsfw ? NEGATIVE.noobai : NEGATIVE.noobai_sfw;
        }
    } else if (m === 'majicmix') {
        prefix = PREFIX.majicmix;
        negative = NEGATIVE.majicmix;
    } else if (m === 'asian_realism') {
        prefix = PREFIX.asian_realism;
        negative = NEGATIVE.asian_realism;
    } else if (m === 'wai_illustrious') {
        prefix = PREFIX.wai_illustrious;
        negative = NEGATIVE.wai_illustrious;
    } else {
        prefix = PREFIX.pony;
        negative = NEGATIVE.pony;
    }

    if (!nsfw) negative = `${STRONG_SFW_NEGATIVE}, ${negative}`;

    // Always-on anatomy quality + clothes-body separation + anti-multi-character negatives.
    // These are cheap insurance against deformed bodies, clothing-through-skin artifacts,
    // and the "extra chibi character in corner" bug common to NoobAI / Illustrious models.
    // v0.7.3 加 SDXL negative embeddings 到最前（embedding token 在 prompt 头部权重最高）。
    negative = `${NEGATIVE_EMBEDDINGS_SDXL}, ${ANATOMY_QUALITY_NEG}, ${CLOTHES_BODY_NEG}, ${ANTI_MULTI_CHAR_NEG}, ${negative}`;

    // Genitalia quality boost: add anatomy detail tags when explicit genitalia are in intent
    const genBoost = nsfw && needsGenitaliaBoost(intent.tags);
    if (genBoost) {
        const negKey = m === 'majicmix' ? 'majicmix' : isNoobaiFamily ? 'noobai' : 'pony';
        negative = `${GENITALIA_BOOST_NEG[negKey]}, ${negative}`;
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
        // capBreastWeight: 把视觉档案 (gigantic breasts:1.4+) 截到 1.2，防"枕头胸"畸形（v0.7.2）。
        // dampenImplicitBreastBoost: 隐式强化词 (voluptuous/soft/milky breasts) 降权到 0.85（v0.7.4）。
        const cleanedFullAnchor = dampenImplicitBreastBoost(capBreastWeight(nsfw
            ? stripOutfitTokens(characterFullPrompt)
            : stripNsfwTokens(characterFullPrompt)));
        if (isNoobaiFamily) {
            parts.push(`${nsfw ? 'nsfw' : 'safe'}, ${cleanedFullAnchor}`);
        } else if (isPonyFamily) {
            parts.push(`${nsfw ? 'rating_explicit' : 'rating_safe'}, ${cleanedFullAnchor}`);
        } else if (isIllustriousFamily) {
            // Illustrious 评级体系: general/sensitive/nsfw/explicit
            parts.push(`${nsfw ? 'nsfw, explicit' : 'sensitive'}, ${cleanedFullAnchor}`);
        } else {
            parts.push(cleanedFullAnchor);
        }
    } else {
        // Standard path: prefix + appearance anchor.
        // Same outfit-strip logic applies for symmetry — if user put clothing
        // in the short anchor.prompt, NSFW intent should still take over.
        parts.push(prefix);
        if (characterAnchor) {
            // capBreastWeight + dampenImplicitBreastBoost: 双重防 bias 共振（v0.7.2 + v0.7.4）。
            parts.push(dampenImplicitBreastBoost(capBreastWeight(nsfw ? stripOutfitTokens(characterAnchor) : characterAnchor)));
        }
        if (isPonyFamily) parts.unshift(nsfw ? 'rating_explicit' : 'rating_safe');
        if (isIllustriousFamily) parts.unshift(nsfw ? 'nsfw, explicit' : 'sensitive');
    }

    // Always-on anatomy quality (insurance against deformed bodies)
    // 模型分流：anime 模型（wai/noobai）用反 3D 版本，写实模型（pony/asian_realism/majicmix）用原版。
    parts.push(getAnatomyPos(m));

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

    // Asian Realism (PONY-based) 强制 LoRA trigger 词前置 — 模型作者要求这两个 trigger 词
    // 必须在 prompt 最开头（positive: Stable_Yogis_PDXL_Positives；negative: Stable_Yogis_PDXL_Negatives-neg）。
    // 走 characterFullPrompt 路径时 prefix 不会被加入，所以这里统一兜底前置；同时把 negative 里的
    // trigger 词从 NEGATIVE.asian_realism 当前位置（被 ANATOMY/CLOTHES/MULTI 推后）提到最开头。
    if (m === 'asian_realism') {
        if (!positive.startsWith('Stable_Yogis_PDXL_Positives')) {
            positive = `Stable_Yogis_PDXL_Positives, ${positive}`;
        }
        negative = negative.replace(/Stable_Yogis_PDXL_Negatives-neg,?\s*/g, '');
        negative = `Stable_Yogis_PDXL_Negatives-neg, ${negative}`;
    }

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
export function buildReferencePromptFull({ sdPrompt = '', model = 'pony' }) {
    // capBreastWeight + dampenImplicitBreastBoost：双重防"枕头胸"（v0.7.2 + v0.7.4）。
    const cleaned = dampenImplicitBreastBoost(capBreastWeight(stripNsfwTokens(sdPrompt)));
    let positive = cleaned;
    let negative;
    if (model === 'noobai' || model === 'noobai_easyneg' || model === 'noobai_miaomiao') {
        positive = `safe, ${cleaned}`;
        const negSfw = model === 'noobai_miaomiao'
            ? NEGATIVE.noobai_miaomiao_sfw
            : model === 'noobai_easyneg'
                ? NEGATIVE.noobai_easyneg_sfw
                : NEGATIVE.noobai_sfw;
        negative = `${NEGATIVE_EMBEDDINGS_SDXL}, ${STRONG_SFW_NEGATIVE}, ${negSfw}`;
    } else if (model === 'pony') {
        positive = `rating_safe, ${cleaned}`;
        negative = `${NEGATIVE_EMBEDDINGS_SDXL}, ${STRONG_SFW_NEGATIVE}, ${NEGATIVE.pony}`;
    } else if (model === 'asian_realism') {
        // Asian Realism (PONY-based) — 必须前置正面 trigger 词激活 LoRA + rating_safe (SFW 参考图)
        positive = `Stable_Yogis_PDXL_Positives, rating_safe, ${cleaned}`;
        negative = `${NEGATIVE_EMBEDDINGS_SDXL}, ${STRONG_SFW_NEGATIVE}, ${NEGATIVE.asian_realism}`;
    } else if (model === 'wai_illustrious') {
        // WAI-Illustrious — Illustrious 评级 4 档 (general/sensitive/nsfw/explicit)。
        // SFW 参考图用 general (完全无暴露) 而非 sensitive (轻度暴露)，防巨乳走光。
        // 加 PREFIX (含 solo + anime artwork, 反 character sheet + 反 3D 关键 token)
        //   + portrait framing + ANATOMY_QUALITY_POS_ANIME + 三层 negative 防护 + SDXL embedding：
        // 不加这些防护时三视图/character sheet bias 命中率 ~60%，加后 <5%。
        const PORTRAIT_FRAMING = '(looking at viewer:1.2), upper body, simple background';
        positive = `${PREFIX.wai_illustrious}, general, ${cleaned}, ${PORTRAIT_FRAMING}, ${ANATOMY_QUALITY_POS_ANIME}`;
        negative = `${NEGATIVE_EMBEDDINGS_SDXL}, ${ANATOMY_QUALITY_NEG}, ${CLOTHES_BODY_NEG}, ${ANTI_MULTI_CHAR_NEG}, ${STRONG_SFW_NEGATIVE}, ${NEGATIVE.wai_illustrious}`;
    } else {
        negative = `${NEGATIVE_EMBEDDINGS_SDXL}, ${STRONG_SFW_NEGATIVE}, ${NEGATIVE.majicmix}`;
    }
    return {
        positive,
        negative,
        ...SIZE[model] || SIZE.pony,
        ...TECH[model] || TECH.pony,
    };
}
