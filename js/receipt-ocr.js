// レシートの写真から文字を読み取る（端末の中で処理。画像はどこにも送りません）
// 文字認識には Tesseract.js（日本語データ）を使います。初回だけ約6MBを読み込みます。

const OCR_CDN = {
  script: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
  langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/jpn@1.0.0/4.0.0_best_int',
};

let ocrWorkerPromise = null;

function loadScriptOnce(src) {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('文字認識のプログラムを読み込めませんでした。'));
    document.head.appendChild(s);
  });
}

async function getOcrWorker(onProgress) {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      await loadScriptOnce(OCR_CDN.script);
      const worker = await Tesseract.createWorker('jpn', 1, {
        workerPath: OCR_CDN.workerPath,
        corePath: OCR_CDN.corePath,
        langPath: OCR_CDN.langPath,
        logger: (m) => { if (ocrWorkerPromise.onProgress) ocrWorkerPromise.onProgress(m); },
      });
      return worker;
    })();
    ocrWorkerPromise.catch(() => { ocrWorkerPromise = null; });
  }
  ocrWorkerPromise.onProgress = onProgress;
  return ocrWorkerPromise;
}

// 読み取りやすくするために、白黒にして大きさとコントラストを整える
function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const target = 1600;
      const scale = Math.min(2.5, target / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const d = data.data;
      // 明るさの平均から、紙（白）と文字（黒）を分ける
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      const avg = sum / (d.length / 4);
      const th = avg * 0.82;
      for (let i = 0; i < d.length; i += 4) {
        const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const v = g < th ? Math.max(0, g * 0.6) : Math.min(255, 255 - (255 - g) * 0.3);
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(data, 0, 0);
      URL.revokeObjectURL(url);
      resolve({ canvas: c, preview: c.toDataURL('image/jpeg', 0.6) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を開けませんでした。')); };
    img.src = url;
  });
}

// 日本語の文字のあいだに入るよけいな空白を取る
function cleanOcrText(text) {
  const J = '[\\u3040-\\u30ff\\u3400-\\u9fff\\uff66-\\uff9fー・]';
  return String(text)
    .replace(new RegExp(`(${J})[ \\t]+(?=${J})`, 'g'), '$1')
    .replace(new RegExp(`(${J})[ \\t]+(?=${J})`, 'g'), '$1')
    .replace(/[ \t]+(?=[¥￥\\])/g, ' ')
    .replace(/[\\]\s?(?=\d)/g, '¥')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

async function readReceiptImage(file, onProgress) {
  onProgress({ stage: 'prepare', pct: 0 });
  const { canvas, preview } = await prepareImage(file);
  onProgress({ stage: 'load', pct: 0, preview });
  const worker = await getOcrWorker((m) => {
    if (m.status === 'recognizing text') onProgress({ stage: 'read', pct: Math.round(m.progress * 100), preview });
    else onProgress({ stage: 'load', pct: Math.round((m.progress || 0) * 100), preview });
  });
  const { data } = await worker.recognize(canvas);
  return { text: cleanOcrText(data.text), preview };
}
