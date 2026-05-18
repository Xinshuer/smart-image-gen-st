// v0.11.19 触发式 LoRA 匹配器
// 输入：{ userText, aiPrompt, intent, model }
// 输出：命中并通过 cap 的 LoRA 配置数组（含 weight 可能已被缩放）
//
// 算法（顺序执行）：
//   1. 按用户当前 SD 模型查架构家族 → 过滤架构不兼容的 LoRA
//   2. NSFW gate：requireNSFW=true 时 intent.level 必须是 'explicit'
//   3. trigger 测试：任一正则命中 userText+aiPrompt 拼接串
//   4. 优先级降序 + id 字母序兜底（reroll 一致性 — 同输入永远同输出）
//   5. conflictsWith 冲突解决（高优先级保留，低的丢）
//   6. 数量 cap (MAX_LORAS=3) + 总 model 权重 cap (MAX_TOTAL_WEIGHT=2.0)
//      超总权重时缩放最后一个，缩到 < MIN_SCALED_WEIGHT 则直接丢

import { LORA_REGISTRY } from './lora-registry.js';
import { isNSFW } from './nsfw-classifier.js';

// 用户当前 6 个模型的架构家族映射
// 添加新模型时同步更新这张表
const MODEL_ARCH = {
    nova_asian_il: 'illustrious',
    unholy_desire: 'illustrious',
    diving_illustrious: 'illustrious',
    wai_anihentai: 'pony',
    asian_realism: 'pony',
    lustify_v8: 'sdxl',
};

const MAX_LORAS = 3;
const MAX_TOTAL_WEIGHT = 2.0;
const MIN_SCALED_WEIGHT = 0.3;

export function getModelArch(model) {
    return MODEL_ARCH[model] || null;
}

// 5/6 个 workflow 节点 5 是 DMD2 LoraLoader → LoRA 在 CFG 1.6 / 8 步路径下效果减弱
// 仅 unholy_desire 走 CFG 2.5 / 16 步路径，无 DMD2，LoRA 表达力满血
const DMD2_MODELS = new Set([
    'nova_asian_il',
    'diving_illustrious',
    'wai_anihentai',
    'asian_realism',
    'lustify_v8',
]);

export function isDMD2Model(model) {
    return DMD2_MODELS.has(model);
}

export function matchLoRAs({ userText = '', aiPrompt = '', intent = {}, model = '' }) {
    const arch = getModelArch(model);
    if (!arch) return [];

    const text = `${userText} ${aiPrompt}`;
    const nsfw = isNSFW(intent.level || 'sfw');

    // 1+2+3: 架构 + NSFW + trigger 联合过滤
    const candidates = LORA_REGISTRY.filter((l) => {
        if (l.baseModel !== arch) return false;
        if (l.requireNSFW && !nsfw) return false;
        return l.triggers.some((re) => re.test(text));
    });

    // 4. priority desc + id 字母序兜底（reroll 确定性）
    candidates.sort((a, b) => {
        const pdiff = (b.priority || 0) - (a.priority || 0);
        if (pdiff !== 0) return pdiff;
        return a.id.localeCompare(b.id);
    });

    // 5. conflictsWith 冲突解决
    const resolved = [];
    for (const lora of candidates) {
        const conflict = resolved.some(
            (kept) =>
                (kept.conflictsWith || []).includes(lora.id) ||
                (lora.conflictsWith || []).includes(kept.id),
        );
        if (!conflict) resolved.push(lora);
    }

    // 6. cap 数量 + 总权重（超时缩放最后一个）
    const capped = [];
    let totalModelWeight = 0;
    for (const lora of resolved) {
        if (capped.length >= MAX_LORAS) break;
        let mw = lora.weight.model;
        let cw = lora.weight.clip;
        if (totalModelWeight + mw > MAX_TOTAL_WEIGHT) {
            const remaining = MAX_TOTAL_WEIGHT - totalModelWeight;
            if (remaining < MIN_SCALED_WEIGHT) break;
            const ratio = remaining / mw;
            mw = remaining;
            cw = cw * ratio;
        }
        capped.push({
            ...lora,
            weight: { model: mw, clip: cw },
        });
        totalModelWeight += mw;
    }

    return capped;
}

// 聚合所有命中 LoRA 的 inject 标签（去重）→ 给 prompt-builder 拼到 positive/negative
export function aggregateLoRATags(loras) {
    const posSet = new Set();
    const negSet = new Set();
    for (const l of loras || []) {
        if (l.injectPositive) {
            l.injectPositive
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .forEach((t) => posSet.add(t));
        }
        if (l.injectNegative) {
            l.injectNegative
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .forEach((t) => negSet.add(t));
        }
    }
    return {
        positive: Array.from(posSet).join(', '),
        negative: Array.from(negSet).join(', '),
    };
}
