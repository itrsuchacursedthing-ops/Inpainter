import telebot
from telebot.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
import requests
import os
import base64
import re
import time
from io import BytesIO
from PIL import Image
from PIL.PngImagePlugin import PngInfo
from threading import Thread
import zlib
import random

# Конфигурация
TOKEN = "7759869868:AAF1HKa0mCFP4q7Y9uxfqUm3F08bmmvUlSM"
API_URL = "http://127.0.0.1:7860/sdapi/v1/txt2img"
IMG2IMG_API_URL = "http://127.0.0.1:7860/sdapi/v1/img2img"
PROGRESS_API_URL = "http://127.0.0.1:7860/sdapi/v1/progress"
OUTPUT_DIR = r"E:\Stable Diffusion\stable-diffusion-portable-main\outputs\txt2img-images"

DEFAULT_NEGATIVE = ("watermark, text, ugly face, baldy man, body hairs, score_6, score_5, score_4, pony, censored, furry, chibi, monochrome,"
                    " bad lips, (worst quality:1.4, low quality:1.4), (bad anatomy), (inaccurate limb:1.2), bad composition, "
                    "inaccurate eyes, extra digit, fewer digits, (extra arms:1.2), badhandv4, physical-defects:2, unhealthy-deformed-joints:2, "
                    "unhealthy-hands:2, bad nipples, blurry eyes, strange kiss, ugly tongue, bad penis, penis in textures, futanari, bad fingers, blurry eyes ")



# Инициализация
bot = telebot.TeleBot(TOKEN)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Глобальные переменные
user_sessions = {}
progress_messages = {}
active_generations = {}


# Вспомогательные функции
def clean_temp_files(chat_id):
    if chat_id in user_sessions and 'temp_file' in user_sessions[chat_id]:
        if os.path.exists(user_sessions[chat_id]['temp_file']):
            os.remove(user_sessions[chat_id]['temp_file'])
        del user_sessions[chat_id]['temp_file']


def parse_parameters(text):
    params = {
        "prompt": "",
        "negative_prompt": DEFAULT_NEGATIVE,
        "steps": 50,
        "sampler": "Euler a",
        "schedule_type": "Karras",
        "cfg_scale": 5,
        "seed": -1,
        "width": 1024,
        "height": 1024,
        "clip_skip": 2,
        "batch_count": 1,
        "batch_size": 1,
        "denoising_strength": 0.75
    }

    # Парсинг параметров
    prompt_match = re.search(r'Positive prompt:\s*(.*?)(?=\nNegative prompt:|$)', text, re.DOTALL | re.IGNORECASE)
    if prompt_match:
        params['prompt'] = prompt_match.group(1).strip()

    neg_match = re.search(r'Negative prompt:\s*(.*?)(?=\nSteps:|$)', text, re.DOTALL | re.IGNORECASE)
    if neg_match:
        params['negative_prompt'] = neg_match.group(1).strip()

    steps_match = re.search(r'Steps:\s*(\d+)', text, re.IGNORECASE)
    if steps_match:
        params['steps'] = int(steps_match.group(1))

    sampler_match = re.search(r'Sampler:\s*([^\n,]+)', text, re.IGNORECASE)
    if sampler_match:
        params['sampler'] = sampler_match.group(1).strip()

    cfg_match = re.search(r'CFG scale:\s*([\d.]+)', text, re.IGNORECASE)
    if cfg_match:
        params['cfg_scale'] = float(cfg_match.group(1))

    seed_match = re.search(r'Seed:\s*(-?\d+)', text, re.IGNORECASE)
    if seed_match:
        params['seed'] = int(seed_match.group(1))
    else:
        params['seed'] = random.randint(0, 2 ** 32 - 1)

    size_match = re.search(r'Size:\s*(\d+)x(\d+)', text, re.IGNORECASE)
    if size_match:
        params['width'] = int(size_match.group(1))
        params['height'] = int(size_match.group(2))

    strength_match = re.search(r'Denoising strength:\s*([\d.]+)', text, re.IGNORECASE)
    if strength_match:
        params['denoising_strength'] = float(strength_match.group(1))

    clip_skip_match = re.search(r'Clip skip:\s*(\d+)', text, re.IGNORECASE)
    if clip_skip_match:
        params['clip_skip'] = int(clip_skip_match.group(1))

    batch_count_match = re.search(r'Batch count:\s*(\d+)', text, re.IGNORECASE)
    if batch_count_match:
        params['batch_count'] = int(batch_count_match.group(1))

    batch_size_match = re.search(r'Batch size:\s*(\d+)', text, re.IGNORECASE)
    if batch_size_match:
        params['batch_size'] = int(batch_size_match.group(1))

    return params


