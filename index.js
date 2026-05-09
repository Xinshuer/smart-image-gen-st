// smart-image-gen: NSFW-aware image generation extension for SillyTavern.
//
// Public API exposed on window.smartImageGen:
//   - generateFromPicTag(picTag, { contacts, hint })   -> imageUrl
//   - generateReferenceImage({ characterName, anchorPrompt, existingSeed }) -> {imageUrl, seed}
//
// Behavior:
//   - Listens to MESSAGE_RECEIVED, finds <pic prompt="..."> tags in AI replies
//   - Looks at LAST USER MESSAGE for SFW/NSFW intent (this is the user's
//     pain point: "给我看看你的小穴" must add pussy/spread/close-up tags)
//   - Resolves character from contacts (smart-phone exposes window.smartPhone.getContacts)
//   - Routes to ComfyUI via direct POST with bundled workflow templates
//   - Replaces or attaches generated image to the message

import { extension_settings, getContext } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced, updateMessageBlock } from '../../../../script.js';

import { classifyMessage, isNSFW } from './lib/nsfw-classifier.js';
import { buildPrompt, buildReferencePrompt, buildReferencePromptFull, buildGroupPrompt, extractCoreAppearance, detectStrangerKind, extractStrangerCore } from './lib/prompt-builder.js';
import { resolveContact, getAnchorBundle } from './lib/character-anchor.js';
import { ComfyUIBridge } from './lib/comfyui-bridge.js';

const EXT = 'smart-image-gen';

const defaults = {
    enabled: true,
    backend: 'comfyui',
    comfyuiUrl: 'http://127.0.0.1:8188',
    fallbackModel: 'pony',
    forceNsfwForExplicit: true,
    insertMode: 'replace', // replace | inline | new
};

$(function () {
    if (!extension_settings[EXT]) extension_settings[EXT] = structuredClone(defaults);
    for (const k of Object.keys(defaults)) {
        if (extension_settings[EXT][k] === undefined) extension_settings[EXT][k] = defaults[k];
    }

    injectMenuButton();
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);

    console.log(`[${EXT}] loaded`);
});

function injectMenuButton() {
    if ($('#smart-image-gen-menu-btn').length) return;
    $('#extensionsMenu').append(`
        <div id="smart-image-gen-menu-btn" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-images"></div>
            <span>Smart Image Gen</span>
        </div>
    `);
    $('#smart-image-gen-menu-btn').on('click', () => {
        const s = extension_settings[EXT];
        s.enabled = !s.enabled;
        saveSettingsDebounced();
        toastr.info(`Smart Image Gen ${s.enabled ? '已启用' : '已禁用'}`);
    });
}

// ────────────────────────────────────────────────────────────────────
// Auto-process AI replies
// ────────────────────────────────────────────────────────────────────

const PIC_RE = /<pic[^>]*\sprompt="([^"]*)"[^>]*>/g;

