import { expect, type Page } from '@playwright/test';

export interface DemoState {
  view: 'overview' | 'seat';
  inTransit: boolean;
  selectedSector: string | null;
  seatId: string | null;
  checkoutOpen: boolean;
  sceneReady: boolean;
}

/** The test seam installed by src/interaction (typed locally so e2e does not depend on app globals). */
export interface DemoSeam {
  state(): DemoState;
  sectorScreenPoint(code: string): { x: number; y: number } | null;
}
export const seam = (): DemoSeam => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo;

/** Collects console errors and uncaught exceptions for a page. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

export async function demoState(page: Page): Promise<DemoState> {
  return page.evaluate(() => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo.state());
}

/** Waits until the scene has rendered and the camera is idle in the overview. */
export async function waitForOverview(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const d = (window as unknown as { __clujDemo?: DemoSeam }).__clujDemo;
    if (!d) return false;
    const s = d.state();
    return s.sceneReady && s.view === 'overview' && !s.inTransit;
  }, null, { timeout: 120_000 });
}

export async function waitForSeat(page: Page, code: string): Promise<void> {
  await page.waitForFunction(
    (c) => {
      const s = (window as unknown as { __clujDemo?: DemoSeam }).__clujDemo?.state();
      return !!s && s.view === 'seat' && !s.inTransit && s.selectedSector === c;
    },
    code,
    { timeout: 120_000 },
  );
}

/**
 * Taps a sector the way a user would: projects the sector's seat area to the
 * screen (test seam from src/interaction) and taps there with a real pointer.
 */
export async function tapSector(page: Page, code: string, touch: boolean): Promise<void> {
  const point = await page.evaluate((c) => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo.sectorScreenPoint(c), code);
  expect(point, `sector ${code} should be on screen`).not.toBeNull();
  const { x, y } = point!;
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? null, { x, y });
  expect(hit, `the tap point of ${code} must land on the 3D canvas, not on UI`).toBe('CANVAS');
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Lets a couple of frames render after the camera stops so screenshots are settled. */
export async function settle(page: Page, ms = 600): Promise<void> {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}
