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

const NEGATIVE = {
    pony: 'score_4, score_5, score_6, lowres, worst quality, low quality, bad anatomy, bad hands, missing fingers, extra fingers, deformed, blurry, watermark, text, signature, censored, mosaic, mosaic censoring, bar censor, pussy censor, nipple censor',
    // Anti-dark + anti-UI tags prevent the underexposed/app-screenshot artifacts
    noobai: `worst quality, old, early, low quality, lowres, signature, username, logo, bad hands, mutated hands, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    noobai_sfw: `nsfw, worst quality, old, early, low quality, lowres, signature, username, logo, bad hands, mutated hands, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    // EasyNegative LoRA already removes most low-quality features at the UNet level (-0.6 strength).
    // Keep only the targeted tags the LoRA does NOT cover: anti-dark, anti-UI, anti-furry, anti-watermark, anti-censor.
    noobai_easyneg: `signature, username, logo, watermark, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    noobai_easyneg_sfw: `nsfw, signature, username, logo, watermark, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    // miaomiaoHarem style LoRA (+1.0) layered on top of EasyNegative — same negatives apply
    // but add anti-blurry/anti-low-detail to keep the style sharp.
    noobai_miaomiao: `signature, username, logo, watermark, blurry, jpeg artifacts, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    noobai_miaomiao_sfw: `nsfw, signature, username, logo, watermark, blurry, jpeg artifacts, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay, ${ANTI_CENSOR}`,
    majicmix: `(worst quality, low quality, normal quality:1.4), bad anatomy, bad hands, missing fingers, extra fingers, fewer digits, extra limbs, deformed, mutation, blurry, watermark, text, signature, lowres, jpeg artifacts, cartoon, 3d, anime, cgi, ${ANTI_CENSOR}`,
};

// ──────────────────────────────────────────────────────────────────────────
// Quality boost system (Booru-style SD prompt engineering best practice):
//   1. ANATOMY_QUALITY — always added (human subjects). Fixes general body errors.
//   2. CLOTHES_BODY_NEG — always added. Fixes clothing-through-skin / merged limbs.
//   3. GENITALIA_BOOST — added when explicit body parts in intent. Sharper private areas.
//   4. BODY_PART_FOCUS_BOOST — added when intent has X-focus tags (legs/breast/ass/pussy focus).
// ──────────────────────────────────────────────────────────────────────────

// Always-on anatomy quality (cheap insurance against deformed bodies)
// solo + 1girl 双重锁定（NoobAI/Illustrious 对 1girl 比 solo 更敏感，单 solo 1.3 仍易出多人）。
// anime face 修饰：pointed chin + small face + oval face 是 booru 标准 anime 美学组合，强制压制
// "娃娃圆脸/chibi" 倾向；放在 positive 的 always-on 段，所有角色统一动画脸型。
const ANATOMY_QUALITY_POS = '(solo:1.4), (1girl:1.4), (perfect anatomy:1.2), (detailed body:1.1), (realistic proportions:1.1), correct anatomy, (pointed chin:1.2), small face, oval face, anime face, beautiful detailed face';
const ANATOMY_QUALITY_NEG = '(bad anatomy:1.3), (deformed:1.2), (mutation:1.2), disfigured, extra limbs, missing limbs, fused fingers, distorted body, wrong anatomy, anatomy error, malformed, (bad hands:1.3), (bad fingers:1.3), (extra fingers:1.3), (missing fingers:1.3), fused fingers, mutated hands, malformed hands';

// Anti-multiple-character: NoobAI / Illustrious models routinely hallucinate extra
// chibi/mini characters in corners, picture-in-picture artifacts, etc. Heavy weight.
const ANTI_MULTI_CHAR_NEG = '(multiple girls:1.5), (multiple characters:1.5), (2girls:1.5), (3girls:1.5), (chibi:1.4), (round face:1.3), (chubby face:1.3), (baby face:1.3), mini character, mini people, small character on side, picture-in-picture, character inset, character sheet, multiple views, side character';

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
    // anime path also needs explicit brightness — NoobAI vPred goes dark without these
    noobai_anime: 'masterpiece, best quality, newest, absurdres, highres, anime style, anime coloring, illustration, vibrant colors, bright, well-lit, soft lighting, detailed background',
    majicmix: 'Best quality, masterpiece, ultra high res, (photorealistic:1.4)',
};

const SIZE = {
    pony: { width: 832, height: 1216 },
    noobai: { width: 832, height: 1216 },
    noobai_easyneg: { width: 832, height: 1216 },
    noobai_miaomiao: { width: 832, height: 1216 },
    majicmix: { width: 768, height: 1152 },
};

const TECH = {
    pony: { cfg: 6.5, sampler: 'dpmpp_2m_sde', scheduler: 'karras', steps: 30 },
    noobai: { cfg: 7.0, sampler: 'euler', scheduler: 'normal', steps: 30 },
    noobai_easyneg: { cfg: 7.0, sampler: 'euler', scheduler: 'normal', steps: 30 },
    noobai_miaomiao: { cfg: 7.0, sampler: 'euler', scheduler: 'normal', steps: 30 },
    majicmix: { cfg: 7.0, sampler: 'euler_ancestral', scheduler: 'karras', steps: 30 },
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
    } else {
        prefix = PREFIX.pony;
        negative = NEGATIVE.pony;
    }

    if (!nsfw) negative = `${STRONG_SFW_NEGATIVE}, ${negative}`;

    // Always-on anatomy quality + clothes-body separation + anti-multi-character negatives.
    // These are cheap insurance against deformed bodies, clothing-through-skin artifacts,
    // and the "extra chibi character in corner" bug common to NoobAI / Illustrious models.
    negative = `${ANATOMY_QUALITY_NEG}, ${CLOTHES_BODY_NEG}, ${ANTI_MULTI_CHAR_NEG}, ${negative}`;

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
        const cleanedFullAnchor = nsfw
            ? stripOutfitTokens(characterFullPrompt)
            : stripNsfwTokens(characterFullPrompt);
        if (isNoobaiFamily) {
            parts.push(`${nsfw ? 'nsfw' : 'safe'}, ${cleanedFullAnchor}`);
        } else if (m === 'pony') {
            parts.push(`${nsfw ? 'rating_explicit' : 'rating_safe'}, ${cleanedFullAnchor}`);
        } else {
            parts.push(cleanedFullAnchor);
        }
    } else {
        // Standard path: prefix + appearance anchor.
        // Same outfit-strip logic applies for symmetry — if user put clothing
        // in the short anchor.prompt, NSFW intent should still take over.
        parts.push(prefix);
        if (characterAnchor) {
            parts.push(nsfw ? stripOutfitTokens(characterAnchor) : characterAnchor);
        }
        if (m === 'pony') parts.unshift(nsfw ? 'rating_explicit' : 'rating_safe');
    }

    // Always-on anatomy quality (insurance against deformed bodies)
    parts.push(ANATOMY_QUALITY_POS);

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

    const positive = parts.filter(Boolean).join(', ');

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
    const cleaned = stripNsfwTokens(sdPrompt);
    let positive = cleaned;
    let negative;
    if (model === 'noobai' || model === 'noobai_easyneg' || model === 'noobai_miaomiao') {
        positive = `safe, ${cleaned}`;
        const negSfw = model === 'noobai_miaomiao'
            ? NEGATIVE.noobai_miaomiao_sfw
            : model === 'noobai_easyneg'
                ? NEGATIVE.noobai_easyneg_sfw
                : NEGATIVE.noobai_sfw;
        negative = `${STRONG_SFW_NEGATIVE}, ${negSfw}`;
    } else if (model === 'pony') {
        positive = `rating_safe, ${cleaned}`;
        negative = `${STRONG_SFW_NEGATIVE}, ${NEGATIVE.pony}`;
    } else {
        negative = `${STRONG_SFW_NEGATIVE}, ${NEGATIVE.majicmix}`;
    }
    return {
        positive,
        negative,
        ...SIZE[model] || SIZE.pony,
        ...TECH[model] || TECH.pony,
    };
}
