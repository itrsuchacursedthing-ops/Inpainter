from fastapi import FastAPI, File, UploadFile, Form, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from typing import Optional
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

# Обработчик ошибок валидации
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"Ошибка валидации: {exc}")
    return JSONResponse(
        status_code=422,
        content={"error": f"Ошибка валидации: {exc}"}
    )

SD_API_URL = "http://127.0.0.1:7860/sdapi/v1/img2img"

# Глобальная переменная для хранения последнего результата
last_result = None

@app.get("/")
def read_root():
    return {"message": "Backend работает!"}

@app.get("/test")
def test_endpoint():
    return {"status": "ok", "message": "Backend доступен"}

@app.get("/progress")
def get_progress():
    try:
        resp = requests.get("http://127.0.0.1:7860/sdapi/v1/progress")
        return resp.json()
    except Exception as e:
        return {"progress": 0}

@app.get("/result")
def get_result():
    global last_result
    if last_result:
        return JSONResponse({"images": [last_result]})
    else:
        return JSONResponse({"images": []})

@app.post("/inpaint")
async def inpaint(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
    prompt: str = Form(...),
    negative_prompt: Optional[str] = Form("(deformed, sfw, distorted, disfigured:1.3), poorly drawn, bad anatomy, wrong anatomy, extra limb, missing limb, floating limbs, (mutated hands and fingers:1.4), disconnected limbs, mutation, mutated, ugly, disgusting, blurry, amputation"),
    sampler_name: Optional[str] = Form("Euler a"),
    schedule_type: Optional[str] = Form("Karras"),
    steps: Optional[int] = Form(50),
    cfg_scale: Optional[float] = Form(5.0),
    denoising_strength: Optional[float] = Form(0.69),
    seed: Optional[int] = Form(-1),
    width: Optional[int] = Form(1024),
    height: Optional[int] = Form(1024),
    batch_count: Optional[int] = Form(1),
    batch_size: Optional[int] = Form(1),
    resize_mode: Optional[int] = Form(0),
    mask_blur: Optional[int] = Form(4),
    inpainting_mask_invert: Optional[int] = Form(0),
    inpainting_fill: Optional[int] = Form(1),
    inpaint_full_res: Optional[str] = Form("true"),  # Изменяем на str, так как FormData передаёт строки
    inpaint_full_res_padding: Optional[int] = Form(32),
):
    print("=== НАЧАЛО ОБРАБОТКИ ЗАПРОСА ===")
    global last_result
    
    # Устанавливаем значения по умолчанию для None параметров
    negative_prompt = negative_prompt or "(deformed, sfw, distorted, disfigured:1.3), poorly drawn, bad anatomy, wrong anatomy, extra limb, missing limb, floating limbs, (mutated hands and fingers:1.4), disconnected limbs, mutation, mutated, ugly, disgusting, blurry, amputation"
    sampler_name = sampler_name or "Euler a"
    schedule_type = schedule_type or "Karras"
    steps = steps or 50
    cfg_scale = cfg_scale or 5.0
    denoising_strength = denoising_strength or 0.69
    seed = seed or -1
    width = width or 1024
    height = height or 1024
    batch_count = batch_count or 1
    batch_size = batch_size or 1
    resize_mode = resize_mode or 0
    mask_blur = mask_blur or 4
    inpainting_mask_invert = inpainting_mask_invert or 0
    inpainting_fill = inpainting_fill or 1
    inpaint_full_res = inpaint_full_res or "true"
    inpaint_full_res_padding = inpaint_full_res_padding or 32
    
    # Логируем полученные параметры для диагностики
    print(f"Получены параметры:")
    print(f"- prompt: {prompt}")
    print(f"- steps: {steps} (тип: {type(steps)})")
    print(f"- cfg_scale: {cfg_scale} (тип: {type(cfg_scale)})")
    print(f"- denoising_strength: {denoising_strength} (тип: {type(denoising_strength)})")
    print(f"- inpaint_full_res: {inpaint_full_res} (тип: {type(inpaint_full_res)})")
    print(f"- image filename: {image.filename}")
    print(f"- mask filename: {mask.filename}")
    
    # Читаем файлы и кодируем в base64
    image_bytes = await image.read()
    mask_bytes = await mask.read()
    print(f"- image size: {len(image_bytes)} bytes")
    print(f"- mask size: {len(mask_bytes)} bytes")
    
    image_b64 = base64.b64encode(image_bytes).decode('utf-8')
    mask_b64 = base64.b64encode(mask_bytes).decode('utf-8')

    # Преобразуем строку в boolean
    inpaint_full_res_bool = inpaint_full_res.lower() == "true"
    print(f"- inpaint_full_res_bool: {inpaint_full_res_bool}")

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
        "inpaint_full_res": inpaint_full_res_bool,  # Используем преобразованное значение
        "inpaint_full_res_padding": inpaint_full_res_padding,
        "override_settings": {},
    }

    try:
        response = requests.post(SD_API_URL, json=payload)
        response.raise_for_status()
        result = response.json()
        # Сохраняем результат глобально
        if result.get('images') and len(result['images']) > 0:
            last_result = result['images'][0]
        # result['images'] — список base64 изображений
        return JSONResponse({"images": result.get('images', [])})
    except requests.exceptions.HTTPError as e:
        print(f"HTTP ошибка от SD API: {e}")
        print(f"Статус код: {e.response.status_code}")
        print(f"Ответ: {e.response.text}")
        return JSONResponse({"error": f"SD API ошибка: {e.response.text}"}, status_code=500)
    except Exception as e:
        print(f"Общая ошибка: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

TELEGRAM_BOT_TOKEN = "7759869868:AAF1HKa0mCFP4q7Y9uxfqUm3F08bmmvUlSM"

@app.post("/send_to_telegram")
async def send_to_telegram(request: Request):
    data = await request.json()
    chat_id = data["chat_id"]
    image_b64 = data["image"]
    image_bytes = base64.b64decode(image_b64)
    files = {'document': ('inpaint_result.png', image_bytes, 'image/png')}
    resp = requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendDocument",
        data={'chat_id': chat_id},
        files=files
    )
    return {"ok": resp.ok} 