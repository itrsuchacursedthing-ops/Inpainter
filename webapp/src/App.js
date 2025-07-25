import React, { useState } from 'react';
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

function App() {
  const [image, setImage] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [mask, setMask] = useState(null);
  const [sampler, setSampler] = useState('Euler a');
  const [schedule, setSchedule] = useState('Karras');
  const [steps, setSteps] = useState(50);
  const [cfgScale, setCfgScale] = useState(5.0);
  const [denoising, setDenoising] = useState(0.75);
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

  const BACKEND_URL = 'https://pliantly-key-drum.cloudpub.ru';

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
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
    try {
      const resp = await fetch(`${BACKEND_URL}/inpaint`, {
        method: 'POST',
        body: formData
      });
      const data = await resp.json();
      if (data.images && data.images.length > 0) {
        setResult(data.images[0]);
      } else {
        setResult(null);
        alert('Ошибка генерации');
      }
    } catch (err) {
      alert('Ошибка: ' + err);
    }
    setLoading(false);
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
              <Grid item xs={12}>
                <TextField label="Позитивный промпт" value={prompt} onChange={e=>setPrompt(e.target.value)} fullWidth size="small" margin="dense" />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Негативный промпт" value={negativePrompt} onChange={e=>setNegativePrompt(e.target.value)} fullWidth size="small" margin="dense" />
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <FormLabel>Sampler</FormLabel>
                  <Select value={sampler} onChange={e=>setSampler(e.target.value)}>
                    {SAMPLERS.map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <FormLabel>Schedule</FormLabel>
                  <Select value={schedule} onChange={e=>setSchedule(e.target.value)}>
                    {SCHEDULES.map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={4}><TextField label="Steps" type="number" value={steps} onChange={e=>setSteps(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid item xs={4}><TextField label="CFG" type="number" value={cfgScale} onChange={e=>setCfgScale(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid item xs={4}><TextField label="Denoising" type="number" value={denoising} onChange={e=>setDenoising(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid item xs={6}><TextField label="Batch count" type="number" value={batchCount} onChange={e=>setBatchCount(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid item xs={6}><TextField label="Batch size" type="number" value={batchSize} onChange={e=>setBatchSize(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid item xs={6}><TextField label="Width" type="number" value={width} onChange={e=>setWidth(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid item xs={6}><TextField label="Height" type="number" value={height} onChange={e=>setHeight(Number(e.target.value))} size="small" fullWidth /></Grid>
              <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
              <Grid item xs={12}>
                <FormControl component="fieldset">
                  <FormLabel>Resize mode</FormLabel>
                  <RadioGroup row value={resizeMode} onChange={e=>setResizeMode(Number(e.target.value))}>
                    {RESIZE_MODES.map(opt => (
                      <FormControlLabel key={opt.value} value={opt.value} control={<Radio />} label={opt.label} />
                    ))}
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <Typography gutterBottom>Mask blur: {maskBlur}</Typography>
                <Slider min={0} max={64} value={maskBlur} onChange={e=>setMaskBlur(Number(e.target.value))} />
              </Grid>
              <Grid item xs={12}>
                <FormControl component="fieldset">
                  <FormLabel>Mask mode</FormLabel>
                  <RadioGroup row value={maskMode} onChange={e=>setMaskMode(Number(e.target.value))}>
                    {MASK_MODES.map(opt => (
                      <FormControlLabel key={opt.value} value={opt.value} control={<Radio />} label={opt.label} />
                    ))}
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl component="fieldset">
                  <FormLabel>Masked content</FormLabel>
                  <RadioGroup row value={maskedContent} onChange={e=>setMaskedContent(Number(e.target.value))}>
                    {MASKED_CONTENTS.map(opt => (
                      <FormControlLabel key={opt.value} value={opt.value} control={<Radio />} label={opt.label} />
                    ))}
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl component="fieldset">
                  <FormLabel>Inpaint area</FormLabel>
                  <RadioGroup row value={inpaintArea} onChange={e=>setInpaintArea(e.target.value === 'true')}>
                    {INPAINT_AREAS.map(opt => (
                      <FormControlLabel key={opt.label} value={opt.value.toString()} control={<Radio />} label={opt.label} />
                    ))}
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <Typography gutterBottom>Only masked padding, pixels: {inpaintPadding}</Typography>
                <Slider min={0} max={128} value={inpaintPadding} onChange={e=>setInpaintPadding(Number(e.target.value))} />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Seed" type="number" value={seed} onChange={e=>setSeed(Number(e.target.value))} size="small" fullWidth helperText="-1 для случайного" />
              </Grid>
              <Grid item xs={12}>
                <Button type="submit" variant="contained" color="primary" fullWidth disabled={!image || !mask || !prompt || loading} sx={{ mt: 2 }}>
                  {loading ? 'Генерация...' : 'Отправить на инпейнтинг'}
                </Button>
              </Grid>
            </Grid>
          </Box>
        </>
      )}
      {result && (
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography variant="h6">Результат</Typography>
          <img src={`data:image/png;base64,${result}`} alt="result" style={{maxWidth: '100%', borderRadius: 8, margin: '16px 0'}} />
          {/* Здесь будет кнопка для отправки в Telegram */}
        </Box>
      )}
    </Container>
  );
}

export default App;