def track_progress(chat_id, message_id, steps):
    last_progress = -1
    while chat_id in active_generations:
        try:
            response = requests.get(PROGRESS_API_URL)
            if response.status_code == 200:
                data = response.json()
                progress = data.get('progress', 0) * 100
                step = data.get('state', {}).get('sampling_step', 0)

                if progress > last_progress:
                    try:
                        bot.edit_message_text(
                            chat_id=chat_id,
                            message_id=message_id,
                            text=f"Прогресс генерации: {progress:.1f}%\nШаг {step} из {steps}"
                        )
                        last_progress = progress
                    except:
                        pass

                if step >= steps and progress >= 100:
                    break
        except:
            pass
        time.sleep(1)

    if chat_id in active_generations:
        del active_generations[chat_id]


def extract_parameters_from_image(file_path):
    try:
        if file_path.endswith('.png'):
            with open(file_path, 'rb') as f:
                data = f.read()
                parameters = None
                index = 8

                while index < len(data):
                    chunk_length = int.from_bytes(data[index:index + 4], byteorder='big')
                    chunk_type = data[index + 4:index + 8].decode('ascii')

                    if chunk_type == 'tEXt' or chunk_type == 'iTXt':
                        key_end = data[index + 8:].find(b'\x00') + index + 8
                        key = data[index + 8:key_end].decode('latin1')

                        if key == 'parameters':
                            content = data[key_end + 1:index + 8 + chunk_length]
                            if chunk_type == 'iTXt' and data[key_end + 1] == 1:
                                content = zlib.decompress(content[2:])
                            parameters = content.decode('utf-8', errors='ignore')
                            break

                    index += 8 + chunk_length + 4

                if parameters:
                    return parameters.strip()
        else:
            with open(file_path, 'rb') as file:
                file.seek(61)
                data = file.read()

            bad_char_index = data.find(b'\xff')
            extracted_data = data[:bad_char_index] if bad_char_index != -1 else data
            return extracted_data.decode('latin1', errors='ignore')

    except Exception as e:
        print(f"Error extracting parameters: {e}")
        return None


# Команды бота
@bot.message_handler(commands=['start'])
def send_welcome(message):
    bot.reply_to(message,
                 "Привет! Используй /generate для создания изображения или /extract для извлечения промпта.\n"
                 "Со всеми параметрами можете ознакомиться при помощи команды /info")


@bot.message_handler(commands=['info'])
def send_info(message):
    info_text = """
🔹 Positive prompt - основное описание изображения, что должно быть на картинке. Чем детальнее, тем лучше.
Пример: beautiful fantasy landscape with mountains, sunset, vibrant colors

🔹 Negative prompt - что нужно исключить (дефекты, нежелательные элементы).
Пример: blurry, low quality, deformed hands

🔸 Основные параметры:
- Steps (20-50): количество шагов генерации. Больше шагов = детальнее, но дольше (рекомендуем 25-35)
- Sampler (Euler a, DPM++ 2M Karras и др.): алгоритм генерации
- CFG scale (3-15): сила следования промпту (рекомендуем 5-9)
- Seed (-1 для случайного): число для воспроизводимости результатов
- Size (например 512x768): размер изображения (рекомендуем 512x512, 512x768, 768x512)
- Clip skip (1-3): сколько слоев CLIP пропускать (1 = стандартно, 2 = более креативно)
- Batch count: количество групп изображений
- Batch size: количество изображений в каждой группе
- Denoising strength (0.1-1.0): сила изменения для img2img

🎨 Советы по промптам:
- Используйте запятые для разделения описаний
- Добавляйте стили: digital art, 4k, highly detailed
- Указывайте художников: by greg rutkowski
- Контролируйте композицию: close-up portrait, symmetrical

🖼️ Режим img2img:
1. Отправьте изображение
2. Бот извлечет параметры (если есть)
3. Введите новые параметры для генерации
4. Укажите силу изменения (denoising strength)
"""
    bot.reply_to(message, info_text)


@bot.message_handler(commands=['extract'])
def handle_extract(message):
    bot.reply_to(message, "Отправьте изображение в формате PNG или JPG для извлечения параметров")
    bot.register_next_step_handler(message, process_extract)


