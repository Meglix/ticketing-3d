import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { strings } from '../src/ui/strings.ts';
import { type DemoSeam, trackErrors } from './helpers.ts';

/**
 * The whole flow as a video → screenshots/flow.webm (1440×900, 25 fps):
 * the intro (not skipped), a little orbit, a sector tap, seat hover, the
 * flight into a seat, looking around, the fake checkout, and back up both
 * levels.
 *
 * Headless Chromium renders WebGL in software here (~2 fps), so a real-time
 * recording is a slideshow. Instead the app runs in capture mode (`?capture`,
 * src/debug/capture.ts): its clock is virtual and this spec advances it by
 * 40 ms per frame, taking a screenshot after each rendered frame. Every frame
 * is the real app rendering the real flow with real pointer input; only time
 * is simulated, so the video shows the motion a GPU would show at 25 fps.
 */

const FPS = 25;
const FRAME_MS = 1000 / FPS;
const FRAMES_DIR = 'test-results/flow-frames';
const OUT = 'screenshots/flow.webm';

type Seam = DemoSeam;

/** Finds an ffmpeg with VP8: Playwright's own build (it records videos with it), else one on PATH. */
function findFfmpeg(): string | null {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', join(homedir(), '.cache', 'ms-playwright')];
  for (const root of roots) {
    if (!root || !existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => d.startsWith('ffmpeg'))) {
      for (const bin of ['ffmpeg-linux', 'ffmpeg-mac', 'ffmpeg-win64.exe']) {
        const p = join(root, dir, bin);
        if (existsSync(p)) return p;
      }
    }
  }
  return spawnSync('ffmpeg', ['-version']).status === 0 ? 'ffmpeg' : null;
}