async function onMessageReceived() {
    const s = extension_settings[EXT];
    if (!s.enabled) return;

    const ctx = getContext();
    const idx = ctx.chat.length - 1;
    const msg = ctx.chat[idx];
    if (!msg || msg.is_user) return;

    // If smart-phone is active and the message contains a PHONE block, let smart-phone
    // handle all rendering — skip ST bubble image generation entirely.
    if (window.smartPhone && /<PHONE>/i.test(msg.mes || '')) return;

    const mesOutsidePhone = (msg.mes || '').replace(/<PHONE>[\s\S]*?<\/PHONE>/gi, '');
    const picMatches = [...mesOutsidePhone.matchAll(PIC_RE)];
    if (!picMatches.length) return;

    // v0.8.3: scan recent 3 user messages instead of just last one — covers compound NSFW scenes
    // where character count / scene / fluids hints span across multiple turns.
    const userText = getRecentUserContext(ctx.chat, 3);
    const intent = classifyMessage(userText);

    if (intent.level === 'explicit') {
        toastr.info(`检测到 NSFW 意图：${intent.tags.slice(0, 3).join(', ')}`);
    }

    const contacts = window.smartPhone?.getContacts?.() || [];
    const model = window.smartPhone?.getCurrentModel?.() || s.fallbackModel;
    const baseUrl = window.smartPhone?.getComfyuiUrl?.() || s.comfyuiUrl;
    const bridge = new ComfyUIBridge({ baseUrl });

    for (const m of picMatches) {
        const aiPrompt = m[1] || '';
        const tag = m[0];

        try {
            const contact = resolveContact(tag, contacts, { context: msg.mes });
            const anchor = getAnchorBundle(contact);
            // Use full SD anchor whenever locked + has sdPrompt (NSFW path included).
        // Safety relies on Fix 4 — sdPrompt template no longer carries scene/composition/style
        // tokens, so NSFW intent tags (nude, spread legs, etc.) won't conflict with the base.
        const useFullAnchor = anchor.locked && !!anchor.sdPrompt;

            const built = buildPrompt({
                aiPrompt,
                characterAnchor: anchor.prompt,
                // SFW + locked → full SD prompt (max reference fidelity)
                // NSFW + locked → appearance-only anchor (avoid clothing/composition conflicts)
                characterFullPrompt: useFullAnchor ? anchor.sdPrompt : '',
                intent,
                model,
            });

            const { imageUrl } = await bridge.generate({
                model,
                positive: built.positive,
                negative: built.negative,
                width: built.width,
                height: built.height,
                steps: built.steps,
                cfg: built.cfg,
                sampler: built.sampler,
                scheduler: built.scheduler,
                seed: anchor.locked ? anchor.seed : null,
                denoise: 1.0,
            });

            // Replace tag with <img>
            const newImgTag = `<img src="${imageUrl}" class="smart-imgen-result" data-prompt="${escapeAttr(aiPrompt)}" data-intent="${intent.level}">`;
            msg.mes = msg.mes.replace(tag, newImgTag);
        } catch (err) {
            console.error(`[${EXT}] generation failed:`, err);
            toastr.error(`生图失败: ${err.message || err}`);
            // Replace with error placeholder so the broken tag doesn't keep retrying
            msg.mes = msg.mes.replace(tag, `<span class="smart-imgen-error">[生图失败: ${escapeAttr(err.message || String(err))}]</span>`);
        }
    }

    updateMessageBlock(idx, msg);
    eventSource.emit(event_types.MESSAGE_UPDATED, idx);
    await ctx.saveChat();
}

function findLastUserMessage(chat) {
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user) return chat[i];
    }
    return null;
}

// v0.8.3: 取最近 n 条用户消息拼起来，用于 NSFW 复合场景识别。
// 复杂 NSFW 场景常跨多条 user msg："让妈妈姐姐一起来"在第 1 条，"开始吧"在第 3 条 ——
// 单消息扫不到 2girls 维度，多消息上下文能补救。
function getRecentUserContext(chat, n = 3) {
    if (!Array.isArray(chat)) return '';
    const collected = [];
    for (let i = chat.length - 1; i >= 0 && collected.length < n; i--) {
        if (chat[i].is_user) collected.push(chat[i].mes || '');
    }
    return collected.reverse().join('\n');
}

function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ────────────────────────────────────────────────────────────────────
// Public API for smart-phone
// ────────────────────────────────────────────────────────────────────

