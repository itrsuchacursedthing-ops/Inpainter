from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import requests
import base64
import os

app = FastAPI()

# Разрешаем фронтенду обращаться к API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SD_API_URL = "http://127.0.0.1:7860/sdapi/v1/img2img"

@app.post("/inpaint")
async def inpaint(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
    prompt: str = Form(...),
    negative_prompt: str = Form(""),
    sampler_name: str = Form("Euler a"),
    schedule_type: str = Form("Karras"),
    steps: int = Form(30),
    cfg_scale: float = Form(7.0),
    denoising_strength: float = Form(0.75),
    seed: int = Form(-1),
    width: int = Form(512),
    height: int = Form(512),
    batch_count: int = Form(1),
    batch_size: int = Form(1),
    resize_mode: int = Form(0),
    mask_blur: int = Form(4),
    inpainting_mask_invert: int = Form(0),
    inpainting_fill: int = Form(1),
    inpaint_full_res: bool = Form(True),
    inpaint_full_res_padding: int = Form(32),
):
    # Читаем файлы и кодируем в base64
    image_bytes = await image.read()
    mask_bytes = await mask.read()
    image_b64 = base64.b64encode(image_bytes).decode('utf-8')
    mask_b64 = base64.b64encode(mask_bytes).decode('utf-8')

    payload = {
        "init_images": [image_b64],
        "mask": mask_b64,
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "steps": steps,
        "cfg_scale": cfg_scale,
        "denoising_strength": denoising_strength,
        "seed": seed,
        "width": width,
        "height": height,
        "sampler_name": sampler_name,
        "scheduler": schedule_type,
        "batch_size": batch_size,
        "batch_count": batch_count,
        "resize_mode": resize_mode,
        "mask_blur": mask_blur,
        "inpainting_mask_invert": inpainting_mask_invert,
        "inpainting_fill": inpainting_fill,
        "inpaint_full_res": inpaint_full_res,
        "inpaint_full_res_padding": inpaint_full_res_padding,
        "override_settings": {},
    }

    try:
        response = requests.post(SD_API_URL, json=payload)
        response.raise_for_status()
        result = response.json()
        # result['images'] — список base64 изображений
        return JSONResponse({"images": result.get('images', [])})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500) 