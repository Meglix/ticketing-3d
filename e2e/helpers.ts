import { expect, type Page } from '@playwright/test';

export interface DemoState {
  view: 'overview' | 'sector' | 'seat';
  inTransit: boolean;
  selectedSector: string | null;
  seatId: string | null;
  hoveredSeat: string | null;
  checkoutOpen: boolean;
  sceneReady: boolean;
  introPlaying: boolean;
}

/** The test seam installed by src/interaction (typed locally so e2e does not depend on app globals). */
export interface DemoSeam {
  state(): DemoState;
  /** False during the intro and during flights. */
  cameraIdle(): boolean;
  sectorScreenPoint(code: string): { x: number; y: number } | null;
  /** Where a real tap selects that seat in the sector focus (verified against the canvas and the pick mesh). */
  seatScreenPoint(seatId: string): { x: number; y: number } | null;
  /** A free (demo availability) seat of the sector that a tap can reach from the current view, or null. */
  availableSeat(code: string, except?: string): string | null;
}

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

/** Waits for the first rendered frame (the intro is then playing). */
export async function waitForScene(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const d = (window as unknown as { __clujDemo?: DemoSeam }).__clujDemo;
    return !!d && d.state().sceneReady;
  }, null, { timeout: 120_000, polling: 250 });
}

/**
 * Waits until the intro is over and the camera rests in the overview.
 * `cameraIdle()` matters: the intro moves the camera without being a store
 * "transit", and a tap point projected during it goes stale.
 */
export async function waitForOverview(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const d = (window as unknown as { __clujDemo?: DemoSeam }).__clujDemo;
    if (!d) return false;
    const s = d.state();
    return s.sceneReady && !s.introPlaying && s.view === 'overview' && !s.inTransit && d.cameraIdle();
  }, null, { timeout: 120_000, polling: 250 });
}

async function waitForView(page: Page, view: DemoState['view'], code: string): Promise<void> {
  await page.waitForFunction(
    ({ view, code }) => {
      const d = (window as unknown as { __clujDemo?: DemoSeam }).__clujDemo;
      const s = d?.state();
      return !!s && s.view === view && !s.inTransit && s.selectedSector === code && d!.cameraIdle();
    },
    { view, code },
    { timeout: 120_000, polling: 250 },
  );
}

export const waitForSector = (page: Page, code: string) => waitForView(page, 'sector', code);
export const waitForSeat = (page: Page, code: string) => waitForView(page, 'seat', code);

/** Taps (touch) or clicks (mouse) a point, after checking it lands on the 3D canvas and not on UI. */
async function tapCanvas(page: Page, point: { x: number; y: number }, touch: boolean, what: string): Promise<void> {
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? null, point);
  expect(hit, `the tap point of ${what} must land on the 3D canvas, not on UI`).toBe('CANVAS');
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

/** Skips the intro with a tap/click on the middle of the screen, then waits for the overview. */
export async function skipIntro(page: Page, touch: boolean): Promise<void> {
  await waitForScene(page);
  const size = page.viewportSize()!;
  await tapCanvas(page, { x: size.width / 2, y: size.height / 2 }, touch, 'the intro');
  await waitForOverview(page);
}

/**
 * Taps a sector the way a user would: projects the sector's seat area to the
 * screen (test seam from src/interaction) and taps there with a real pointer.
 */
export async function tapSector(page: Page, code: string, touch: boolean): Promise<void> {
  const point = await page.evaluate((c) => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo.sectorScreenPoint(c), code);
  expect(point, `sector ${code} should be on screen`).not.toBeNull();
  await tapCanvas(page, point!, touch, `sector ${code}`);
}

/** In the sector focus: finds a free seat of the sector (other than `except`) and taps it with a real pointer. Returns its id. */
export async function tapFreeSeat(page: Page, code: string, touch: boolean, except?: string): Promise<string> {
  const id = await page.evaluate(
    ({ c, e }) => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo.availableSeat(c, e),
    { c: code, e: except },
  );
  expect(id, `sector ${code} should have a free seat that a tap can reach`).not.toBeNull();
  const point = await page.evaluate((s) => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo.seatScreenPoint(s), id!);
  expect(point, `seat ${id} should be on screen`).not.toBeNull();
  await tapCanvas(page, point!, touch, `seat ${id}`);
  return id!;
}

/** Moves the mouse over a free seat of the focused sector (desktop hover). Returns its id. */
export async function hoverFreeSeat(page: Page, code: string): Promise<string> {
  const id = await page.evaluate((c) => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo.availableSeat(c), code);
  expect(id, `sector ${code} should have a free seat on screen`).not.toBeNull();
  const point = await page.evaluate((s) => (window as unknown as { __clujDemo: DemoSeam }).__clujDemo.seatScreenPoint(s), id!);
  expect(point, `seat ${id} should be on screen`).not.toBeNull();
  await page.mouse.move(point!.x, point!.y, { steps: 4 });
  return id!;
}

/** Lets a couple of frames render after the camera stops so screenshots are settled. */
export async function settle(page: Page, ms = 600): Promise<void> {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}
