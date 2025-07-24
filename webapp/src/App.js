import React, { useState } from 'react';
import ImageMaskCanvas from './ImageMaskCanvas';
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
  const [steps, setSteps] = useState(30);
  const [cfgScale, setCfgScale] = useState(7.0);
  const [denoising, setDenoising] = useState(0.75);
  const [batchCount, setBatchCount] = useState(1);
  const [batchSize, setBatchSize] = useState(1);
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resizeMode, setResizeMode] = useState(0);
  const [maskBlur, setMaskBlur] = useState(4);
  const [maskMode, setMaskMode] = useState(0);
  const [maskedContent, setMaskedContent] = useState(1);
  const [inpaintArea, setInpaintArea] = useState(true);
  const [inpaintPadding, setInpaintPadding] = useState(32);
  const [seed, setSeed] = useState(-1);
  const [brushSize, setBrushSize] = useState(32);
  const [maskKey, setMaskKey] = useState(0); // для сброса маски

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
    setMaskKey(prev => prev + 1); // сбросить компонент маски
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    // Преобразуем base64 в Blob
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
      const resp = await fetch('http://localhost:8000/inpaint', {
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
    <div className="App">
      <h2>Инпейнтинг Stable Diffusion</h2>
      <input type="file" accept="image/*" onChange={handleImageChange} />
      {image && (
        <>
          <div style={{margin:'10px 0'}}>
            <label>Толщина кисти: <input type="range" min={4} max={128} value={brushSize} onChange={e=>setBrushSize(Number(e.target.value))} /></label> {brushSize}
            <button type="button" onClick={handleClearMask} style={{marginLeft:12}}>Очистить маску</button>
          </div>
          <ImageMaskCanvas key={maskKey} image={image} onMaskChange={handleMaskChange} brushSize={brushSize} />
        </>
      )}
      <form onSubmit={handleSubmit} style={{marginTop: 20}}>
        <input
          type="text"
          placeholder="Позитивный промпт..."
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          style={{ width: '80%', margin: '10px 0' }}
        />
        <input
          type="text"
          placeholder="Негативный промпт..."
          value={negativePrompt}
          onChange={e => setNegativePrompt(e.target.value)}
          style={{ width: '80%', margin: '10px 0' }}
        />
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <label>Sampler:
            <select value={sampler} onChange={e=>setSampler(e.target.value)}>
              {SAMPLERS.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Schedule:
            <select value={schedule} onChange={e=>setSchedule(e.target.value)}>
              {SCHEDULES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Steps:
            <input type="number" min={1} max={150} value={steps} onChange={e=>setSteps(Number(e.target.value))} style={{width:60}}/>
          </label>
          <label>CFG:
            <input type="number" min={1} max={30} step={0.1} value={cfgScale} onChange={e=>setCfgScale(Number(e.target.value))} style={{width:60}}/>
          </label>
          <label>Denoising:
            <input type="number" min={0.1} max={1} step={0.01} value={denoising} onChange={e=>setDenoising(Number(e.target.value))} style={{width:60}}/>
          </label>
          <label>Batch count:
            <input type="number" min={1} max={16} value={batchCount} onChange={e=>setBatchCount(Number(e.target.value))} style={{width:60}}/>
          </label>
          <label>Batch size:
            <input type="number" min={1} max={8} value={batchSize} onChange={e=>setBatchSize(Number(e.target.value))} style={{width:60}}/>
          </label>
          <label>Width:
            <input type="number" min={64} max={2048} step={8} value={width} onChange={e=>setWidth(Number(e.target.value))} style={{width:60}}/>
          </label>
          <label>Height:
            <input type="number" min={64} max={2048} step={8} value={height} onChange={e=>setHeight(Number(e.target.value))} style={{width:60}}/>
          </label>
        </div>
        <div style={{margin:'10px 0'}}>
          <div>Resize mode:</div>
          {RESIZE_MODES.map(opt => (
            <label key={opt.value} style={{marginRight:8}}>
              <input type="radio" name="resizeMode" value={opt.value} checked={resizeMode===opt.value} onChange={()=>setResizeMode(opt.value)} /> {opt.label}
            </label>
          ))}
        </div>
        <div style={{margin:'10px 0'}}>
          <label>Mask blur: <input type="range" min={0} max={64} value={maskBlur} onChange={e=>setMaskBlur(Number(e.target.value))} /></label> {maskBlur}
        </div>
        <div style={{margin:'10px 0'}}>
          <div>Mask mode:</div>
          {MASK_MODES.map(opt => (
            <label key={opt.value} style={{marginRight:8}}>
              <input type="radio" name="maskMode" value={opt.value} checked={maskMode===opt.value} onChange={()=>setMaskMode(opt.value)} /> {opt.label}
            </label>
          ))}
        </div>
        <div style={{margin:'10px 0'}}>
          <div>Masked content:</div>
          {MASKED_CONTENTS.map(opt => (
            <label key={opt.value} style={{marginRight:8}}>
              <input type="radio" name="maskedContent" value={opt.value} checked={maskedContent===opt.value} onChange={()=>setMaskedContent(opt.value)} /> {opt.label}
            </label>
          ))}
        </div>
        <div style={{margin:'10px 0'}}>
          <div>Inpaint area:</div>
          {INPAINT_AREAS.map(opt => (
            <label key={opt.label} style={{marginRight:8}}>
              <input type="radio" name="inpaintArea" value={opt.value ? 'true' : 'false'} checked={inpaintArea===opt.value} onChange={()=>setInpaintArea(opt.value)} /> {opt.label}
            </label>
          ))}
        </div>
        <div style={{margin:'10px 0'}}>
          <label>Only masked padding, pixels: <input type="range" min={0} max={128} value={inpaintPadding} onChange={e=>setInpaintPadding(Number(e.target.value))} /></label> {inpaintPadding}
        </div>
        <label>Seed:
          <input type="number" value={seed} onChange={e=>setSeed(Number(e.target.value))} style={{width:100, marginLeft:8}} />
          <span style={{marginLeft:8, fontSize:12, color:'#888'}}>(-1 для случайного)</span>
        </label>
        <button type="submit" disabled={!image || !mask || !prompt || loading} style={{marginTop:12}}>
          {loading ? 'Генерация...' : 'Отправить на инпейнтинг'}
        </button>
      </form>
      {result && (
        <div style={{marginTop:20}}>
          <h3>Результат:</h3>
          <img src={`data:image/png;base64,${result}`} alt="result" style={{maxWidth:400}}/>
        </div>
      )}
    </div>
  );
}

export default App;