def process_extract(message):
    chat_id = message.chat.id
    try:
        # Скачивание файла
        if message.document:
            file_id = message.document.file_id
            file_name = message.document.file_name
        else:
            file_id = message.photo[-1].file_id
            file_name = None

        file_info = bot.get_file(file_id)
        downloaded_file = bot.download_file(file_info.file_path)

        # Сохранение временного файла
        ext = '.png' if not file_name or file_name.endswith('. ') else '.jpg'
        temp_file = os.path.join(OUTPUT_DIR, f"extract_{chat_id}{ext}")

        with open(temp_file, 'wb') as f:
            f.write(downloaded_file)

        # Извлечение параметров
        parameters = extract_parameters_from_image(temp_file)

        if parameters:
            bot.reply_to(message, f"Извлеченные параметры:\n\n{parameters}")
        else:
            bot.reply_to(message, "Не удалось извлечь параметры из изображения")

    except Exception as e:
        bot.reply_to(message, f"Ошибка: {str(e)}")
    finally:
        if 'temp_file' in locals() and os.path.exists(temp_file):
            os.remove(temp_file)


@bot.message_handler(commands=['generate'])
def start_generation(message):
    example = (
        "Positive prompt: beautiful landscape with mountains\n"
        "Negative prompt: blurry, low quality\n"
        "Steps: 50, Sampler: Euler a\n"
        "CFG scale: 5, Seed: -1\n"
        "Size: 1024x1024\n"
        "Batch count: 1, Batch size: 1"
    )
    msg = bot.reply_to(message, "Введите параметры для генерации:\n\n" + example)
    bot.register_next_step_handler(msg, process_txt2img)


def process_txt2img(message):
    chat_id = message.chat.id
    try:
        params = parse_parameters(message.text)

        if not params['prompt']:
            raise ValueError("Не указан позитивный промпт")

        progress_msg = bot.send_message(chat_id, "🔄 Начинаю генерацию...")
        active_generations[chat_id] = True
        progress_messages[chat_id] = progress_msg.message_id

        Thread(target=track_progress, args=(chat_id, progress_msg.message_id, params['steps'])).start()

        # Подготовка запроса
        payload = {
            "prompt": params['prompt'],
            "negative_prompt": params['negative_prompt'],
            "steps": params['steps'],
            "sampler_name": params['sampler'],
            "cfg_scale": params['cfg_scale'],
            "seed": params['seed'],
            "width": params['width'],
            "height": params['height'],
            "batch_count": params['batch_count'],
            "batch_size": params['batch_size'],
            "scheduler": "Karras",
            "override_settings": {
                "CLIP_stop_at_last_layers": params['clip_skip']
            }
        }

        # Генерация
        response = requests.post(API_URL, json=payload)
        response.raise_for_status()
        result = response.json()

        # Обработка результатов
        for i, img_data in enumerate(result['images']):
            img = Image.open(BytesIO(base64.b64decode(img_data)))

            metadata = PngInfo()
            metadata.add_text("parameters",
                              f"Positive prompt: {params['prompt']}\n"
                              f"Negative prompt: {params['negative_prompt']}\n"
                              f"Steps: {params['steps']}, Sampler: {params['sampler']}\n"
                              f"Schedule type: {params['schedule_type']}\n"
                              f"CFG scale: {params['cfg_scale']}, Seed: {params['seed']}\n"
                              f"Size: {params['width']}x{params['height']}\n"
                              f"Clip skip: {params['clip_skip']}")

            filename = os.path.join(OUTPUT_DIR, f"result_{chat_id}_{i}.png")
            img.save(filename, "PNG", pnginfo=metadata)

            with open(filename, 'rb') as photo:
                bot.send_photo(chat_id, photo)
                bot.send_document(chat_id, open(filename, 'rb'))

            os.remove(filename)

    except Exception as e:
        bot.reply_to(message, f"❌ Ошибка: {str(e)}")
    finally:
        clean_temp_files(chat_id)
        if chat_id in active_generations:
            del active_generations[chat_id]
        if chat_id in progress_messages:
            try:
                bot.delete_message(chat_id, progress_messages[chat_id])
                del progress_messages[chat_id]
            except:
                pass


@bot.message_handler(commands=['img2img'])
def start_img2img(message):
    bot.reply_to(message, "Отправьте изображение для обработки в режиме img2img")
    bot.register_next_step_handler(message, handle_img2img_photo)


