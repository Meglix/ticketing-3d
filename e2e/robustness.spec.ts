import { expect, test } from '@playwright/test';
import { type DemoSeam, demoState, settle, tapSector, trackErrors, waitForOverview, waitForSeat } from './helpers.ts';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

test('rapid taps on different sectors (within ~300 ms) end on the last one tapped, without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await waitForOverview(page);
  // Each tap targets the sector where it is on screen *now* (the camera is
  // already flying after the first tap), like a user chasing a moving view.
  const tapped: string[] = [];
  for (const code of ['2C', '2M2', '1H']) {
    const p = await page.evaluate(
      (c) => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo.sectorScreenPoint(c),
      code,
    );
    if (!p) continue; // not visible from the moving camera at this instant
    await page.mouse.click(p.x, p.y);
    tapped.push(code);
    await page.waitForTimeout(80);
  }
  expect(tapped.length).toBeGreaterThanOrEqual(2);
  await page.waitForFunction(() => !(window as unknown as { __clujDemo: DemoSeam }).__clujDemo.state().inTransit, null, {
    timeout: 60_000,
  });
  const s = await demoState(page);
  expect(s.view).toBe('seat');
  expect(s.selectedSector).toBe(tapped[tapped.length - 1]);
  expect(s.seatId?.startsWith(`${s.selectedSector}-`)).toBe(true);
  expect(errors).toEqual([]);
});

test('back to overview mid-flight, Escape, and edge (corner) sectors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await waitForOverview(page);
  await tapSector(page, '2A1', false); // corner sector at the gap
  await page.waitForTimeout(400); // mid-flight
  await page.keyboard.press('Escape');
  await waitForOverview(page);
  await tapSector(page, '2O2', false); // other corner
  await waitForSeat(page, '2O2');
  await settle(page);
  await page.screenshot({ path: 'screenshots/desktop-seat-corner-2O2.png' });
  await page.keyboard.press('Escape');
  await waitForOverview(page);
  // Press sector: view allowed, purchase not.
  await tapSector(page, '2P', false);
  await waitForSeat(page, '2P');
  await expect(page.getByRole('button', { name: 'Cumpără' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('the browser / phone back gesture returns from a seat to the overview instead of leaving', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await waitForOverview(page);
  const start = page.url();
  await tapSector(page, '2M2', false);
  await waitForSeat(page, '2M2');
  await page.goBack();
  await waitForOverview(page);
  expect(page.url()).toBe(start);
  // Leaving through the UI consumes the history entry: the next back leaves the app.
  await tapSector(page, '2C', false);
  await waitForSeat(page, '2C');
  await page.getByRole('button', { name: 'Înapoi la stadion' }).click();
  await waitForOverview(page);
  // The seat entry was popped, so we're back on a plain (non-seat) history entry.
  await expect
    .poll(() => page.evaluate(() => (history.state as Record<string, unknown> | null)?.['cluj-demo-seat'] ?? null))
    .toBeNull();
  expect(errors).toEqual([]);
});
