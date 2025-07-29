import React, { useState, useRef, useEffect } from 'react';
import ImageMaskCanvas from './ImageMaskCanvas';
import {
  Container, Box, Typography, TextField, Slider, Button, Select, MenuItem, RadioGroup, FormControl, FormLabel, FormControlLabel, Radio, Grid, Divider
} from '@mui/material';
import './App.css';

const SAMPLERS = [
  'Euler a', 'Euler', 'LMS', 'Heun', 'DPM2', 'DPM2 a', 'DPM++ 2S a', 'DPM++ 2M', 'DPM++ SDE', 'DPM fast', 'DPM adaptive', 'LMS Karras', 'DPM2 Karras', 'DPM2 a Karras', 'DPM++ 2S a Karras', 'DPM++ 2M Karras', 'DPM++ SDE Karras', 'DDIM', 'PLMS'
];
const SCHEDULES = ['Automatic', 'Karras', 'Exponential', 'Polyex', 'Normal', 'Simple', 'DDIM', 'DEIS', 'Heun', 'Euler', 'LMS'];
const RESIZE_MODES = [
  { label: 'Just resize', value: 0 },
  { label: 'Crop and resize', value: 1 },
  { label: 'Resize and fill', value: 2 },
  { label: 'Just resize (latent upscale)', value: 3 }
];
const MASK_MODES = [
  { label: 'Inpaint masked', value: 0 },
  { label: 'Inpaint not masked', value: 1 }
];
const MASKED_CONTENTS = [
  { label: 'fill', value: 0 },
  { label: 'original', value: 1 },
  { label: 'latent noise', value: 2 },
  { label: 'latent nothing', value: 3 }
];
const INPAINT_AREAS = [
  { label: 'Whole picture', value: true },
  { label: 'Only masked', value: false }
];

const tg = window.Telegram?.WebApp;
const chat_id = tg?.initDataUnsafe?.user?.id;

