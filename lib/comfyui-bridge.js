// Direct ComfyUI POST bridge. Loads a workflow JSON file, replaces
// %prompt%/%negative_prompt%/%width%/%height%/%steps%/%denoise%, randomizes
// seed (or uses provided), POSTs to /prompt, polls /history, returns image URL.
//
// Workflows are file-system files referenced by smart-phone settings.
// We fetch them via fetch('file://...') is blocked in browser, so instead
// we expect ST to have them addressable via HTTP path (we'll let user paste
// the workflow JSON inline in settings as fallback).
//
// Better approach: use ST's `/api/files` if available; otherwise read raw text
// from a path the user pastes. For now expose three paths to settings and let
// fetch try via plain fetch (works if ST's static server includes them).
//
// NOTE: We CANNOT fetch arbitrary g:/ paths from a browser-bound extension.
// So we mirror the workflow JSONs into the extension dir at install time, OR
// we let the user paste workflow content directly.
//
// Strategy adopted: bundle the 3 workflow templates inside the extension as
// JS modules (workflows.js) so we don't need any file fetching. Users can
// override paths in settings if they want different workflows.

import { workflowTemplates } from './workflows.js';

// v0.11.8 所有 6 个 workflow 节点 ID 完全一致（1=ckpt / 7=pos / 8=neg / 9=latent / 10=KSampler），
// 简化为统一常量，避免 NODE_IDS 表条目和 workflowTemplates 不一致漏修。
const STD_NODE_IDS = { positive: '7', negative: '8', latent: '9', sampler: '10' };
const NODE_IDS = {
    asian_realism:      STD_NODE_IDS,
    wai_anihentai:      STD_NODE_IDS,
    unholy_desire:      STD_NODE_IDS,
    diving_illustrious: STD_NODE_IDS,
    nova_asian_il:      STD_NODE_IDS,
    lustify_v8:         STD_NODE_IDS,
};

