// Bundled ComfyUI workflow templates (inlined so the extension doesn't
// need filesystem access). Mirrored from g:/本地部署/*.txt — keep in sync.
//
// Placeholders (%prompt%, %negative_prompt%, %width%, %height%, %steps%, %denoise%)
// are overwritten programmatically by ComfyUIBridge.generate.
//
// v0.8.0 大瘦身：删 pony / noobai / noobai_easyneg / noobai_miaomiao / majicmix /
//                wai_illustrious 6 个旧模型，只保留两个：
//                - asian_realism — 亚洲写实 PONY-XL（OL/职场/写实角色）
//                - wai_anihentai — waiANIHENTAIPONYXL_v60，PONY-XL 调教 anime hentai 模型
//                  替换 wai_illustrious 作为 anime 默认模型，无 ecchi 校服 prior、
//                  无气球胸畸形、NSFW 能力完整、cup 字母也不出 pasties。

export const workflowTemplates = {
    // waiANIHENTAIPONYXL v60 — PONY-XL 派生 anime hentai 模型。
    // 作者推荐: Steps 30, CFG 7, Sampler Euler a。
    // v0.11.4: scheduler normal → karras（v2 文档说 "DPM++ 2M Karras OR Euler a"，karras 更平滑；
    //          v6 文档没明指但参照 v2 历史推荐）。
    // Trigger 词: score_9, score_8_up, score_7_up, source_anime + rating_safe/explicit (在 buildPrompt 中按 SFW/NSFW 注入)。
    // 实测 SFW + 巨胸 + 校服: 不出胸贴 (vs WAI Illustrious 50% 触发率)。
    // 实测 NSFW: rating_explicit + nude tags 直接出干净全裸，无打码。
    // 实测 M-cup (gigantic breasts:1.5): 无气球胸畸形，自然下垂大胸。
    wai_anihentai: {
        "1": { "inputs": { "ckpt_name": "waiANIHENTAIPONYXL_v60.safetensors", "clip_skip": "2" }, "class_type": "CheckpointLoaderSimple" },
        "6": { "inputs": { "model": ["1", 0], "object_to_patch": "diffusion_model", "residual_diff_threshold": 0.15, "start": 0.2, "end": 0.8, "max_consecutive_cache_hits": 5 }, "class_type": "ApplyFBCacheOnModel" },
        "7": { "inputs": { "clip": ["1", 1], "text": "%prompt%" }, "class_type": "CLIPTextEncode" },
        "8": { "inputs": { "clip": ["1", 1], "text": "%negative_prompt%" }, "class_type": "CLIPTextEncode" },
        "9": { "inputs": { "width": 832, "height": 1216, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
        "10": { "inputs": { "model": ["6", 0], "positive": ["7", 0], "negative": ["8", 0], "latent_image": ["9", 0], "seed": 0, "steps": 30, "cfg": 7.0, "sampler_name": "euler_ancestral", "scheduler": "karras", "denoise": 1.0 }, "class_type": "KSampler" },
        "11": { "inputs": { "samples": ["10", 0], "vae": ["1", 2] }, "class_type": "VAEDecode" },
        "30": { "inputs": { "model_name": "bbox/face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider" },
        "31": { "inputs": { "image": ["11", 0], "model": ["6", 0], "clip": ["1", 1], "vae": ["1", 2], "guide_size": 512.0, "guide_size_for": true, "max_size": 1024.0, "seed": 12345, "steps": 20, "cfg": 7.0, "sampler_name": "euler_ancestral", "scheduler": "karras", "positive": ["7", 0], "negative": ["8", 0], "denoise": 0.45, "feather": 5, "noise_mask": true, "force_inpaint": true, "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3.0, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "bbox_detector": ["30", 0], "wildcard": "", "cycle": 1 }, "class_type": "FaceDetailer" },
        "27": { "inputs": { "model_name": "RealESRGAN_x2plus.pth" }, "class_type": "UpscaleModelLoader" },
        "28": { "inputs": { "upscale_model": ["27", 0], "image": ["31", 0] }, "class_type": "ImageUpscaleWithModel" },
        "12": { "inputs": { "images": ["28", 0], "filename_prefix": "WaiAniHentai_2K" }, "class_type": "SaveImage" }
    },

    // unholyDesireMixSinister v80 — anime hentai 模型（Illustrious 派生）。
    // 作者推荐: 16+ steps, CFG 2.5+, 8-10 steps + DPM++ 2M Karras + CFG 2.5 也可（速度快）。
    // 这里走标准 16 steps + DPM++ 2M Karras + CFG 2.5（速度+质量平衡）。
    // PREFIX: unholy-aesthetic + masterpiece 系。NEGATIVE: 作者推荐 anti-deformity 大段。
    unholy_desire: {
        "1": { "inputs": { "ckpt_name": "unholyDesireMixSinister_v80.safetensors", "clip_skip": "2" }, "class_type": "CheckpointLoaderSimple" },
        "6": { "inputs": { "model": ["1", 0], "object_to_patch": "diffusion_model", "residual_diff_threshold": 0.15, "start": 0.2, "end": 0.8, "max_consecutive_cache_hits": 5 }, "class_type": "ApplyFBCacheOnModel" },
        "7": { "inputs": { "clip": ["1", 1], "text": "%prompt%" }, "class_type": "CLIPTextEncode" },
        "8": { "inputs": { "clip": ["1", 1], "text": "%negative_prompt%" }, "class_type": "CLIPTextEncode" },
        "9": { "inputs": { "width": 832, "height": 1216, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
        "10": { "inputs": { "model": ["6", 0], "positive": ["7", 0], "negative": ["8", 0], "latent_image": ["9", 0], "seed": 0, "steps": 16, "cfg": 2.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0 }, "class_type": "KSampler" },
        "11": { "inputs": { "samples": ["10", 0], "vae": ["1", 2] }, "class_type": "VAEDecode" },
        "30": { "inputs": { "model_name": "bbox/face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider" },
        "31": { "inputs": { "image": ["11", 0], "model": ["6", 0], "clip": ["1", 1], "vae": ["1", 2], "guide_size": 512.0, "guide_size_for": true, "max_size": 1024.0, "seed": 12345, "steps": 16, "cfg": 2.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "positive": ["7", 0], "negative": ["8", 0], "denoise": 0.45, "feather": 5, "noise_mask": true, "force_inpaint": true, "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3.0, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "bbox_detector": ["30", 0], "wildcard": "", "cycle": 1 }, "class_type": "FaceDetailer" },
        "27": { "inputs": { "model_name": "RealESRGAN_x2plus.pth" }, "class_type": "UpscaleModelLoader" },
        "28": { "inputs": { "upscale_model": ["27", 0], "image": ["31", 0] }, "class_type": "ImageUpscaleWithModel" },
        "12": { "inputs": { "images": ["28", 0], "filename_prefix": "UnholyDesire_2K" }, "class_type": "SaveImage" }
    },

    // divingIllustriousFlat v70VAE — flat 风格 anime 模型（Illustrious 派生，自带 VAE）。
    // 作者推荐: 896×1152 / 25 steps / CFG 4-7 / Euler a+karras / face_yolov8n.pt ADetailer。
    // 这里走 CFG 5 (中位) + euler_ancestral+karras。
    // PREFIX: (anime coloring, anime screencap:1.5) 推 flat 风格。
    diving_illustrious: {
        "1": { "inputs": { "ckpt_name": "divingIllustriousFlat_v70VAE.safetensors", "clip_skip": "2" }, "class_type": "CheckpointLoaderSimple" },
        "6": { "inputs": { "model": ["1", 0], "object_to_patch": "diffusion_model", "residual_diff_threshold": 0.15, "start": 0.2, "end": 0.8, "max_consecutive_cache_hits": 5 }, "class_type": "ApplyFBCacheOnModel" },
        "7": { "inputs": { "clip": ["1", 1], "text": "%prompt%" }, "class_type": "CLIPTextEncode" },
        "8": { "inputs": { "clip": ["1", 1], "text": "%negative_prompt%" }, "class_type": "CLIPTextEncode" },
        "9": { "inputs": { "width": 896, "height": 1152, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
        "10": { "inputs": { "model": ["6", 0], "positive": ["7", 0], "negative": ["8", 0], "latent_image": ["9", 0], "seed": 0, "steps": 25, "cfg": 5.0, "sampler_name": "euler_ancestral", "scheduler": "karras", "denoise": 1.0 }, "class_type": "KSampler" },
        "11": { "inputs": { "samples": ["10", 0], "vae": ["1", 2] }, "class_type": "VAEDecode" },
        "30": { "inputs": { "model_name": "bbox/face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider" },
        "31": { "inputs": { "image": ["11", 0], "model": ["6", 0], "clip": ["1", 1], "vae": ["1", 2], "guide_size": 512.0, "guide_size_for": true, "max_size": 1024.0, "seed": 12345, "steps": 20, "cfg": 5.0, "sampler_name": "euler_ancestral", "scheduler": "karras", "positive": ["7", 0], "negative": ["8", 0], "denoise": 0.45, "feather": 5, "noise_mask": true, "force_inpaint": true, "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3.0, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "bbox_detector": ["30", 0], "wildcard": "", "cycle": 1 }, "class_type": "FaceDetailer" },
        "27": { "inputs": { "model_name": "RealESRGAN_x2plus.pth" }, "class_type": "UpscaleModelLoader" },
        "28": { "inputs": { "upscale_model": ["27", 0], "image": ["31", 0] }, "class_type": "ImageUpscaleWithModel" },
        "12": { "inputs": { "images": ["28", 0], "filename_prefix": "DivingFlat_2K" }, "class_type": "SaveImage" }
    },

    // LUSTIFY! v8 Apex (lustifySDXLNSFW_apexV8) — 写实 NSFW 旗舰 (May 2026)
    // 作者明确警告：NOT Pony-based / NOT Illustrious-based —— 不要用 score_X / source_X tag。
    // 作者警告：shizoprompting (一堆加权暗示词堆叠) does more harm than good。
    // 双模式输入：同时支持 booru tag + 自然语言。
    // 作者推荐: DPM++ 2M SDE / 3M SDE + Exponential/Karras + 30 steps + CFG 2.5-4.5。
    // 原生 1536px 支持 (本工作流用 1024×1536 portrait, ESRGAN x2 后 = 2048×3072)。
    // 高视觉影响 tag (作者列举):
    //   - 摄影风格: analog photo / glamour photography / candid photo / amateur photo
    //   - 光照: cinematic lighting / soft lighting / dramatic lighting / warm golden hour lighting
    //   - 胶片: Ilford HP5 Plus / Fujicolor Pro / film grain
    //   - 摄影师: Alessio Albi / Martin Schoeller / Miles Aldridge / Tim Walker
    lustify_v8: {
        "1": { "inputs": { "ckpt_name": "lustifySDXLNSFW_apexV8.safetensors", "clip_skip": "2" }, "class_type": "CheckpointLoaderSimple" },
        "6": { "inputs": { "model": ["1", 0], "object_to_patch": "diffusion_model", "residual_diff_threshold": 0.15, "start": 0.2, "end": 0.8, "max_consecutive_cache_hits": 5 }, "class_type": "ApplyFBCacheOnModel" },
        "7": { "inputs": { "clip": ["1", 1], "text": "%prompt%" }, "class_type": "CLIPTextEncode" },
        "8": { "inputs": { "clip": ["1", 1], "text": "%negative_prompt%" }, "class_type": "CLIPTextEncode" },
        "9": { "inputs": { "width": 1024, "height": 1536, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
        "10": { "inputs": { "model": ["6", 0], "positive": ["7", 0], "negative": ["8", 0], "latent_image": ["9", 0], "seed": 0, "steps": 30, "cfg": 3.5, "sampler_name": "dpmpp_2m_sde", "scheduler": "karras", "denoise": 1.0 }, "class_type": "KSampler" },
        "11": { "inputs": { "samples": ["10", 0], "vae": ["1", 2] }, "class_type": "VAEDecode" },
        "30": { "inputs": { "model_name": "bbox/face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider" },
        "31": { "inputs": { "image": ["11", 0], "model": ["6", 0], "clip": ["1", 1], "vae": ["1", 2], "guide_size": 512.0, "guide_size_for": true, "max_size": 1024.0, "seed": 12345, "steps": 30, "cfg": 3.5, "sampler_name": "dpmpp_2m_sde", "scheduler": "karras", "positive": ["7", 0], "negative": ["8", 0], "denoise": 0.4, "feather": 5, "noise_mask": true, "force_inpaint": true, "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3.0, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "bbox_detector": ["30", 0], "wildcard": "", "cycle": 1 }, "class_type": "FaceDetailer" },
        "27": { "inputs": { "model_name": "RealESRGAN_x2plus.pth" }, "class_type": "UpscaleModelLoader" },
        "28": { "inputs": { "upscale_model": ["27", 0], "image": ["31", 0] }, "class_type": "ImageUpscaleWithModel" },
        "12": { "inputs": { "images": ["28", 0], "filename_prefix": "Lustify_Apex_v8_3K" }, "class_type": "SaveImage" }
    },

    // Nova Asian XL Illustrious v5.0 (novaExanimeXL_ilV50) — 亚洲写实 Illustrious 派生 (May 2026)
    // v0.11.5 重大修复（实测验证）：
    //   1. clip_skip "2" → "1" —— **核心修复**：clip_skip=2 在此模型导致 latent 漂移，
    //      输出强烈绿黄色偏；改成 1 后色偏完全消失。作者文档"Clip Skip: 1-2"两个都允许，但**必须用 1**。
    //   2. 删除 FBCache —— 该模型对 FBCache 缓存敏感，叠加 clip_skip 错误会加剧色偏。
    //   3. 加 hires fix（latent 1.5x → 2nd KSampler @ denoise 0.7）—— 作者文档说
    //      "Denoising Strength: 0.65-0.8"，那是 hires fix 二次精修参数。模型设计上需要这个二段式
    //      （首段出 anime-ish 草图，hires fix 第二段把皮肤/光影补到写实）。
    //   4. PREFIX 含 BREAK —— 作者 Illustrious 模板用 BREAK 把 quality+content 与 photo-detail 分两段。
    //   5. 删 ESRGAN x2 —— hires fix 已升 1.5x 到 1248×1824，再 ESRGAN 会到 2496×3648 太大。
    nova_asian_il: {
        "1": { "inputs": { "ckpt_name": "novaExanimeXL_ilV50.safetensors", "clip_skip": "1" }, "class_type": "CheckpointLoaderSimple" },
        "7": { "inputs": { "clip": ["1", 1], "text": "%prompt%" }, "class_type": "CLIPTextEncode" },
        "8": { "inputs": { "clip": ["1", 1], "text": "%negative_prompt%" }, "class_type": "CLIPTextEncode" },
        "9": { "inputs": { "width": 832, "height": 1216, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
        // 第一遍 txt2img
        "10": { "inputs": { "model": ["1", 0], "positive": ["7", 0], "negative": ["8", 0], "latent_image": ["9", 0], "seed": 0, "steps": 30, "cfg": 4.0, "sampler_name": "euler_ancestral", "scheduler": "karras", "denoise": 1.0 }, "class_type": "KSampler" },
        // Hires fix: latent 1.5x 上采样
        "20": { "inputs": { "samples": ["10", 0], "upscale_method": "nearest-exact", "scale_by": 1.5 }, "class_type": "LatentUpscaleBy" },
        // 第二遍 hires fix（denoise 0.7 添加写实细节）
        "21": { "inputs": { "model": ["1", 0], "positive": ["7", 0], "negative": ["8", 0], "latent_image": ["20", 0], "seed": 1, "steps": 20, "cfg": 4.0, "sampler_name": "euler_ancestral", "scheduler": "karras", "denoise": 0.7 }, "class_type": "KSampler" },
        "11": { "inputs": { "samples": ["21", 0], "vae": ["1", 2] }, "class_type": "VAEDecode" },
        "30": { "inputs": { "model_name": "bbox/face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider" },
        "31": { "inputs": { "image": ["11", 0], "model": ["1", 0], "clip": ["1", 1], "vae": ["1", 2], "guide_size": 512.0, "guide_size_for": true, "max_size": 1024.0, "seed": 12345, "steps": 25, "cfg": 4.0, "sampler_name": "euler_ancestral", "scheduler": "karras", "positive": ["7", 0], "negative": ["8", 0], "denoise": 0.45, "feather": 5, "noise_mask": true, "force_inpaint": true, "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3.0, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "bbox_detector": ["30", 0], "wildcard": "", "cycle": 1 }, "class_type": "FaceDetailer" },
        "12": { "inputs": { "images": ["31", 0], "filename_prefix": "NovaAsian_IL_v5_hires" }, "class_type": "SaveImage" }
    },

    // illustAsianCoser v3 — 写实模型（替换 asian_realism 作为新写实默认）。
    // 作者推荐: dpmpp_sde + beta scheduler + 30 steps + ≥832x1216 + ADetailer。
    // 实测 5 角对比 asian_realism：身型审美完美命中"健身网红+腰细臀大腿粗腿长"，
    // 巨胸自然下垂无气球，0/10 出现赘肉。
    // 注意：模型训练集是 cosplay 棚拍，自带蓝/绿/紫胶片灯 prior，必须在 prompt 加 anti-color-tint
    // 暗示词把模型拉回自然光（在 prompt-builder 处理）。
    asian_realism: {
        "1": { "inputs": { "ckpt_name": "illustAsianCoser_v3.safetensors", "clip_skip": "2" }, "class_type": "CheckpointLoaderSimple" },
        "6": { "inputs": { "model": ["1", 0], "object_to_patch": "diffusion_model", "residual_diff_threshold": 0.15, "start": 0.2, "end": 0.8, "max_consecutive_cache_hits": 5 }, "class_type": "ApplyFBCacheOnModel" },
        "7": { "inputs": { "clip": ["1", 1], "text": "%prompt%" }, "class_type": "CLIPTextEncode" },
        "8": { "inputs": { "clip": ["1", 1], "text": "%negative_prompt%" }, "class_type": "CLIPTextEncode" },
        "9": { "inputs": { "width": 832, "height": 1216, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
        "10": { "inputs": { "model": ["6", 0], "positive": ["7", 0], "negative": ["8", 0], "latent_image": ["9", 0], "seed": 0, "steps": 30, "cfg": 6.5, "sampler_name": "dpmpp_sde", "scheduler": "beta", "denoise": 1.0 }, "class_type": "KSampler" },
        "11": { "inputs": { "samples": ["10", 0], "vae": ["1", 2] }, "class_type": "VAEDecode" },
        "30": { "inputs": { "model_name": "bbox/face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider" },
        "31": { "inputs": { "image": ["11", 0], "model": ["6", 0], "clip": ["1", 1], "vae": ["1", 2], "guide_size": 512.0, "guide_size_for": true, "max_size": 1024.0, "seed": 12345, "steps": 20, "cfg": 6.5, "sampler_name": "dpmpp_sde", "scheduler": "beta", "positive": ["7", 0], "negative": ["8", 0], "denoise": 0.45, "feather": 5, "noise_mask": true, "force_inpaint": true, "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3.0, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "bbox_detector": ["30", 0], "wildcard": "", "cycle": 1 }, "class_type": "FaceDetailer" },
        "27": { "inputs": { "model_name": "RealESRGAN_x2plus.pth" }, "class_type": "UpscaleModelLoader" },
        "28": { "inputs": { "upscale_model": ["27", 0], "image": ["31", 0] }, "class_type": "ImageUpscaleWithModel" },
        "12": { "inputs": { "images": ["28", 0], "filename_prefix": "IllustAsianCoser_2K" }, "class_type": "SaveImage" }
    },
};