window.smartImageGen = {
    /** Called by smart-phone for in-bubble image slots */
    async generateFromPicTag(picTag, { contacts = [], hint = {} } = {}) {
        const m = picTag.match(/<pic[^>]*\sprompt="([^"]*)"/);
        if (!m) throw new Error('Invalid pic tag');
        const aiPrompt = m[1];

        const ctx = getContext();
        // v0.8.3: 多消息上下文识别（最近 3 条用户消息）
        const userText = getRecentUserContext(ctx.chat, 3);
        const postText = hint.context || '';
        const userIntent = classifyMessage(userText);
        const postIntent = postText ? classifyMessage(postText) : { level: 'sfw', tags: [] };
        const LEVELS = ['sfw', 'suggestive', 'explicit'];
        let intent = {
            level: LEVELS[Math.max(LEVELS.indexOf(userIntent.level), LEVELS.indexOf(postIntent.level))],
            tags: [...new Set([...userIntent.tags, ...postIntent.tags])],
        };

        // ⚠️ TODO: 朋友圈暂时强制 SFW。后续支持 NSFW 朋友圈时，**移除下面这个 if 块即可**。
        // 设计原因：朋友圈是熟人/社交场景，AI 容易在帖子文本里写带性暗示词（"翘臀/暧昧"），
        // 但用户当前不想朋友圈生成 NSFW 图。其它入口（SMS/XHS/论坛）保留 NSFW 能力。
        if (hint.source === 'moments') {
            intent = { level: 'sfw', tags: [] };
        }

        const contact = resolveContact(picTag, contacts, hint);

        // v0.10.0 陌生人路径 — contact==null 且 hint.from 有效时触发
        // 首次出现 → detectStrangerKind + extractStrangerCore + 缓存
        // 再次出现 → 复用 cached core 注入 characterAnchor 路径保持视觉一致
        let strangerCore = '';
        if (!contact && hint.from && window.smartPhone?.getStrangerAnchor) {
            const ctx2 = getContext();
            const chatId2 = ctx2.chatId || 'default';
            const existing = window.smartPhone.getStrangerAnchor(chatId2, hint.from);
            if (existing && existing.core) {
                strangerCore = existing.core;
                window.smartPhone.incrementStrangerAppearCount?.(chatId2, hint.from);
            } else {
                // 首次：识别 kind + 抽取 core + 缓存
                const kind = detectStrangerKind(aiPrompt, hint);
                const core = extractStrangerCore(aiPrompt, kind);
                if (core) {
                    window.smartPhone.saveStrangerAnchor?.(chatId2, hint.from, {
                        kind, core, picTagSource: aiPrompt,
                    });
                    strangerCore = core;
                }
            }
        }

        const anchor = getAnchorBundle(contact);

        const model = window.smartPhone?.getCurrentModel?.() || extension_settings[EXT].fallbackModel;
        const baseUrl = window.smartPhone?.getComfyuiUrl?.() || extension_settings[EXT].comfyuiUrl;
        const bridge = new ComfyUIBridge({ baseUrl });

        // Use full SD anchor whenever locked + has sdPrompt (NSFW path included).
        // Safety relies on Fix 4 — sdPrompt template no longer carries scene/composition/style
        // tokens, so NSFW intent tags (nude, spread legs, etc.) won't conflict with the base.
        const useFullAnchor = anchor.locked && !!anchor.sdPrompt;
        // v0.10.0 陌生人 core 走 characterAnchor 路径（已有加权处理，不双重加权）
        // 无 contact 但有 strangerCore 时用 stranger.core 替代 anchor.prompt
        const effectiveAnchor = anchor.prompt || strangerCore;
        const built = buildPrompt({
            aiPrompt,
            characterAnchor: effectiveAnchor,
            // SFW locked → full SD prompt; NSFW locked → appearance only
            characterFullPrompt: useFullAnchor ? anchor.sdPrompt : '',
            intent,
            model,
        });

        // On reroll: ignore locked seed so user gets a different image. Otherwise reuse anchor.seed for consistency.
        const useLockedSeed = anchor.locked && !hint.reroll;
        const { imageUrl } = await bridge.generate({
            model,
            positive: built.positive,
            negative: built.negative,
            width: built.width,
            height: built.height,
            steps: built.steps,
            cfg: built.cfg,
            sampler: built.sampler,
            scheduler: built.scheduler,
            seed: useLockedSeed ? anchor.seed : null,
            denoise: 1.0,
        });
        return imageUrl;
    },

    /**
     * v0.14.0 多角色合影 API — 群聊模式 ② / ⑤ 用
     * @param picTag 含 prompt="..." 的 pic 标签
     * @param subjects 成员名字数组（已由协议层 SUBJECTS 属性传入）
     * @param contacts 全部联系人（用于解析每人 anchor）
     * @param hint context / source / reroll
     */
    async generateGroupPicTag(picTag, { subjects = [], contacts = [], hint = {} } = {}) {
        const m = picTag.match(/<pic[^>]*\sprompt="([^"]*)"/);
        if (!m) throw new Error('Invalid pic tag');
        const aiPrompt = m[1];

        // 对每个 subject 解析 anchor + 抽核心 5-7 tag
        // 跳过没 anchor 的成员（应在 UI 层已被 disabled，但兜底）
        const memberCoreList = subjects
            .map((name) => {
                // 优先从 contacts 找
                const c = contacts.find(x => x.name === name)
                    || contacts.find(x => x.name && (x.name.includes(name) || name.includes(x.name)));
                if (c) {
                    const sd = c.anchor?.sdPrompt || c.anchor?.prompt || '';
                    const core = extractCoreAppearance(sd);
                    if (core) return { name: c.name, core };
                }
                // v0.10.0 fallback: contact 找不到 → 查 strangerAnchors（合影含临时 NPC）
                if (window.smartPhone?.getStrangerAnchor) {
                    const ctxLocal = getContext();
                    const chatId2 = ctxLocal.chatId || 'default';
                    const sa = window.smartPhone.getStrangerAnchor(chatId2, name);
                    if (sa?.core) return { name, core: sa.core };
                }
                return null;
            })
            .filter(Boolean);

        if (memberCoreList.length === 0) {
            throw new Error('多角色合影：所有成员都没解析到外貌锚点');
        }

        // intent 从最近 user 消息识别（同 generateFromPicTag）
        const ctx = getContext();
        const userText = getRecentUserContext(ctx.chat, 3);
        const userIntent = classifyMessage(userText);
        const postIntent = hint.context ? classifyMessage(hint.context) : { level: 'sfw', tags: [] };
        const LEVELS = ['sfw', 'suggestive', 'explicit'];
        const intent = {
            level: LEVELS[Math.max(LEVELS.indexOf(userIntent.level), LEVELS.indexOf(postIntent.level))],
            tags: [...new Set([...userIntent.tags, ...postIntent.tags])],
        };

        const model = window.smartPhone?.getCurrentModel?.() || extension_settings[EXT].fallbackModel;
        const baseUrl = window.smartPhone?.getComfyuiUrl?.() || extension_settings[EXT].comfyuiUrl;
        const bridge = new ComfyUIBridge({ baseUrl });

        // 性别推测：从所有 member core 里看 1boy/1girl 比例
        // 简化版：默认 all_female (后续可由 anchor 标志位指定)
        const genderHint = 'all_female';

        const built = buildGroupPrompt({
            aiPrompt,
            memberCoreList,
            intent,
            model,
            genderHint,
        });

        // 多角色不锁 seed（每次都重生成）
        const { imageUrl } = await bridge.generate({
            model,
            positive: built.positive,
            negative: built.negative,
            width: built.width,
            height: built.height,
            steps: built.steps,
            cfg: built.cfg,
            sampler: built.sampler,
            scheduler: built.scheduler,
            seed: null,
            denoise: 1.0,
        });
        return imageUrl;
    },

    /** Called by smart-phone settings to make a per-character reference image */
    async generateReferenceImage({ characterName, anchorPrompt, anchorSdPrompt = '', existingSeed = null }) {
        const model = window.smartPhone?.getCurrentModel?.() || extension_settings[EXT].fallbackModel;
        const baseUrl = window.smartPhone?.getComfyuiUrl?.() || extension_settings[EXT].comfyuiUrl;
        const bridge = new ComfyUIBridge({ baseUrl });

        // If a full SD prompt was generated by ✨ AI, use it directly (skip prefix assembly)
        // Otherwise fall back to building from appearance tags
        const built = anchorSdPrompt
            ? buildReferencePromptFull({ sdPrompt: anchorSdPrompt, model })
            : buildReferencePrompt({ characterAnchor: anchorPrompt, model });

        const { imageUrl, seed } = await bridge.generate({
            model,
            positive: built.positive,
            negative: built.negative,
            width: built.width,
            height: built.height,
            steps: built.steps,
            cfg: built.cfg,
            sampler: built.sampler,
            scheduler: built.scheduler,
            seed: existingSeed,
            denoise: 1.0,
        });
        return { imageUrl, seed };
    },

    classifyIntent: classifyMessage,
};
