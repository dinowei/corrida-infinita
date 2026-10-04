#!/usr/bin/env node
/**
 * Harness de screenshots e desempenho (Playwright + Chrome instalado).
 *
 *   node scripts/harness.mjs shoot [opções]   captura quadros num momento exato
 *   node scripts/harness.mjs perf  [opções]   mede frame time real numa janela visível
 *
 * Opções comuns:
 *   --mode circuit|infinite   --vehicle gtr|aurora|vespa   --weather clear|rain
 *   --quality low|medium|high --size 1280x720             --url http://...
 *   --headed                  (shoot: abre janela visível; perf sempre é visível)
 * shoot:
 *   --at 8,20                 segundos de corrida (simulação em passo fixo, determinística)
 *   --views chase,side,front,rear,top,wide,low
 *   --out shots/<nome>        pasta de saída (padrão shots/latest)
 * perf:
 *   --seconds 20 --warmup 4   duração da medição e aquecimento
 *
 * Sem --url o script sobe um servidor Vite próprio numa porta livre.
 * O painel de preview embutido do editor limita a animação a ~25 FPS e não
 * serve como medida; este harness usa uma aba de Chrome real e visível.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const [, , command = 'shoot', ...rest] = process.argv;
const args = {};
for (let i = 0; i < rest.length; i += 1) {
  const key = rest[i].replace(/^--/, '');
  const next = rest[i + 1];
  if (!next || next.startsWith('--')) args[key] = true;
  else {
    args[key] = next;
    i += 1;
  }
}

const [width, height] = String(args.size ?? '1280x720').split('x').map(Number);
const config = {
  mode: args.mode ?? 'circuit',
  vehicle: args.vehicle ?? 'gtr',
  weather: args.weather ?? 'clear',
  quality: args.quality ?? 'medium',
};

async function startServer() {
  if (args.url) return { url: String(args.url), close: async () => {} };
  const server = await createServer({ logLevel: 'error', server: { port: 5199, strictPort: false } });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5199/';
  return { url, close: () => server.close() };
}

async function openGame(url, headed) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !headed,
    args: [
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--use-angle=d3d11',
      // Sem isso o Chrome reduz rAF de janelas que perdem o foco.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // favicon.ico ausente gera um 404 inofensivo.
    if (m.type() === 'error' && !m.location().url.endsWith('favicon.ico')) errors.push(m.text());
  });
  await page.goto(`${url}?harness`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__harness), null, { timeout: 30_000 });
  // Esconde só a interface de menu durante o carregamento; o HUD fica visível.
  await page.evaluate((c) => window.__harness.setup(c), config);
  return { browser, page, errors };
}

async function gpuInfo(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'desconhecida';
  });
}

async function shoot() {
  const server = await startServer();
  const { browser, page, errors } = await openGame(server.url, Boolean(args.headed));
  const out = path.resolve(String(args.out ?? 'shots/latest'));
  await mkdir(out, { recursive: true });
  const moments = String(args.at ?? '10').split(',').map(Number);
  const views = String(args.views ?? 'chase,side,front,wide').split(',');
  const manifest = { config, gpu: await gpuInfo(page), size: `${width}x${height}`, shots: [] };
  let elapsed = 0;
  for (const t of moments) {
    const info = await page.evaluate((s) => window.__harness.simulate(s), Math.max(0, t - elapsed));
    elapsed = t;
    for (const view of views) {
      await page.evaluate((v) => window.__harness.view(v), view);
      const file = path.join(out, `${config.mode}-${config.vehicle}-${config.weather}-${config.quality}-t${t}-${view}.png`);
      await page.screenshot({ path: file });
      manifest.shots.push({ file: path.relative(process.cwd(), file), t, view, info });
      console.log('📸', path.relative(process.cwd(), file));
    }
  }
  manifest.errors = errors;
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (errors.length) console.warn('⚠ erros no console:', errors.slice(0, 5));
  await browser.close();
  await server.close();
}

async function perf() {
  const server = await startServer();
  const { browser, page, errors } = await openGame(server.url, true);
  const seconds = Number(args.seconds ?? 20);
  const warmup = Number(args.warmup ?? 4);
  await page.bringToFront();
  await page.evaluate(() => window.__harness.drive(true));
  await page.waitForTimeout(warmup * 1000);
  const result = await page.evaluate((ms) => window.__harness.measure(ms), seconds * 1000);
  const info = await page.evaluate(() => window.__harness.info());
  const report = { config, gpu: await gpuInfo(page), size: `${width}x${height}`, seconds, ...result, scene: info, errors };
  console.log(JSON.stringify(report, null, 2));
  const out = path.resolve(String(args.out ?? 'shots/perf'));
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, `perf-${config.mode}-${config.quality}-${config.weather}.json`), JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}

const run = command === 'perf' ? perf : shoot;
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
