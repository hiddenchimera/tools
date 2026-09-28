/**
 * FFmpeg.wasm ローダーモジュール（シングルスレッド版）
 * CDN外部WorkerのCORS制約を回避するため、workerURLも含めてBlob化してロードします。
 */
import { FFmpeg } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
import { toBlobURL } from 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js';

let ffmpegInstance = null;

export async function getFFmpeg(onProgress) {
  if (ffmpegInstance) {
    if (onProgress) {
      ffmpegInstance.on('progress', onProgress);
    }
    return ffmpegInstance;
  }

  const ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });
  
  if (onProgress) {
    ffmpeg.on('progress', onProgress);
  }

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  const ffmpegBaseURL = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm';

  // workerURL, coreURL, wasmURL をすべて Blob URL に変換して渡す
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    workerURL: await toBlobURL(`${ffmpegBaseURL}/worker.js`, 'text/javascript')
  });

  ffmpegInstance = ffmpeg;
  return ffmpegInstance;
}
