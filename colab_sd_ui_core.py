import os
import random
import time
from datetime import datetime
from typing import List, Tuple

import torch
from diffusers import (
    DiffusionPipeline,
    DPMSolverMultistepScheduler,
    EulerAncestralDiscreteScheduler,
    EulerDiscreteScheduler,
    HeunDiscreteScheduler,
    KDPM2AncestralDiscreteScheduler,
    KDPM2DiscreteScheduler,
    StableDiffusionPipeline,
    StableDiffusionXLPipeline,
)
import gradio as gr
from IPython.display import Javascript, display

CURRENT_PIPELINE = None
CURRENT_MODEL_INFO = {}
CURRENT_LORA_STATE = {"paths": [], "scale": 0.8}

DTYPE_OPTIONS = {
    "float16 (fp16)": torch.float16,
    "bfloat16 (bf16)": torch.bfloat16,
    "float32 (fp32)": torch.float32,
}

SCHEDULER_BUILDERS = {
    "DPM++ SDE Karras": lambda config: DPMSolverMultistepScheduler.from_config(
        config, algorithm_type="sde-dpmsolver++", use_karras_sigmas=True
    ),
    "DPM++ 2M Karras": lambda config: DPMSolverMultistepScheduler.from_config(
        config, algorithm_type="dpmsolver++", use_karras_sigmas=True
    ),
    "Euler a Karras": lambda config: EulerAncestralDiscreteScheduler.from_config(
        config, use_karras_sigmas=True
    ),
    "Euler Karras": lambda config: EulerDiscreteScheduler.from_config(
        config, use_karras_sigmas=True
    ),
    "Heun Karras": lambda config: HeunDiscreteScheduler.from_config(
        config, use_karras_sigmas=True
    ),
    "KDPM2 a Karras": lambda config: KDPM2AncestralDiscreteScheduler.from_config(
        config, use_karras_sigmas=True
    ),
    "KDPM2 Karras": lambda config: KDPM2DiscreteScheduler.from_config(
        config, use_karras_sigmas=True
    ),
}


def play_ready_beep():
    display(
        Javascript(
            """
            (async () => {
                const context = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = context.createOscillator();
                const gain = context.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(880, context.currentTime);
                gain.gain.setValueAtTime(0.0001, context.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);
                oscillator.connect(gain);
                gain.connect(context.destination);
                oscillator.start();
                oscillator.stop(context.currentTime + 0.5);
            })();
            """
        )
    )


