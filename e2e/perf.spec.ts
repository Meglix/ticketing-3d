import { type Page, test } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { skipIntro, tapFreeSeat, tapSector, trackErrors, waitForSeat, waitForSector } from './helpers.ts';

/**
 * Frame rate per stage of the flow (overview, sector focus, seat view).
 *
 * Runs in headless Chromium with SwiftShader (CPU rasterisation), so the
 * absolute numbers are a floor, far below a real laptop/phone GPU; the
 * in-app `?fps` meter measures real hardware. What this does measure
 * reliably: main-thread CPU per frame (JS + WebGL command encoding, which
 * doesn't depend on the GPU), draw calls and triangles per stage, and which
 * adaptive quality level the app settles on.
 *
 * Two runs per viewport: pinned to the top quality (the cost of the full
 * look) and adaptive (what a slow device actually gets).
 */

interface Sample {
  fps: number;
  frames: number;
  p95Ms: number;
  worstMs: number;
}

async function measure(page: Page, ms: number): Promise<Sample> {
  return page.evaluate(
    (ms) =>
      new Promise<Sample>((resolve) => {
        const deltas: number[] = [];
        let last = performance.now();
        const start = last;
        const tick = (now: number) => {
          deltas.push(now - last);
          last = now;
          if (now - start < ms) requestAnimationFrame(tick);
          else {
            const sorted = [...deltas].sort((a, b) => a - b);
            resolve({
              fps: Number(((deltas.length * 1000) / (now - start)).toFixed(1)),
              frames: deltas.length,
              p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)]!.toFixed(1)),
              worstMs: Number(sorted[sorted.length - 1]!.toFixed(1)),
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

const RUNS = [
  { name: 'laptop-1440x900-high', width: 1440, height: 900, dpr: 1, query: '?dpr=1&quality=high', touch: false },
  { name: 'laptop-1440x900-adaptive', width: 1440, height: 900, dpr: 1, query: '', touch: false },
  { name: 'phone-390x844-adaptive', width: 390, height: 844, dpr: 2, query: '', touch: true },
];

for (const run of RUNS) {
  test(`FPS per stage: ${run.name}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: run.width, height: run.height },
      deviceScaleFactor: run.dpr,
      hasTouch: run.touch,
      isMobile: run.touch,
    });
    const page = await context.newPage();
    const errors = trackErrors(page);
    await page.goto(`/${run.query}`);
    await skipIntro(page, run.touch);

    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const metric = async (name: string) =>
      ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === name)?.value ?? 0) * 1000;

    const stage = async () => {
      await page.waitForTimeout(2500); // warm-up: shader compile, adaptive quality settling
      const [task0, script0] = [await metric('TaskDuration'), await metric('ScriptDuration')];
      const sample = await measure(page, 4000);
      const [task1, script1] = [await metric('TaskDuration'), await metric('ScriptDuration')];
      const renderer = await page.evaluate(() => window.__renderInfo?.() ?? null);
      const quality = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.stage');
        return { tier: el?.dataset.quality ?? null, dpr: Number(el?.dataset.dpr ?? NaN) };
      });
      return {
        ...sample,
        cpu: {
          mainThreadMsPerFrame: Number(((task1 - task0) / sample.frames).toFixed(2)),
          scriptMsPerFrame: Number(((script1 - script0) / sample.frames).toFixed(2)),
        },
        quality,
        renderer,
      };
    };

    const result: Record<string, unknown> = {};
    result.overview = await stage();
    await tapSector(page, '1C', run.touch);
    await waitForSector(page, '1C');
    result.sector = await stage();
    await tapFreeSeat(page, '1C', run.touch);
    await waitForSeat(page, '1C');
    result.seat = await stage();

    const gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    });
    const file = 'screenshots/metrics.json';
    const metrics = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    metrics[run.name] = { ...result, gpu, measuredAt: new Date().toISOString() };
    writeFileSync(file, JSON.stringify(metrics, null, 2) + '\n');
    console.log(run.name, JSON.stringify(metrics[run.name]));
    if (errors.length) throw new Error(errors.join('\n'));
    await context.close();
  });
}
