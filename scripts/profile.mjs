#!/usr/bin/env node
/**
 * Perfil de custo por subsistema: desliga um grupo de objetos por vez e mede o
 * tempo de GPU de N quadros (render síncrono + readPixels). Uso:
 *   node scripts/profile.mjs [--quality medium] [--headed]
 */
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]?.startsWith('--') || !arr[i + 1] ? true : arr[i + 1]] : null)).filter(Boolean));
const server = await createServer({ logLevel: 'error', server: { port: 5197, strictPort: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: !args.headed, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${server.resolvedUrls.local[0]}?harness`);
await page.waitForFunction(() => Boolean(window.__harness));
await page.evaluate((q) => window.__harness.setup({ quality: q }), args.quality ?? 'medium');
await page.evaluate(() => window.__harness.simulate(8));
const result = await page.evaluate(() => {
  const st = window.__game.get();
  const gl = st.gl;
  const ctx = gl.getContext();
  const px = new Uint8Array(4);
  const frame = () => {
    const t0 = performance.now();
    for (let i = 0; i < 20; i += 1) st.advance(st.clock.elapsedTime + 1e-4);
    ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    return +((performance.now() - t0) / 20).toFixed(2);
  };
  const groups = {
    outlines: (o) => o.isMesh && o.material?.uniforms?.uThickness !== undefined,
    sky: (o) => o.isMesh && o.material?.uniforms?.uBandColors !== undefined,
    instanced: (o) => o.isInstancedMesh && o.material?.uniforms?.uThickness === undefined,
    track: (o) => o.isMesh && !o.isInstancedMesh && o.geometry?.type === 'BufferGeometry' && o.geometry.getAttribute('position')?.count > 20000,
  };
  const all = [];
  st.scene.traverse((o) => all.push(o));
  frame(); frame(); // aquecimento: compilação e upload de buffers
  const out = { base: frame(), calls: gl.info.render.calls, tris: gl.info.render.triangles };
  for (const [name, test] of Object.entries(groups)) {
    const hit = all.filter(test);
    hit.forEach((o) => (o.visible = false));
    out[`${name}Off`] = frame();
    out[`${name}Count`] = hit.length;
    hit.forEach((o) => (o.visible = true));
  }
  out.baseAgain = frame();
  return out;
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
await server.close();