export class ComfyUIBridge {
    constructor({ baseUrl = 'http://127.0.0.1:8188' } = {}) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.clientId = `smart-imgen-${Math.random().toString(36).slice(2, 10)}`;
    }

    async generate({ model = 'pony', positive, negative, width, height, steps = 30, cfg, sampler, scheduler, seed = null, denoise = 1.0, pathContext = null, lorasApplied = [] }) {
        const tpl = workflowTemplates[model];
        if (!tpl) throw new Error(`Unknown model: ${model}`);
        const wf = JSON.parse(JSON.stringify(tpl));

        const ids = NODE_IDS[model] || STD_NODE_IDS;
        wf[ids.positive].inputs.text = positive;
        wf[ids.negative].inputs.text = negative;
        wf[ids.latent].inputs.width = width;
        wf[ids.latent].inputs.height = height;
        wf[ids.sampler].inputs.steps = steps;
        wf[ids.sampler].inputs.denoise = denoise;
        if (cfg !== undefined) wf[ids.sampler].inputs.cfg = cfg;
        if (sampler) wf[ids.sampler].inputs.sampler_name = sampler;
        if (scheduler) wf[ids.sampler].inputs.scheduler = scheduler;
        wf[ids.sampler].inputs.seed = seed ?? randomSeed();

        // v0.11.19 触发式 LoRA 注入 — 在 deep-cloned wf 上插 LoraLoader 节点链 + 重连 downstream
        if (Array.isArray(lorasApplied) && lorasApplied.length > 0) {
            injectLoraChain(wf, lorasApplied);
        }

        // v0.11.13 FaceDetailer (node 31) 必须独立随机种子。
        // workflowTemplates 里写死 seed=12345 → 每次都用同一噪声重绘脸 →
        // 实测 illustAsianCoser/lustify 写实模型脸全部收敛同一张。
        // 用主 seed 派生（异或偏移），保持单次出图的 face/body 关联但跨次随机。
        if (wf['31'] && wf['31'].inputs) {
            wf['31'].inputs.seed = (wf[ids.sampler].inputs.seed ^ 0x5a5a5a5a) >>> 0;
        }

        // v0.11.16 本地存储组织 — patch SaveImage 节点 (id=12) 的 filename_prefix，
        // 让 ComfyUI 把图保存到 `worldbookName/characterName/category/原前缀` 子目录，
        // 而不是平铺到 ComfyUI/output 根下。ComfyUI SaveImage 支持 / 自动建子目录。
        // pathContext 形如 { worldbookName, characterName, category }，任一可缺省（缺时回退 _misc）。
        if (pathContext && wf['12'] && wf['12'].inputs) {
            const world = sanitizeFsName(pathContext.worldbookName) || '_misc';
            const char = sanitizeFsName(pathContext.characterName) || '_unknown';
            const category = sanitizeFsName(pathContext.category) || 'misc';
            const oldPrefix = wf['12'].inputs.filename_prefix || 'output';
            // 结构：worldbook/character/category/oldPrefix（ComfyUI 会自动 _NNNNN_ 自增编号）
            wf['12'].inputs.filename_prefix = `${world}/${char}/${category}/${oldPrefix}`;
        }

        const promptId = await this.queue(wf);
        const result = await this.waitFor(promptId);
        const out = pickOutputImage(result);
        if (!out) throw new Error('ComfyUI returned no image');

        return {
            imageUrl: this.viewUrl(out),
            seed: wf[ids.sampler].inputs.seed,
        };
    }

    async queue(wf) {
        const resp = await fetch(`${this.baseUrl}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: wf, client_id: this.clientId }),
        });
        if (!resp.ok) throw new Error(`ComfyUI /prompt ${resp.status}: ${await resp.text()}`);
        const data = await resp.json();
        if (!data.prompt_id) throw new Error('ComfyUI did not return prompt_id');
        return data.prompt_id;
    }

    async waitFor(promptId, { intervalMs = 1500, timeoutMs = 180_000 } = {}) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const resp = await fetch(`${this.baseUrl}/history/${promptId}`);
            if (resp.ok) {
                const data = await resp.json();
                const entry = data[promptId];
                if (entry?.status?.completed) return entry;
                if (entry?.status?.status_str === 'error') {
                    throw new Error('ComfyUI generation error: ' + JSON.stringify(entry.status));
                }
            }
            await sleep(intervalMs);
        }
        throw new Error('ComfyUI generation timed out');
    }

    viewUrl({ filename, subfolder = '', type = 'output' }) {
        const params = new URLSearchParams({ filename, subfolder, type });
        return `${this.baseUrl}/view?${params.toString()}`;
    }
}

function pickOutputImage(historyEntry) {
    const outputs = historyEntry.outputs || {};
    for (const nodeOut of Object.values(outputs)) {
        if (Array.isArray(nodeOut.images) && nodeOut.images.length) {
            return nodeOut.images[nodeOut.images.length - 1];
        }
    }
    return null;
}

function randomSeed() {
    // ComfyUI seed is uint64; JS safely handles up to 2^53
    return Math.floor(Math.random() * 0xfffffffff);
}

function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

// v0.11.16 文件系统安全的目录/文件名清洗
// - 删除 Windows / Linux / Termux 都禁止的字符
// - trim 空格，避免末尾 . 或空格（Windows 拒）
// - 中文/日文/韩文等 Unicode 保留
// - 长度 cap 80（避免某些 FS 单段长度上限 255 但留余地给 prefix）
function sanitizeFsName(s) {
    if (!s) return '';
    let out = String(s)
        // Windows / Linux 通用禁字符 + 控制字符
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        // 中文 "/" 和制表符
        .replace(/[／｜＼？＊：＜＞"]/g, '')
        // 折叠多空格 + trim
        .replace(/\s+/g, ' ')
        .trim()
        // Windows 禁末尾 . 或空格
        .replace(/[. ]+$/, '');
    if (out.length > 80) out = out.slice(0, 80);
    // 全空 / 保留名兜底
    const RESERVED = new Set(['CON','PRN','AUX','NUL','COM1','COM2','LPT1','LPT2','.','..']);
    if (!out || RESERVED.has(out.toUpperCase())) return '';
    return out;
}

// ─────────────────────────────────────────────────────────────────────────
// v0.11.19 LoRA 注入器 — 把 N (1-3) 个 LoraLoader 节点串联插到工作流里
//
// 两种插入模式：
//   ① 节点 5 存在且是 LoraLoader（5 个 DMD2 工作流：wai/asian_realism/diving/nova/lustify）
//      → 链在节点 5 之后；rewire 7.clip / 8.clip / 10.model / 31.model / 31.clip
//   ② 无节点 5（unholy_desire — 无 DMD2 LoRA，有节点 6 ApplyFBCacheOnModel）
//      → 链在节点 1 之后；rewire 6.model / 7.clip / 8.clip / 31.clip
//      （31.model 保持 [6,0]：FBCache 包装的是新 LoRA 链尾的输出）
//
// 节点 ID 51 / 52 / 53（最大 3 个）；原 workflow 最大 ID 31，不冲突。
// ─────────────────────────────────────────────────────────────────────────
function injectLoraChain(wf, loras) {
    const hasNode5LoRA = wf['5'] && wf['5'].class_type === 'LoraLoader';
    let modelRef = hasNode5LoRA ? ['5', 0] : ['1', 0];
    let clipRef = hasNode5LoRA ? ['5', 1] : ['1', 1];

    let lastNodeId = null;
    for (let i = 0; i < loras.length; i++) {
        const lora = loras[i];
        const nodeId = String(51 + i); // 51 / 52 / 53
        wf[nodeId] = {
            inputs: {
                model: modelRef,
                clip: clipRef,
                lora_name: lora.file,
                strength_model: lora.weight.model,
                strength_clip: lora.weight.clip,
            },
            class_type: 'LoraLoader',
        };
        modelRef = [nodeId, 0];
        clipRef = [nodeId, 1];
        lastNodeId = nodeId;
    }

    // 重连 downstream
    // 通用 DMD2 recipe（5 个工作流共用）：7/8 clip、10 model、31 model+clip 全 rewire
    // unholy_desire recipe：6.model（FBCache 输入）、7/8 clip、31 clip rewire；31.model 不动
    const recipe = hasNode5LoRA
        ? [
            ['7', 'clip'],
            ['8', 'clip'],
            ['10', 'model'],
            ['31', 'model'],
            ['31', 'clip'],
        ]
        : [
            ['6', 'model'],
            ['7', 'clip'],
            ['8', 'clip'],
            ['31', 'clip'],
        ];

    for (const [nodeId, field] of recipe) {
        if (!wf[nodeId] || !wf[nodeId].inputs) continue;
        wf[nodeId].inputs[field] = (field === 'model') ? [lastNodeId, 0] : [lastNodeId, 1];
    }
}
