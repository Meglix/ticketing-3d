import { expect, test } from '@playwright/test';
import { strings } from '../src/ui/strings.ts';
import {
  type DemoSeam,
  demoState,
  settle,
  skipIntro,
  tapFreeSeat,
  tapSector,
  trackErrors,
  waitForOverview,
  waitForScene,
  waitForSeat,
  waitForSector,
} from './helpers.ts';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

const point = (page: import('@playwright/test').Page, code: string) =>
  page.evaluate((c) => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo.sectorScreenPoint(c), code);

test('the tap that skips the intro selects nothing, even on a sector', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await waitForScene(page);
  await page.waitForTimeout(1500); // mid-intro
  const p = await point(page, '2C');
  expect(p, 'a sector is on screen during the intro').not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
  await waitForOverview(page);
  await page.waitForTimeout(400);
  const s = await demoState(page);
  expect(s.view).toBe('overview');
  expect(s.selectedSector).toBeNull();
  expect(errors).toEqual([]);
});

test('taps on other sectors while the camera is flying re-target it; the last tap wins, without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await skipIntro(page, false);
  // Tap 2C, then, once the camera is really in the air, tap whichever other
  // sector is visible *at that moment*, twice, like a user chasing a moving
  // view. Each tap is aimed and dispatched in the same page task: software
  // WebGL runs at ~2 fps here, so a point aimed in one frame is stale by the
  // next, and a fixed list of sectors may legitimately have flown out of view
  // (the camera covers ~50 m in one slow frame). The events are real
  // pointerdown/pointerup/click DOM events on the canvas, so they go through
  // R3F's raycasting and the app's handlers exactly like a user tap.
  const tapped = await page.evaluate(async () => {
    type Seam = DemoSeam & { cameraMode(): string; cameraPose(): { position: { x: number; y: number; z: number } } };
    const d = (window as unknown as { __clujDemo: Seam }).__clujDemo;
    const canvas = document.querySelector('canvas')!;
    const tap = (p: { x: number; y: number }) => {
      const init = { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      canvas.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
    };
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    const candidates = ['2M2', '1H', '2V', '1M1', '2H', '1V', '2D', '1D', '2B', '1B', '2O2', '2A1'];
    const done: string[] = [];
    const first = d.sectorScreenPoint('2C');
    if (!first) return done;
    tap(first);
    done.push('2C');
    for (let round = 0; round < 2; round++) {
      // Wait until the camera has actually moved in this flight.
      const before = d.cameraPose().position;
      for (let i = 0; i < 40; i++) {
        await frame();
        const now = d.cameraPose().position;
        if (d.cameraMode() === 'flying' && Math.hypot(now.x - before.x, now.y - before.y, now.z - before.z) > 0.5) break;
      }
      if (d.cameraMode() !== 'flying') break;
      const current = d.state().selectedSector;
      for (const code of candidates) {
        if (code === current || done.includes(code)) continue;
        const p = d.sectorScreenPoint(code);
        if (!p) continue;
        tap(p);
        done.push(code);
        break;
      }
    }
    return done;
  });
  expect(tapped.length, `taps made: ${tapped.join(', ')}`).toBeGreaterThanOrEqual(2);
  await page.waitForFunction(() => !(window as unknown as { __clujDemo: DemoSeam }).__clujDemo.state().inTransit, null, {
    timeout: 60_000,
  });
  const s = await demoState(page);
  expect(s.view).toBe('sector');
  expect(s.selectedSector).toBe(tapped[tapped.length - 1]);
  expect(errors).toEqual([]);
});

test('Escape mid-flight, corner sectors at the gaps, and the press box (view only, nothing for sale)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await skipIntro(page, false);
  await tapSector(page, '2A1', false); // corner sector at the gap
  await page.waitForTimeout(400); // mid-flight
  await page.keyboard.press('Escape');
  await waitForOverview(page);

  await tapSector(page, '2O2', false); // the other corner
  await waitForSector(page, '2O2');
  await tapFreeSeat(page, '2O2', false);
  await waitForSeat(page, '2O2');
  await settle(page);
  await page.screenshot({ path: 'screenshots/desktop-8-seat-corner-2O2.jpg', type: 'jpeg', quality: 90 });
  await page.keyboard.press('Escape');
  await waitForSector(page, '2O2');
  await page.keyboard.press('Escape');
  await waitForOverview(page);

  // Press box: the sector can be looked at, but no seat is for sale.
  await tapSector(page, '2P', false);
  await waitForSector(page, '2P');
  await expect(page.getByRole('region', { name: strings.sectorPanelLabel })).toContainText(strings.pressSector);
  expect(await page.evaluate(() => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo.availableSeat('2P'))).toBeNull();
  expect(errors).toEqual([]);
});

test('choosing another seat from the sector focus moves the gold seat and flies into it', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await skipIntro(page, false);
  await tapSector(page, '2M2', false);
  await waitForSector(page, '2M2');
  const first = await tapFreeSeat(page, '2M2', false);
  await waitForSeat(page, '2M2');
  expect((await demoState(page)).seatId).toBe(first);
  await page.getByRole('button', { name: strings.otherSeat }).click();
  await waitForSector(page, '2M2');
  expect((await demoState(page)).seatId).toBe(first); // still gold in the sector focus
  const second = await tapFreeSeat(page, '2M2', false, first);
  await waitForSeat(page, '2M2');
  expect(second).not.toBe(first);
  expect((await demoState(page)).seatId).toBe(second);
  expect(errors).toEqual([]);
});

test('the browser / phone back gesture goes up one level at a time instead of leaving', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await skipIntro(page, false);
  const start = page.url();
  await tapSector(page, '2M2', false);
  await waitForSector(page, '2M2');
  await tapFreeSeat(page, '2M2', false);
  await waitForSeat(page, '2M2');
  await page.goBack();
  await waitForSector(page, '2M2');
  await page.goBack();
  await waitForOverview(page);
  expect(page.url()).toBe(start);

  // Going up through the UI consumes the history entries: afterwards we're on a plain entry again.
  await tapSector(page, '2C', false);
  await waitForSector(page, '2C');
  await tapFreeSeat(page, '2C', false);
  await waitForSeat(page, '2C');
  await page.getByRole('button', { name: strings.otherSeat }).click();
  await waitForSector(page, '2C');
  await page.getByRole('button', { name: strings.allSectors }).click();
  await waitForOverview(page);
  await expect
    .poll(() => page.evaluate(() => (history.state as Record<string, unknown> | null)?.['cluj-demo-depth'] ?? null))
    .toBeNull();
  expect(errors).toEqual([]);
});
