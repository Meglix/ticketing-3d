import { test } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { trackErrors, waitForOverview } from './helpers.ts';

/**
 * Measures the overview frame rate with all 30,335 seats rendered.
 * Runs in headless Chromium with SwiftShader (CPU rasterisation), so the
 * numbers are a floor; the in-app `?fps` meter measures real hardware.
 */
for (const dpr of [1, 2]) {
  test(`overview FPS at 1440x900, devicePixelRatio ${dpr}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const errors = trackErrors(page);
    await page.goto('/');
    await waitForOverview(page);
    await page.waitForTimeout(2000); // warm-up (shader compile, label layout)
    // Main-thread CPU time per frame (JS + WebGL command encoding), which is
    // independent of how fast the (software) GPU rasterises.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const metric = async (name: string) =>
      ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === name)?.value ?? 0) * 1000;
    const [task0, script0] = [await metric('TaskDuration'), await metric('ScriptDuration')];
    const result = await page.evaluate(
      () =>
        new Promise<{ fps: number; frames: number; worstMs: number; p95Ms: number }>((resolve) => {
          const deltas: number[] = [];
          let last = performance.now();
          const start = last;
          const tick = (now: number) => {
            deltas.push(now - last);
            last = now;
            if (now - start < 5000) requestAnimationFrame(tick);
            else {
              const sorted = [...deltas].sort((a, b) => a - b);
              resolve({
                fps: (deltas.length * 1000) / (now - start),
                frames: deltas.length,
                worstMs: sorted[sorted.length - 1]!,
                p95Ms: sorted[Math.floor(sorted.length * 0.95)]!,
              });
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    const [task1, script1] = [await metric('TaskDuration'), await metric('ScriptDuration')];
    const cpu = {
      mainThreadMsPerFrame: Number(((task1 - task0) / result.frames).toFixed(2)),
      scriptMsPerFrame: Number(((script1 - script0) / result.frames).toFixed(2)),
    };
    const info = await page.evaluate(() => window.__renderInfo?.() ?? null);
    const gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    });
    const file = 'screenshots/metrics.json';
    const metrics = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    metrics[`overview_dpr${dpr}`] = { ...result, cpu, renderer: info, gpu, measuredAt: new Date().toISOString() };
    writeFileSync(file, JSON.stringify(metrics, null, 2) + '\n');
    console.log(`DPR ${dpr}:`, JSON.stringify(metrics[`overview_dpr${dpr}`]));
    if (errors.length) throw new Error(errors.join('\n'));
    await context.close();
  });
}
