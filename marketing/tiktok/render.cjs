/**
 * Renderiza un guion HTML a un MP4 vertical 1080x1920 listo para TikTok.
 *
 *   NODE_PATH=$(npm root -g) node marketing/tiktok/render.cjs <archivo.html>
 *
 * Cada fotograma se pinta llamando a renderFrame(t) dentro de la página,
 * así que la salida es determinista: mismo HTML -> mismo video.
 * Los PNG se envían directo a ffmpeg por stdin (no tocan el disco).
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const W = 1080;
const H = 1920;
const FPS = 30;

const input = process.argv[2];
if (!input) {
  console.error('Uso: node render.cjs <guion.html>');
  process.exit(1);
}
const HTML = path.resolve(input);
const OUT = process.env.OUT || HTML.replace(/\.html$/, '.mp4');

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  return 'ffmpeg'; // debe estar en PATH y traer libx264
}

const write = (stream, buf) =>
  stream.write(buf) ? Promise.resolve() : new Promise(r => stream.once('drain', r));

(async () => {
  const browser = await chromium.launch({
    args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'],
  });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });

  await page.goto('file://' + HTML);
  await page.waitForFunction(() => typeof window.renderFrame === 'function');
  await page.evaluate(() => document.fonts.ready);

  const duration = await page.evaluate(() => window.VIDEO_DURATION);
  const frames = Math.round(duration * FPS);

  const ffmpeg = spawn(findFfmpeg(), [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(FPS),
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-level', '4.1',
    '-movflags', '+faststart',
    OUT,
  ], { stdio: ['pipe', 'inherit', 'pipe'] });

  let ffErr = '';
  ffmpeg.stderr.on('data', d => { ffErr += d.toString(); });
  const done = new Promise((resolve, reject) => {
    ffmpeg.on('close', code =>
      code === 0 ? resolve() : reject(new Error('ffmpeg salió con ' + code + '\n' + ffErr.slice(-2000))));
  });

  console.log(`Renderizando ${frames} fotogramas (${duration}s @ ${FPS}fps)…`);
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.renderFrame(t), (i / FPS) * 1000);
    const buf = await page.screenshot({ type: 'png' });
    await write(ffmpeg.stdin, buf);
    if (i % 60 === 0) process.stdout.write(`  ${i}/${frames}\n`);
  }
  ffmpeg.stdin.end();
  await done;
  await browser.close();

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`\n✅ ${OUT}  (${kb} KB · ${W}x${H} · ${duration}s)`);
})().catch(e => { console.error(e); process.exit(1); });