// Функция fetch с таймаутом
function fetchWithTimeout(url, options, timeout = 60000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

function App() {
  const [image, setImage] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('(deformed, sfw, distorted, disfigured:1.3), poorly drawn, bad anatomy, wrong anatomy, extra limb, missing limb, floating limbs, (mutated hands and fingers:1.4), disconnected limbs, mutation, mutated, ugly, disgusting, blurry, amputation');
  const [mask, setMask] = useState(null);
  const [sampler, setSampler] = useState('Euler a');
  const [schedule, setSchedule] = useState('Karras');
  const [steps, setSteps] = useState(50);
  const [cfgScale, setCfgScale] = useState(5.0);
  const [denoising, setDenoising] = useState(0.69);
  const [batchCount, setBatchCount] = useState(1);
  const [batchSize, setBatchSize] = useState(1);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [resizeMode, setResizeMode] = useState(0);
  const [maskBlur, setMaskBlur] = useState(4);
  const [maskMode, setMaskMode] = useState(0);
  const [maskedContent, setMaskedContent] = useState(1);
  const [inpaintArea, setInpaintArea] = useState(true);
  const [inpaintPadding, setInpaintPadding] = useState(32);
  const [seed, setSeed] = useState(-1);
  const [brushSize, setBrushSize] = useState(32);
  const [maskKey, setMaskKey] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [showManualResultButton, setShowManualResultButton] = useState(false);
  const progressInterval = useRef(null);
  const isMounted = useRef(true);

  const BACKEND_URL = 'https://stunningly-debonair-lanternfish.cloudpub.ru'
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setImage(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleMaskChange = (maskDataUrl) => {
    setMask(maskDataUrl);
  };

  const handleClearMask = () => {
    setMaskKey(prev => prev + 1);
  };

  // Функция для получения результата генерации
  const fetchResult = async () => {
    try {
      console.log('Пытаемся получить результат генерации...');
      const resp = await fetch(`${BACKEND_URL}/result`, { 
        method: 'GET',
        signal: AbortSignal.timeout(10000) // 10 секунд таймаут
      });
      
      if (resp.ok) {
        const data = await resp.json();
        console.log('Получен результат:', data);
        if (data.images && data.images.length > 0) {
          setResult(data.images[0]);
          console.log('Результат установлен успешно');
          return true;
        }
      }
      return false;
    } catch (err) {
      console.log('Ошибка получения результата:', err);
      return false;
    }
  };

  const startProgressPolling = () => {
    console.log('Запускаем polling прогресса...');
    stopProgressPolling();
    
    let retryCount = 0;
    const maxRetries = 10; // Увеличиваем количество попыток
    let lastProgress = 0;
    let consecutiveErrors = 0;
    
    progressInterval.current = setInterval(async () => {
      if (!isMounted.current) return; // Проверяем, что компонент всё ещё смонтирован
      try {
        const resp = await fetch(`${BACKEND_URL}/progress`);
        const data = await resp.json();
        if (isMounted.current) { // Дополнительная проверка перед setState
          const progressValue = Math.round((data.progress || 0) * 100);
          setProgress(progressValue);
          console.log('Прогресс:', progressValue + '%');
          retryCount = 0; // Сбрасываем счетчик при успешном запросе
          consecutiveErrors = 0; // Сбрасываем счетчик последовательных ошибок
          
          // Если прогресс достиг 100%, пытаемся получить результат
          if (progressValue >= 100 && lastProgress < 100) {
            console.log('Генерация завершена, получаем результат...');
            setTimeout(async () => {
              const success = await fetchResult();
              if (success) {
                stopProgressPolling();
                setLoading(false);
                setShowManualResultButton(false);
              } else {
                // Если не удалось получить результат, показываем кнопку ручного получения
                console.log('Не удалось получить результат, показываем кнопку ручного получения...');
                setShowManualResultButton(true);
              }
            }, 2000); // Ждём 2 секунды перед запросом результата
          }
          lastProgress = progressValue;
        }
      } catch (err) {
        console.log('Ошибка polling:', err);
        retryCount++;
        consecutiveErrors++;
        
        // Если много последовательных ошибок, увеличиваем интервал
        if (consecutiveErrors > 5) {
          console.log('Много ошибок подряд, увеличиваем интервал polling...');
          clearInterval(progressInterval.current);
          progressInterval.current = setInterval(arguments.callee, 3000); // 3 секунды вместо 1
          consecutiveErrors = 0;
        }
        
        if (retryCount >= maxRetries) {
          console.log('Превышено количество попыток, останавливаем polling');
          if (isMounted.current) {
            setProgress(null);
            setLoading(false);
            alert('Соединение с сервером потеряно. Попробуйте запустить генерацию снова.');
          }
          stopProgressPolling();
          return;
        }
        
        console.log(`Попытка переподключения ${retryCount}/${maxRetries}`);
        if (isMounted.current) {
          setProgress(null);
        }
      }
    }, 1000);
  };

  const stopProgressPolling = () => {
    console.log('Останавливаем polling прогресса...');
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    if (isMounted.current) {
      setProgress(null);
    }
  };

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      stopProgressPolling();
    };
  }, []);

  // Функция проверки доступности сервера
  const checkServerAvailability = async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/progress`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 секунд таймаут
      });
      return resp.ok;
    } catch (err) {
      console.log('Сервер недоступен:', err);
      return false;
    }
  };

  const handleManualResultFetch = async () => {
    console.log('Ручное получение результата...');
    const success = await fetchResult();
    if (success) {
      setShowManualResultButton(false);
      setLoading(false);
      stopProgressPolling();
    } else {
      alert('Результат пока не готов. Попробуйте позже.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Дополнительная защита от повторных отправок
    if (loading) {
      console.log('Запрос заблокирован: уже идёт генерация');
      return;
    }
    
    console.log('Начинаем генерацию...');
    
    // Проверяем доступность сервера перед отправкой
    const serverAvailable = await checkServerAvailability();
    if (!serverAvailable) {
      alert('Сервер недоступен. Проверьте, что backend запущен и туннель активен.');
      return;
    }
    
    setLoading(true);
    setResult(null);
    setProgress(0);
    setShowManualResultButton(false); // Сбрасываем состояние кнопки
    
    const formData = new FormData();
    function dataURLtoBlob(dataurl) {
      var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
      while(n--){
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], {type:mime});
    }
    formData.append('image', dataURLtoBlob(image), 'image.png');
    formData.append('mask', dataURLtoBlob(mask), 'mask.png');
    formData.append('prompt', prompt);
    formData.append('negative_prompt', negativePrompt);
    formData.append('sampler_name', sampler);
    formData.append('schedule_type', schedule);
    formData.append('steps', steps);
    formData.append('cfg_scale', cfgScale);
    formData.append('denoising_strength', denoising);
    formData.append('batch_count', batchCount);
    formData.append('batch_size', batchSize);
    formData.append('width', width);
    formData.append('height', height);
    formData.append('resize_mode', resizeMode);
    formData.append('mask_blur', maskBlur);
    formData.append('inpainting_mask_invert', maskMode);
    formData.append('inpainting_fill', maskedContent);
    formData.append('inpaint_full_res', inpaintArea);
    formData.append('inpaint_full_res_padding', inpaintPadding);
    formData.append('seed', seed);
    
    // Логируем все данные для диагностики
    console.log('Отправляемые данные:');
    console.log('- prompt:', prompt);
    console.log('- negative_prompt:', negativePrompt);
    console.log('- sampler_name:', sampler);
    console.log('- schedule_type:', schedule);
    console.log('- steps:', steps, typeof steps);
    console.log('- cfg_scale:', cfgScale, typeof cfgScale);
    console.log('- denoising_strength:', denoising, typeof denoising);
    console.log('- seed:', seed, typeof seed);
    console.log('- width:', width, typeof width);
    console.log('- height:', height, typeof height);
    console.log('- batch_count:', batchCount, typeof batchCount);
    console.log('- batch_size:', batchSize, typeof batchSize);
    console.log('- resize_mode:', resizeMode, typeof resizeMode);
    console.log('- mask_blur:', maskBlur, typeof maskBlur);
    console.log('- inpainting_mask_invert:', maskMode, typeof maskMode);
    console.log('- inpainting_fill:', maskedContent, typeof maskedContent);
    console.log('- inpaint_full_res:', inpaintArea, typeof inpaintArea);
    console.log('- inpaint_full_res_padding:', inpaintPadding, typeof inpaintPadding);
    
    try {
      console.log('Отправляем запрос на генерацию...');
      // Сначала отправляем запрос
      const resp = await fetchWithTimeout(`${BACKEND_URL}/inpaint`, {
        method: 'POST',
        body: formData
      }, 300000); // 5 минут таймаут (300 секунд)
      
      console.log('Запрос отправлен успешно, запускаем polling...');
      // Только после успешной отправки запускаем polling
      if (isMounted.current) {
        startProgressPolling();
      }
      
      const data = await resp.json();
      console.log('Получен ответ от сервера:', data);
      if (isMounted.current) {
        if (data.images && data.images.length > 0) {
          setResult(data.images[0]);
          console.log('Генерация завершена успешно');
        } else {
          setResult(null);
          console.log('Ошибка: нет изображений в ответе');
          alert('Ошибка генерации');
        }
      }
    } catch (err) {
      console.error('Ошибка при генерации:', err);
      if (isMounted.current) {
        if (err.name === 'AbortError') {
          console.log('Таймаут запроса - SD может всё ещё генерировать');
          // При таймауте не останавливаем генерацию, а запускаем polling
          if (isMounted.current) {
            startProgressPolling();
            alert('Запрос отправлен. Генерация может занять время. Следите за прогрессом.');
          }
        } else if (err.message === 'Failed to fetch' || err.message.includes('ERR_CONNECTION_RESET')) {
          console.log('Соединение прервано, но SD может продолжать работать');
          // При обрыве соединения запускаем polling для проверки прогресса
          if (isMounted.current) {
            startProgressPolling();
            alert('Соединение прервано, но генерация может продолжаться. Следите за прогрессом.');
          }
        } else {
          console.log('Другая ошибка:', err.message);
          alert('Ошибка: ' + err);
        }
      }
    }
    
    console.log('Завершаем обработку запроса, loading = false');
    if (isMounted.current) {
      setLoading(false);
      stopProgressPolling();
    }
  };

  const handleSendToTelegram = async () => {
    if (!result || !chat_id) return;
    setSending(true);
    setSent(false);
    try {
      await fetch(`${BACKEND_URL}/send_to_telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id,
          image: result
        })
      });
      setSent(true);
    } catch {
      setSent(false);
      alert('Ошибка отправки в Telegram');
    }
    setSending(false);
  };

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" align="center" gutterBottom>Inpainter</Typography>
      <Box sx={{ mb: 2 }}>
        <Button variant="contained" component="label" fullWidth>
          Загрузить изображение
          <input type="file" accept="image/*" hidden onChange={handleImageChange} />
        </Button>
      </Box>
      {image && (
        <>
          <Box sx={{ mb: 2, textAlign: 'center' }}>
            <Typography variant="subtitle1">Маска</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 1 }}>
              <Typography variant="body2">Толщина кисти</Typography>
              <Slider min={4} max={128} value={brushSize} onChange={e=>setBrushSize(Number(e.target.value))} sx={{ width: 120 }} />
              <Typography variant="body2">{brushSize}</Typography>
              <Button size="small" variant="outlined" onClick={handleClearMask}>Очистить</Button>
            </Box>
            <ImageMaskCanvas key={maskKey} image={image} onMaskChange={handleMaskChange} brushSize={brushSize} />
          </Box>
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>Параметры генерации</Typography>
            <Grid container spacing={2}>
              <Grid>
                <TextField label="Позитивный промпт" value={prompt} onChange={e=>setPrompt(e.target.value)} fullWidth size="small" margin="dense" />
              </Grid>
              <Grid>
                <TextField label="Негативный промпт" value={negativePrompt} onChange={e=>setNegativePrompt(e.target.value)} fullWidth size="small" margin="dense" />
              </Grid>
              <Grid>
                <FormControl fullWidth size="small">
                  <FormLabel>Sampler</FormLabel>
                  <Select value={sampler} onChange={e=>setSampler(e.target.value)}>
                    {SAMPLERS.map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid>
                <FormControl fullWidth size="small">
                  <FormLabel>Schedule</FormLabel>
                  <Select value={schedule} onChange={e=>setSchedule(e.target.value)}>
                    {SCHEDULES.map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid><TextField label="Steps" type="number" value={steps} onChange={e=>setSteps(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid><TextField label="CFG" type="number" value={cfgScale} onChange={e=>setCfgScale(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid><TextField label="Denoising" type="number" value={denoising} onChange={e=>setDenoising(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid><TextField label="Batch count" type="number" value={batchCount} onChange={e=>setBatchCount(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid><TextField label="Batch size" type="number" value={batchSize} onChange={e=>setBatchSize(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid><TextField label="Width" type="number" value={width} onChange={e=>setWidth(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid><TextField label="Height" type="number" value={height} onChange={e=>setHeight(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid><Divider sx={{ my: 1 }} /></Grid>
              <Grid>
                <FormControl component="fieldset">
                  <FormLabel>Resize mode</FormLabel>
                  <RadioGroup row value={resizeMode} onChange={e=>setResizeMode(Number(e.target.value))}>
                    {RESIZE_MODES.map(opt => (
                      <FormControlLabel key={opt.value} value={opt.value} control={<Radio />} label={opt.label} />
                    ))}
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid>
                <Typography gutterBottom>Mask blur: {maskBlur}</Typography>
                <Slider min={0} max={64} value={maskBlur} onChange={e=>setMaskBlur(Number(e.target.value))} />
              </Grid>
              <Grid>
                <FormControl component="fieldset">
                  <FormLabel>Mask mode</FormLabel>
                  <RadioGroup row value={maskMode} onChange={e=>setMaskMode(Number(e.target.value))}>
                    {MASK_MODES.map(opt => (
                      <FormControlLabel key={opt.value} value={opt.value} control={<Radio />} label={opt.label} />
                    ))}
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid>
                <FormControl component="fieldset">
                  <FormLabel>Masked content</FormLabel>
                  <RadioGroup row value={maskedContent} onChange={e=>setMaskedContent(Number(e.target.value))}>
                    {MASKED_CONTENTS.map(opt => (
                      <FormControlLabel key={opt.value} value={opt.value} control={<Radio />} label={opt.label} />
                    ))}
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid>
                <FormControl component="fieldset">
                  <FormLabel>Inpaint area</FormLabel>
                  <RadioGroup row value={inpaintArea} onChange={e=>setInpaintArea(e.target.value === 'true')}>
                    {INPAINT_AREAS.map(opt => (
                      <FormControlLabel key={opt.label} value={opt.value.toString()} control={<Radio />} label={opt.label} />
                    ))}
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid>
                <Typography gutterBottom>Only masked padding, pixels: {inpaintPadding}</Typography>
                <Slider min={0} max={128} value={inpaintPadding} onChange={e=>setInpaintPadding(Number(e.target.value))} />
              </Grid>
              <Grid>
                <TextField label="Seed" type="number" value={seed} onChange={e=>setSeed(Number(e.target.value))} size="small" fullWidth helperText="-1 для случайного" />
              </Grid>
              <Grid>
                <Button 
                  type="submit" 
                  variant="contained" 
                  color="primary" 
                  fullWidth 
                  disabled={!image || !mask || !prompt || loading} 
                  sx={{ mt: 2 }}
                  onClick={() => console.log('Кнопка нажата, loading =', loading)}
                >
                  {loading ? `Генерация...${progress !== null ? ` ${progress}%` : ''}` : 'Отправить на инпейнтинг'}
                </Button>
              </Grid>
              {showManualResultButton && (
                <Grid>
                  <Button 
                    variant="outlined" 
                    color="secondary" 
                    fullWidth 
                    onClick={handleManualResultFetch}
                    sx={{ mt: 1 }}
                  >
                    Получить результат вручную
                  </Button>
                </Grid>
              )}
            </Grid>
          </Box>
        </>
      )}
      {result && (
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography variant="h6">Результат</Typography>
          <img src={`data:image/png;base64,${result}`} alt="result" style={{maxWidth: '100%', borderRadius: 8, margin: '16px 0'}} />
          <Button
            variant="outlined"
            sx={{ mt: 2, mr: 2 }}
            onClick={() => window.open(`data:image/png;base64,${result}`, '_blank')}
          >
            Открыть в браузере
          </Button>
          <Button
            variant="outlined"
            sx={{ mt: 2, mr: 2 }}
            component="a"
            href={`data:image/png;base64,${result}`}
            download="inpaint_result.png"
          >
            Скачать изображение
          </Button>
          {chat_id && (
            <Button
              variant="contained"
              sx={{ mt: 2 }}
              onClick={handleSendToTelegram}
              disabled={sending}
            >
              {sending ? 'Отправка...' : sent ? 'Отправлено!' : 'Отправить в Telegram'}
            </Button>
          )}
          {!chat_id && (
            <Typography variant="body2" sx={{ mt: 1, color: '#aaa' }}>
              Для отправки в Telegram откройте Web App через кнопку в боте
            </Typography>
          )}
        </Box>
      )}
    </Container>
  );
}

export default App;