def handle_img2img_photo(message):
    chat_id = message.chat.id
    try:
        # Скачивание файла
        if message.document:
            file_id = message.document.file_id
        else:
            file_id = message.photo[-1].file_id

        file_info = bot.get_file(file_id)
        downloaded_file = bot.download_file(file_info.file_path)

        # Сохранение временного файла
        ext = '.png' if not message.document or message.document.file_name.endswith('.png') else '.jpg'
        temp_file = os.path.join(OUTPUT_DIR, f"img2img_{chat_id}{ext}")

        with open(temp_file, 'wb') as f:
            f.write(downloaded_file)

        # Извлечение параметров из изображения
        extracted_params = extract_parameters_from_image(temp_file)
        example = (
            "Positive prompt: improved version of the image\n"
            "Negative prompt: blurry, bad quality\n"
            "Steps: 50, Sampler: Euler a\n"
            "CFG scale: 5, Seed: -1\n"
            "Denoising strength: 0.75\n"
            "Size: 1024x1024"
        )

        msg = bot.reply_to(message,
                            "Введите параметры для img2img. Например:\n\n" + example)

        user_sessions[chat_id] = {'temp_file': temp_file, 'mode': 'img2img'}
        bot.register_next_step_handler(msg, process_img2img)

    except Exception as e:
        bot.reply_to(message, f"❌ Ошибка: {str(e)}")
        clean_temp_files(chat_id)


def process_img2img(message):
    chat_id = message.chat.id
    try:
        if chat_id not in user_sessions or 'temp_file' not in user_sessions[chat_id]:
            raise ValueError("Изображение не найдено")

        params = parse_parameters(message.text)

        if not params['prompt']:
            raise ValueError("Не указан позитивный промпт")

        progress_msg = bot.send_message(chat_id, "🔄 Начинаю img2img обработку...")
        active_generations[chat_id] = True
        progress_messages[chat_id] = progress_msg.message_id

        Thread(target=track_progress, args=(chat_id, progress_msg.message_id, params['steps'])).start()

        # Чтение изображения
        with open(user_sessions[chat_id]['temp_file'], 'rb') as f:
            init_image = base64.b64encode(f.read()).decode('utf-8')

        # Подготовка запроса
        payload = {
            "init_images": [init_image],
            "prompt": params['prompt'],
            "negative_prompt": params['negative_prompt'],
            "steps": params['steps'],
            "sampler_name": params['sampler'],
            "cfg_scale": params['cfg_scale'],
            "seed": params['seed'],
            "width": params['width'],
            "height": params['height'],
            "denoising_strength": params['denoising_strength'],
            "batch_count": params['batch_count'],
            "batch_size": params['batch_size'],
            "scheduler": "Karras",
            "override_settings": {
                "CLIP_stop_at_last_layers": params['clip_skip']
            }
        }

        # Генерация
        response = requests.post(IMG2IMG_API_URL, json=payload)
        response.raise_for_status()
        result = response.json()

        # Обработка результатов
        for i, img_data in enumerate(result['images']):
            img = Image.open(BytesIO(base64.b64decode(img_data)))

            metadata = PngInfo()
            metadata.add_text("parameters",
                             f"Positive prompt: {params['prompt']}\n"
                              f"Negative prompt: {params['negative_prompt']}\n"
                              f"Steps: {params['steps']}, Sampler: {params['sampler']}\n"
                              f"Schedule type: {params['schedule_type']}\n"
                              f"CFG scale: {params['cfg_scale']}, Seed: {params['seed']}\n"
                              f"Size: {params['width']}x{params['height']}\n"
                              f"Denoising strength: {params['denoising_strength']}\n"
                              f"Clip skip: {params['clip_skip']}")

            filename = os.path.join(OUTPUT_DIR, f"img2img_{chat_id}_{i}.png")
            img.save(filename, "PNG", pnginfo=metadata)

            with open(filename, 'rb') as photo:
                bot.send_photo(chat_id, photo)
                bot.send_document(chat_id, open(filename, 'rb'))

            os.remove(filename)

    except Exception as e:
        bot.reply_to(message, f"❌ Ошибка: {str(e)}")
    finally:
        clean_temp_files(chat_id)
        if chat_id in active_generations:
            del active_generations[chat_id]
        if chat_id in progress_messages:
            try:
                bot.delete_message(chat_id, progress_messages[chat_id])
                del progress_messages[chat_id]
            except:
                pass


@bot.message_handler(commands=['webapp'])
def send_webapp(message):
    bot.send_message(message.chat.id, "fff")
    webapp_url = "https://itrsuchacursedthing-ops.github.io/Inpainter/"
    markup = InlineKeyboardMarkup()
    markup.add(
        InlineKeyboardButton("Открыть Web App", web_app=WebAppInfo(url=webapp_url))
    )
    bot.send_message(message.chat.id, "Откройте приложение для инпейнтинга:", reply_markup=markup)

# Запуск бота
if __name__ == '__main__':
    print("Бот запущен...")
    bot.infinity_polling()