/**
 * FFmpeg.wasm ローダーモジュール（シングルスレッド版）
 * GitHub Pages等の静的ホスティングでCOOP/COEPヘッダー不要で動作します。
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
  
  if (onProgress) {
    ffmpeg.on('progress', onProgress);
  }

  // シングルスレッド版のWasmコアをCDNからロード
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
  });

  ffmpegInstance = ffmpeg;
  return ffmpegInstance;
}
