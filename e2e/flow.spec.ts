import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { strings } from '../src/ui/strings.ts';
import {
  hoverFreeSeat,
  settle,
  tapFreeSeat,
  tapSector,
  trackErrors,
  waitForOverview,
  waitForScene,
  waitForSeat,
  waitForSector,
} from './helpers.ts';

/**
 * A screen recording of the whole flow → screenshots/flow.webm:
 * the full intro (not skipped), overview orbit, hover, sector focus, seat
 * hover, the flight into a seat, looking around, the fake checkout, and back
 * up both levels. Recorded from headless Chromium with software WebGL
 * (SwiftShader), so it plays at a lower frame rate than a real GPU would.
 */
test('flow video (1440x900)', async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync('test-results/video', { recursive: true });
  const size = { width: 1440, height: 900 };
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: 'test-results/video', size } });
  const page = await context.newPage();
  const errors = trackErrors(page);
  await page.goto('/?dpr=1');
  await waitForScene(page);
  await waitForOverview(page); // the whole intro plays
  await settle(page, 1200);

  // Orbit a little (drag), then hover a sector.
  await page.mouse.move(900, 500);
  await page.mouse.down();
  await page.mouse.move(700, 470, { steps: 25 });
  await page.mouse.up();
  await settle(page, 1200);

  // Sector focus.
  await tapSector(page, '1C', false);
  await waitForSector(page, '1C');
  await settle(page, 1500);
  await hoverFreeSeat(page, '1C');
  await settle(page, 1500);

  // Into the seat, look around.
  await tapFreeSeat(page, '1C', false);
  await waitForSeat(page, '1C');
  await settle(page, 1500);
  await page.mouse.move(720, 400);
  await page.mouse.down();
  await page.mouse.move(420, 380, { steps: 30 });
  await page.mouse.move(1000, 420, { steps: 40 });
  await page.mouse.move(720, 400, { steps: 25 });
  await page.mouse.up();
  await settle(page, 1000);

  // Fake checkout.
  await page.getByRole('button', { name: strings.buy }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await settle(page, 2000);
  await page.keyboard.press('Escape');
  await settle(page, 600);

  // Back: seat → sector → overview.
  await page.getByRole('button', { name: strings.otherSeat }).click();
  await waitForSector(page, '1C');
  await settle(page, 1200);
  await page.getByRole('button', { name: strings.allSectors }).click();
  await waitForOverview(page);
  await settle(page, 1500);

  const video = page.video()!;
  await context.close();
  await video.saveAs('screenshots/flow.webm');
  expect(errors).toEqual([]);
});