test('flow video (1440x900, 25 fps, frame-accurate)', async ({ browser }) => {
  test.setTimeout(45 * 60_000);
  const ffmpeg = findFfmpeg();
  test.skip(!ffmpeg, 'no ffmpeg with VP8 available to encode the frames');
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = trackErrors(page);
  await page.goto('/?capture&dpr=1&quality=high');
  await page.waitForFunction(() => !!(window as unknown as { __capture?: unknown }).__capture, null, { polling: 100 });

  let n = 0;
  /** Advances the virtual clock by one frame (renders it) and saves it. */
  const frame = async (shoot = true) => {
    await page.evaluate((ms) => (window as unknown as { __capture: { step(ms: number): void } }).__capture.step(ms), FRAME_MS);
    if (shoot) {
      await page.screenshot({ path: join(FRAMES_DIR, `f${String(n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 });
      n++;
    }
  };
  const frames = async (count: number) => {
    for (let i = 0; i < count; i++) await frame();
  };
  const state = () =>
    page.evaluate(() => {
      const d = (window as unknown as { __clujDemo?: Seam }).__clujDemo;
      return d ? { ...d.state(), idle: d.cameraIdle() } : null;
    });
  /** Renders frames until `done(state)` holds (at most `max` frames). */
  const until = async (done: (s: NonNullable<Awaited<ReturnType<typeof state>>>) => boolean, max: number, what: string) => {
    for (let i = 0; i < max; i++) {
      const s = await state();
      if (s && done(s)) return;
      await frame();
    }
    throw new Error(`timed out (${max} frames) waiting for ${what}`);
  };
  const point = (fn: string, arg: string) =>
    page.evaluate(({ fn, arg }) => {
      const d = (window as unknown as { __clujDemo: Record<string, (a: string) => unknown> }).__clujDemo;
      return d[fn]!(arg) as { x: number; y: number } | string | null;
    }, { fn, arg });

  // First frames (shader compilation) are not recorded.
  for (let i = 0; i < 3; i++) await frame(false);
  await until((s) => s.sceneReady, 50, 'the first frame');

  // 1. The intro plays in full: floodlights power on while the camera orbits in.
  await until((s) => !s.introPlaying && s.idle, 9 * FPS, 'the end of the intro');
  await frames(FPS);

  // 2. A little orbit with the mouse.
  await page.mouse.move(900, 520);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(900 - i * 7, 520 - i * 0.6);
    await frame();
  }
  await page.mouse.up();
  await frames(Math.round(FPS * 0.8));

  // 3. Tap a sector → 3/4 sector focus.
  const sectorPoint = (await point('sectorScreenPoint', '1C')) as { x: number; y: number } | null;
  expect(sectorPoint).not.toBeNull();
  await page.mouse.move(sectorPoint!.x, sectorPoint!.y, { steps: 1 });
  await frames(Math.round(FPS * 0.6)); // hover highlight
  await page.mouse.click(sectorPoint!.x, sectorPoint!.y);
  await until((s) => s.view === 'sector' && !s.inTransit && s.idle, 4 * FPS, 'the sector focus');
  await frames(FPS);

  // 4. Hover a free seat, then tap it → gold, flight into the seat.
  const seatId = (await point('availableSeat', '1C')) as string | null;
  expect(seatId).not.toBeNull();
  const seatPoint = (await point('seatScreenPoint', seatId!)) as { x: number; y: number } | null;
  expect(seatPoint).not.toBeNull();
  await page.mouse.move(seatPoint!.x, seatPoint!.y, { steps: 1 });
  await frames(FPS);
  await page.mouse.click(seatPoint!.x, seatPoint!.y);
  await until((s) => s.view === 'seat' && !s.inTransit && s.idle, 5 * FPS, 'the seat view');
  await frames(FPS);

  // 5. Look around from the seat (drag), and back.
  await page.mouse.move(720, 400);
  await page.mouse.down();
  const look = [
    ...Array.from({ length: 22 }, (_, i) => [720 - (i + 1) * 12, 400 - (i + 1) * 0.8]),
    ...Array.from({ length: 40 }, (_, i) => [456 + (i + 1) * 13, 382 + (i + 1) * 0.9]),
    ...Array.from({ length: 22 }, (_, i) => [976 - (i + 1) * 11.6, 418 - (i + 1) * 0.8]),
  ];
  for (const [x, y] of look) {
    await page.mouse.move(x!, y!);
    await frame();
  }
  await page.mouse.up();
  await frames(Math.round(FPS * 0.6));

  // 6. Fake checkout.
  await page.getByRole('button', { name: strings.buy }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await frames(Math.round(FPS * 1.6));
  await page.keyboard.press('Escape');
  await frames(Math.round(FPS * 0.4));

  // 7. Back up: seat → sector (the seat stays gold) → overview.
  await page.getByRole('button', { name: strings.otherSeat }).click();
  await until((s) => s.view === 'sector' && !s.inTransit && s.idle, 4 * FPS, 'the way back to the sector');
  await frames(FPS);
  await page.getByRole('button', { name: strings.allSectors }).click();
  await until((s) => s.view === 'overview' && !s.inTransit && s.idle, 4 * FPS, 'the way back to the overview');
  await frames(Math.round(FPS * 1.5));
  await context.close();

  // Encode: JPEG frames → VP8 WebM at 25 fps.
  const files = readdirSync(FRAMES_DIR).filter((f) => f.endsWith('.jpg')).sort();
  const input = Buffer.concat(files.map((f) => readFileSync(join(FRAMES_DIR, f))));
  const res = spawnSync(
    ffmpeg!,
    ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
      '-c:v', 'libvpx', '-b:v', '1800k', '-qmin', '4', '-qmax', '40', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', OUT],
    { input, maxBuffer: 1 << 30 },
  );
  expect(res.status, String(res.stderr)).toBe(0);
  console.log(`flow video: ${files.length} frames (${(files.length / FPS).toFixed(1)} s at ${FPS} fps) → ${OUT}`);
  expect(errors).toEqual([]);
});
