// Build positive/negative prompts per model.
// Inputs: { aiPrompt, characterAnchor, intent: {level, tags}, model }
// Output: { positive, negative, width, height, cfg, steps, sampler, scheduler }
//
// Honors:
//   - SFW vs NSFW different prefixes (esp. NoobAI safe/nsfw flip)
//   - Character anchor merged so locked characters keep consistent appearance
//   - Intent tags spliced in (the user's "看看小穴" → pussy, close-up actually appear)
//   - Per-model technical params from 工作流接入指南.md

import { isNSFW, stripNsfwTokens, stripAppearanceTokens, STRONG_SFW_NEGATIVE } from './nsfw-classifier.js';

const NEGATIVE = {
    pony: 'score_4, score_5, score_6, lowres, worst quality, low quality, bad anatomy, bad hands, missing fingers, extra fingers, deformed, blurry, watermark, text, signature, censored, mosaic',
    // Anti-dark + anti-UI tags prevent the underexposed/app-screenshot artifacts
    noobai: 'worst quality, old, early, low quality, lowres, signature, username, logo, bad hands, mutated hands, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay',
    noobai_sfw: 'nsfw, worst quality, old, early, low quality, lowres, signature, username, logo, bad hands, mutated hands, mammal, anthro, furry, ambiguous form, feral, semi-anthro, dark, dim, low light, underexposed, monochrome, dark room, app interface, status bar, ui, app screenshot, phone screen frame, social media overlay',
    majicmix: '(worst quality, low quality, normal quality:1.4), bad anatomy, bad hands, missing fingers, extra fingers, fewer digits, extra limbs, deformed, mutation, blurry, watermark, text, signature, lowres, jpeg artifacts, cartoon, 3d, anime, cgi',
};

// Anatomy quality boost — appended when explicit genitalia appear in intent tags.
// Positive: fine detail emphasis. Negative: specific deformation artifacts for genitalia.
const GENITALIA_BOOST_POS = 'detailed genitals, anatomically correct, detailed labia, vulva detail, realistic genitals';
const GENITALIA_BOOST_NEG = {
    pony:     'bad genitals, deformed pussy, malformed genitalia, poorly drawn genitals, ugly genitals, censored genitals',
    noobai:   'bad genitals, deformed pussy, malformed genitalia, poorly drawn genitals, ugly genitals',
    majicmix: '(bad genitals:1.3), (deformed pussy:1.3), malformed genitalia, poorly drawn genitals',
};
const GENITALIA_TRIGGER_TAGS = ['pussy', 'vagina', 'vulva', 'labia', 'spread legs', 'open legs', 'sex', 'penetration', 'creampie', 'cum inside', 'cumshot', 'anus', 'anal'];

function needsGenitaliaBoost(intentTags = []) {
    return intentTags.some((t) => GENITALIA_TRIGGER_TAGS.some((g) => t.toLowerCase().includes(g)));
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
    majicmix: { width: 768, height: 1152 },
};

const TECH = {
    pony: { cfg: 6.5, sampler: 'dpmpp_2m_sde', scheduler: 'karras', steps: 30 },
    noobai: { cfg: 7.0, sampler: 'euler', scheduler: 'normal', steps: 30 },
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

    let prefix, negative;
    if (m === 'pony') {
        prefix = PREFIX.pony;
        negative = NEGATIVE.pony;
    } else if (m === 'noobai') {
        // NoobAI is an anime/illustration model (NovelAI fork) — default to the anime prefix.
        // Forcing the realistic prefix conflicts with anime character anchors and produces
        // muddy/poor-quality images. Realistic is opt-in only (styleHint === 'realistic').
        const useRealistic = styleHint === 'realistic';
        prefix = useRealistic ? PREFIX.noobai_realistic : PREFIX.noobai_anime;
        prefix = `${prefix}, ${nsfw ? 'nsfw' : 'safe'}`;
        negative = nsfw ? NEGATIVE.noobai : NEGATIVE.noobai_sfw;
    } else if (m === 'majicmix') {
        prefix = PREFIX.majicmix;
        negative = NEGATIVE.majicmix;
    } else {
        prefix = PREFIX.pony;
        negative = NEGATIVE.pony;
    }

    if (!nsfw) negative = `${STRONG_SFW_NEGATIVE}, ${negative}`;

    // Genitalia quality boost: add anatomy detail tags when explicit genitalia are in intent
    const genBoost = nsfw && needsGenitaliaBoost(intent.tags);
    if (genBoost) {
        const negKey = m === 'majicmix' ? 'majicmix' : m === 'noobai' ? 'noobai' : 'pony';
        negative = `${GENITALIA_BOOST_NEG[negKey]}, ${negative}`;
    }

    const parts = [];

    if (characterFullPrompt) {
        // Locked character with rich SD prompt — use it as the dominant base
        // (already includes quality + appearance + composition).
        // Strip NSFW from sdPrompt too if intent is SFW, then prepend safe/nsfw marker for noobai
        const cleanedFullAnchor = nsfw ? characterFullPrompt : stripNsfwTokens(characterFullPrompt);
        if (m === 'noobai') {
            parts.push(`${nsfw ? 'nsfw' : 'safe'}, ${cleanedFullAnchor}`);
        } else if (m === 'pony') {
            parts.push(`${nsfw ? 'rating_explicit' : 'rating_safe'}, ${cleanedFullAnchor}`);
        } else {
            parts.push(cleanedFullAnchor);
        }
    } else {
        // Standard path: prefix + appearance anchor
        parts.push(prefix);
        if (characterAnchor) parts.push(characterAnchor);
        if (m === 'pony') parts.unshift(nsfw ? 'rating_explicit' : 'rating_safe');
    }

    // Intent tags (NSFW/setting hints from user message)
    if (intent.tags?.length) parts.push(intent.tags.join(', '));

    // Genitalia quality boost positive tags
    if (genBoost) parts.push(GENITALIA_BOOST_POS);

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
    if (model === 'noobai') {
        positive = `safe, ${cleaned}`;
        negative = `${STRONG_SFW_NEGATIVE}, ${NEGATIVE.noobai_sfw}`;
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
