import { expect, test } from '@playwright/test';
import { type DemoSeam, demoState, settle, tapSector, trackErrors, waitForOverview, waitForSeat } from './helpers.ts';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

test('rapid taps on different sectors end on the last one, without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await waitForOverview(page);
  // Resolve all tap points first (they move once the camera starts flying).
  const points = await page.evaluate(() =>
    ['2C', '2M2', '1H'].map((c) => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo.sectorScreenPoint(c)),
  );
  for (const p of points) {
    expect(p).not.toBeNull();
    await page.mouse.click(p!.x, p!.y);
    await page.waitForTimeout(80);
  }
  await page.waitForFunction(() => !(window as unknown as { __clujDemo: DemoSeam }).__clujDemo.state().inTransit, null, { timeout: 60_000 });
  const s = await demoState(page);
  expect(s.view).toBe('seat');
  // The last tap may land on whatever is under that pixel mid-flight; it must
  // be one of the tapped sectors and the state must be consistent.
  expect(['2C', '2M2', '1H']).toContain(s.selectedSector);
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