def ensure_dir(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def get_device(pipe) -> torch.device:
    if hasattr(pipe, "_execution_device"):
        return pipe._execution_device
    return pipe.device


def to_multiple_of_eight(value: int) -> int:
    value = int(value)
    if value < 8:
        value = 8
    return max(8, (value // 8) * 8)


def parse_lora_paths(raw: str) -> List[str]:
    if not raw:
        return []
    items = []
    for chunk in raw.replace("\r", "\n").split("\n"):
        for part in chunk.split(","):
            cleaned = part.strip()
            if cleaned:
                items.append(cleaned)
    return items


def get_dtype(choice: str):
    dtype = DTYPE_OPTIONS.get(choice)
    if dtype is None:
        raise ValueError(f"未対応のdtypeです: {choice}")
    return dtype


def unload_loras(pipe):
    if pipe is None:
        return
    if hasattr(pipe, "unload_lora_weights"):
        pipe.unload_lora_weights()


def apply_loras(pipe, lora_paths: List[str], scale: float) -> Tuple[List[str], List[str]]:
    if pipe is None:
        return [], []

    unload_loras(pipe)
    loaded = []
    missing = []
    adapter_names = []

    for idx, path in enumerate(lora_paths):
        if not os.path.exists(path):
            missing.append(path)
            continue
        adapter_name = f"lora_{idx}"
        pipe.load_lora_weights(path, adapter_name=adapter_name)
        adapter_names.append(adapter_name)
        loaded.append(path)

    if adapter_names:
        pipe.set_adapters(adapter_names, adapter_weights=[scale] * len(adapter_names))

    CURRENT_LORA_STATE["paths"] = loaded
    CURRENT_LORA_STATE["scale"] = scale
    return loaded, missing


def configure_pipeline_memory(pipe, use_cpu_offload: bool, attn_slicing: bool, vae_slicing: bool, vae_tiling: bool):
    if pipe is None:
        return
    if hasattr(pipe, "disable_xformers_memory_efficient_attention"):
        pipe.disable_xformers_memory_efficient_attention()
    if attn_slicing and hasattr(pipe, "enable_attention_slicing"):
        pipe.enable_attention_slicing()
    elif hasattr(pipe, "disable_attention_slicing"):
        pipe.disable_attention_slicing()

    if vae_slicing and hasattr(pipe, "enable_vae_slicing"):
        pipe.enable_vae_slicing()
    elif hasattr(pipe, "disable_vae_slicing"):
        pipe.disable_vae_slicing()

    if vae_tiling and hasattr(pipe, "enable_vae_tiling"):
        pipe.enable_vae_tiling()
    elif hasattr(pipe, "disable_vae_tiling"):
        pipe.disable_vae_tiling()

    if use_cpu_offload and hasattr(pipe, "enable_model_cpu_offload"):
        pipe.enable_model_cpu_offload()
    else:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        pipe.to(device)


def build_scheduler(pipe, name: str):
    config = pipe.scheduler.config
    builder = SCHEDULER_BUILDERS.get(name)
    if builder is None:
        raise ValueError(f"未対応のスケジューラです: {name}")
    pipe.scheduler = builder(config)


def load_model(
    model_type: str,
    model_path: str,
    dtype_choice: str,
    offload_mode: str,
    attn_slicing: bool,
    vae_slicing: bool,
    vae_tiling: bool,
    lora_paths_text: str,
    lora_scale: float,
):
    global CURRENT_PIPELINE, CURRENT_MODEL_INFO

    model_path = model_path.strip()
    if not model_path:
        return gr.update(value="❌ モデルのパスを入力してください。"), gr.update(value=None)
    if not os.path.exists(model_path):
        return gr.update(value=f"❌ 指定したパスが存在しません: {model_path}"), gr.update(value=None)

    dtype = get_dtype(dtype_choice)

    if model_type == "Diffusersフォルダ":
        pipe = DiffusionPipeline.from_pretrained(model_path, torch_dtype=dtype, safety_checker=None)
    elif model_type == "SD1/2(.ckpt/.safetensors)":
        pipe = StableDiffusionPipeline.from_single_file(model_path, torch_dtype=dtype, safety_checker=None)
    elif model_type == "SDXL(.ckpt/.safetensors)":
        pipe = StableDiffusionXLPipeline.from_single_file(model_path, torch_dtype=dtype, safety_checker=None)
    else:
        return gr.update(value=f"❌ 未対応のモデルタイプです: {model_type}"), gr.update(value=None)

    if hasattr(pipe, "safety_checker"):
        pipe.safety_checker = None
    if hasattr(pipe, "requires_safety_checker"):
        pipe.requires_safety_checker = False

    configure_pipeline_memory(
        pipe,
        use_cpu_offload=offload_mode == "モデルをCPUにオフロード",
        attn_slicing=attn_slicing,
        vae_slicing=vae_slicing,
        vae_tiling=vae_tiling,
    )

    pipe.set_progress_bar_config(disable=False)
    build_scheduler(pipe, "DPM++ SDE Karras")

    lora_paths = parse_lora_paths(lora_paths_text)
    loaded_loras, missing_loras = apply_loras(pipe, lora_paths, lora_scale)

    CURRENT_PIPELINE = pipe
    CURRENT_MODEL_INFO = {
        "model_type": model_type,
        "model_path": model_path,
        "dtype": dtype_choice,
        "offload": offload_mode,
        "attn_slicing": attn_slicing,
        "vae_slicing": vae_slicing,
        "vae_tiling": vae_tiling,
    }

    messages = ["✅ モデルをロードしました。"]
    if loaded_loras:
        messages.append("LoRAを適用: " + "\n".join(f"- {p}" for p in loaded_loras))
    if missing_loras:
        messages.append("⚠️ 見つからないLoRA: " + "\n".join(f"- {p}" for p in missing_loras))

    device = get_device(pipe)
    messages.append(f"使用デバイス: {device}")
    messages.append(f"既定スケジューラ: DPM++ SDE Karras")

    return gr.update(value="\n".join(messages)), gr.update(value=None)


def ensure_pipeline_ready():
    if CURRENT_PIPELINE is None:
        raise RuntimeError("先に設定タブからモデルをロードしてください。")


def maybe_update_loras(lora_paths_text: str, scale: float):
    pipe = CURRENT_PIPELINE
    if pipe is None:
        return [], []
    desired_paths = parse_lora_paths(lora_paths_text)
    if (desired_paths != CURRENT_LORA_STATE.get("paths")) or (scale != CURRENT_LORA_STATE.get("scale")):
        return apply_loras(pipe, desired_paths, scale)
    return CURRENT_LORA_STATE.get("paths", []), []


def generate_images(
    prompt: str,
    negative_prompt: str,
    width: int,
    height: int,
    steps: int,
    guidance: float,
    seed: int,
    num_images: int,
    scheduler_name: str,
    lora_paths_text: str,
    lora_scale: float,
):
    try:
        ensure_pipeline_ready()
    except RuntimeError as exc:
        return [], gr.update(value=f"❌ {exc}")

    pipe = CURRENT_PIPELINE

    try:
        build_scheduler(pipe, scheduler_name)
    except Exception as exc:
        return [], gr.update(value=f"❌ スケジューラ設定エラー: {exc}")

    loaded_loras, missing_loras = maybe_update_loras(lora_paths_text, lora_scale)

    width = to_multiple_of_eight(width)
    height = to_multiple_of_eight(height)
    steps = int(steps)
    guidance = float(guidance)
    num_images = max(1, min(int(num_images), 6))

    if seed is None or int(seed) < 0:
        seeds = [random.randint(0, 2**32 - 1) for _ in range(num_images)]
    else:
        base_seed = int(seed)
        seeds = [base_seed + i for i in range(num_images)]

    device = get_device(pipe)
    generators = [torch.Generator(device=device).manual_seed(s) for s in seeds]

    try:
        with torch.inference_mode():
            output = pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance,
                num_images_per_prompt=num_images,
                generator=generators,
                # extra keyword arguments are intentionally omitted to keep compatibility
            )
    except Exception as exc:
        return [], gr.update(value=f"❌ 生成中にエラーが発生しました: {exc}")

    images = output.images if hasattr(output, "images") else output

    output_dir = ensure_dir("/content/drive/MyDrive/SD/outputs")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    saved_paths = []
    for idx, (img, seed_value) in enumerate(zip(images, seeds), start=1):
        filename = f"{timestamp}_{seed_value}_{idx:02d}.png"
        save_path = os.path.join(output_dir, filename)
        img.save(save_path)
        saved_paths.append(save_path)

    message_lines = [
        f"✅ 生成が完了しました ({len(images)}枚)。",
        f"保存先: {output_dir}",
        f"解像度: {width}x{height}",
        f"シード: {', '.join(str(s) for s in seeds)}",
        f"スケジューラ: {scheduler_name}",
    ]
    if loaded_loras:
        message_lines.append("適用中LoRA: " + ", ".join(os.path.basename(p) for p in loaded_loras))
    if missing_loras:
        message_lines.append("⚠️ 見つからないLoRA: " + ", ".join(missing_loras))

    return images, gr.update(value="\n".join(message_lines))


def build_interface():
    with gr.Blocks(title="Stable Diffusion Colab UI", theme=gr.themes.Soft()) as demo:
        gr.Markdown(
            """
            # Stable Diffusion Colab UI
            Google Drive上のモデル/LoRAを読み込んで画像生成を行います。共有リンクが有効化されると通知音が鳴ります。
            """
        )

        with gr.Tab("設定"):
            with gr.Group():
                model_type = gr.Radio(
                    [
                        "SD1/2(.ckpt/.safetensors)",
                        "SDXL(.ckpt/.safetensors)",
                        "Diffusersフォルダ",
                    ],
                    value="SDXL(.ckpt/.safetensors)",
                    label="モデルタイプ",
                )
                model_path = gr.Textbox(
                    label="Google Drive上のモデルパス",
                    placeholder="例: /content/drive/MyDrive/SD/models/model.safetensors",
                )
                dtype_choice = gr.Dropdown(
                    list(DTYPE_OPTIONS.keys()),
                    value="float16 (fp16)",
                    label="計算dtype",
                )
                offload_mode = gr.Radio(
                    ["GPUで実行 (推奨)", "モデルをCPUにオフロード"],
                    value="GPUで実行 (推奨)",
                    label="メモリモード",
                )
                attn_slicing = gr.Checkbox(True, label="Attention Slicingを有効にする")
                vae_slicing = gr.Checkbox(True, label="VAE Slicingを有効にする")
                vae_tiling = gr.Checkbox(True, label="VAE Tilingを有効にする")

            with gr.Group():
                lora_paths = gr.Textbox(
                    label="LoRAファイルパス (改行/カンマ区切り)",
                    placeholder="例: /content/drive/MyDrive/SD/lora1.safetensors",
                    lines=3,
                )
                lora_scale = gr.Slider(
                    minimum=0.0,
                    maximum=2.0,
                    step=0.05,
                    value=0.8,
                    label="LoRAスケール",
                )

            load_button = gr.Button("モデルをロード", variant="primary")
            load_message = gr.Markdown("モデル未ロード")

        with gr.Tab("生成"):
            prompt = gr.Textbox(label="Prompt", lines=5, placeholder="プロンプトを入力")
            negative_prompt = gr.Textbox(
                label="Negative Prompt",
                lines=3,
                placeholder="不要な要素を入力",
            )

            with gr.Row():
                width = gr.Slider(256, 1536, step=8, value=1024, label="幅")
                height = gr.Slider(256, 1536, step=8, value=1024, label="高さ")
            steps = gr.Slider(10, 100, step=1, value=30, label="ステップ数")
            guidance = gr.Slider(0.0, 20.0, step=0.1, value=5.0, label="ガイダンススケール")
            num_images = gr.Slider(1, 6, step=1, value=1, label="バッチ枚数")
            seed = gr.Number(value=-1, precision=0, label="シード (-1でランダム)")
            scheduler_name = gr.Dropdown(
                list(SCHEDULER_BUILDERS.keys()),
                value="DPM++ SDE Karras",
                label="スケジューラ",
            )

            generate_button = gr.Button("画像を生成", variant="primary")
            gallery = gr.Gallery(label="生成結果", show_label=False).style(grid=[2], height="auto")
            status = gr.Markdown(visible=True)

        load_button.click(
            fn=load_model,
            inputs=[
                model_type,
                model_path,
                dtype_choice,
                offload_mode,
                attn_slicing,
                vae_slicing,
                vae_tiling,
                lora_paths,
                lora_scale,
            ],
            outputs=[load_message, status],
        )

        generate_button.click(
            fn=generate_images,
            inputs=[
                prompt,
                negative_prompt,
                width,
                height,
                steps,
                guidance,
                seed,
                num_images,
                scheduler_name,
                lora_paths,
                lora_scale,
            ],
            outputs=[gallery, status],
        )

        demo.load(fn=lambda: "モデル未ロード", outputs=load_message)
        demo.queue(concurrency_count=1)
    return demo


def launch_app():
    demo = build_interface()
    app = demo.launch(share=True, show_error=True, prevent_thread_lock=True)
    share_url = getattr(app, "share_url", None)
    for _ in range(20):
        if share_url:
            break
        time.sleep(0.5)
        share_url = getattr(app, "share_url", None)
    if share_url:
        print(f"共有リンク: {share_url}")
        play_ready_beep()
    else:
        print("共有リンクを取得できませんでした。")
    return app

