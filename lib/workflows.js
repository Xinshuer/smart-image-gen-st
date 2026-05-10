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

    // Nova Asian XL Illustrious v5.0 (novaExanimeXL_ilV50) — v0.11.7 最终归 anime 组。
    // 实测：复杂 NSFW prompt 下 photo 路径色爆，作者 hires fix 模板需要 minimal prompt 才能稳。
    // 决定：作为亚洲脸特化的 Illustrious 动漫模型用，标准动漫工作流。
    // 保留 clip_skip="1" 削弱色偏；保留 FBCache 提速（本来主要色爆是 prompt 复杂度问题，FBCache 是次要）。
    nova_asian_il: {
        "1": { "inputs": { "ckpt_name": "novaExanimeXL_ilV50.safetensors", "clip_skip": "1" }, "class_type": "CheckpointLoaderSimple" },
        "6": { "inputs": { "model": ["1", 0], "object_to_patch": "diffusion_model", "residual_diff_threshold": 0.15, "start": 0.2, "end": 0.8, "max_consecutive_cache_hits": 5 }, "class_type": "ApplyFBCacheOnModel" },
        "7": { "inputs": { "clip": ["1", 1], "text": "%prompt%" }, "class_type": "CLIPTextEncode" },
        "8": { "inputs": { "clip": ["1", 1], "text": "%negative_prompt%" }, "class_type": "CLIPTextEncode" },
        "9": { "inputs": { "width": 832, "height": 1216, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
        "10": { "inputs": { "model": ["6", 0], "positive": ["7", 0], "negative": ["8", 0], "latent_image": ["9", 0], "seed": 0, "steps": 30, "cfg": 4.0, "sampler_name": "euler_ancestral", "scheduler": "karras", "denoise": 1.0 }, "class_type": "KSampler" },
        "11": { "inputs": { "samples": ["10", 0], "vae": ["1", 2] }, "class_type": "VAEDecode" },
        "30": { "inputs": { "model_name": "bbox/face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider" },
        "31": { "inputs": { "image": ["11", 0], "model": ["6", 0], "clip": ["1", 1], "vae": ["1", 2], "guide_size": 512.0, "guide_size_for": true, "max_size": 1024.0, "seed": 12345, "steps": 25, "cfg": 4.0, "sampler_name": "euler_ancestral", "scheduler": "karras", "positive": ["7", 0], "negative": ["8", 0], "denoise": 0.45, "feather": 5, "noise_mask": true, "force_inpaint": true, "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3.0, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "bbox_detector": ["30", 0], "wildcard": "", "cycle": 1 }, "class_type": "FaceDetailer" },
        "27": { "inputs": { "model_name": "RealESRGAN_x2plus.pth" }, "class_type": "UpscaleModelLoader" },
        "28": { "inputs": { "upscale_model": ["27", 0], "image": ["31", 0] }, "class_type": "ImageUpscaleWithModel" },
        "12": { "inputs": { "images": ["28", 0], "filename_prefix": "NovaAsian_IL_v5_2K" }, "class_type": "SaveImage" }
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
