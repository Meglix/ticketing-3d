import { expect, test } from '@playwright/test';
import { strings } from '../src/ui/strings.ts';
import {
  demoState,
  hoverFreeSeat,
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

/**
 * The V2 three-level flow, with real pointer taps on the canvas:
 *   intro → overview → tap a sector → sector focus → tap a free seat → seat view
 *   → Cumpără (fake checkout) → Alt loc (back to the sector, seat stays gold)
 *   → Toate sectoarele (overview); then one sector of every other stand.
 * Screenshots of each stage land in screenshots/<viewport>-<n>-<stage>.png.
 */

/** One more sector per stand (both rings across the set). 1C (Tribuna I, VIP) is the main walk-through. */
const MORE = [
  { stand: 'tribuna-II', code: '2M2' },
  { stand: 'peluza-II', code: '1H' },
  { stand: 'peluza-I', code: '2V' },
];

// Desktop at DPR 1 (1440x900 px images), phone at its real DPR 2. Software
// WebGL is slow, and the film grain makes PNGs incompressible: JPEG stills.
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1, touch: false },
  { name: 'phone', width: 390, height: 844, dpr: 2, touch: true },
];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dpr,
      hasTouch: vp.touch,
      isMobile: vp.touch,
    });

    test('intro → overview → sector focus → seat view → checkout → back at every level; no console errors', async ({ page }) => {
      test.setTimeout(600_000);
      const errors = trackErrors(page);
      const shot = (n: number, stage: string) =>
        page.screenshot({ path: `screenshots/${vp.name}-${n}-${stage}.jpg`, type: 'jpeg', quality: 90 });
      // DPR and quality pinned: the stills show the full look (adaptive quality would step down in software GL).
      await page.goto(`/?dpr=${vp.dpr}&quality=high`);

      // 1. Intro: the title card shows while the floodlights come on; a tap skips it.
      await waitForScene(page);
      await expect(page.getByText(strings.introSkip)).toBeVisible();
      await page.waitForTimeout(2500);
      await shot(1, 'intro');
      await skipIntro(page, vp.touch);
      expect((await demoState(page)).view).toBe('overview'); // the skipping tap selects nothing

      // 2. Overview: luminous model, stand names, legend, hint; no per-sector price pills.
      await expect(page.getByText('Cluj Arena').first()).toBeVisible();
      await expect(page.getByText('Demo – geometrie aproximativă')).toBeVisible();
      await expect(page.getByText(/un sector pentru a vedea priveliștea/)).toBeVisible();
      await expect(page.getByText('Prețuri demo')).toBeVisible();
      await expect(page.locator('.stand-label').first()).toBeVisible();
      await settle(page, 1200);
      await shot(2, 'overview');

      // 3. Sector focus: 3/4 view of 1C, free/total, legend of seat states.
      await tapSector(page, '1C', vp.touch);
      await waitForSector(page, '1C');
      await settle(page);
      const sectorBar = page.getByRole('region', { name: strings.sectorPanelLabel });
      await expect(sectorBar).toBeVisible();
      await expect(sectorBar.getByText('1C', { exact: true })).toBeVisible();
      await expect(sectorBar.getByText(/locuri libere din/)).toBeVisible();
      await shot(3, 'sector');
      if (!vp.touch) {
        // Desktop hover: the seat lights up and a tooltip names row, seat and price.
        const hovered = await hoverFreeSeat(page, '1C');
        await expect.poll(async () => (await demoState(page)).hoveredSeat).toBe(hovered);
        await expect(page.getByRole('tooltip')).toContainText('Rând');
        await settle(page, 300);
        await shot(3, 'sector-hover');
      }

      // 4. Seat view: tap a free seat → it turns gold and the camera flies into it.
      const seatId = await tapFreeSeat(page, '1C', vp.touch);
      await waitForSeat(page, '1C');
      expect((await demoState(page)).seatId).toBe(seatId);
      await settle(page, 900);
      const seatBar = page.getByRole('region', { name: strings.panelLabel });
      await expect(seatBar).toBeVisible();
      await expect(seatBar).toContainText('Tribuna I');
      await expect(seatBar).toContainText('Sector 1C');
      await expect(seatBar).toContainText(/Rând \d+/);
      await expect(seatBar).toContainText(/Loc \d+/);
      await expect(seatBar).toContainText('150 lei');
      await shot(4, 'seat');

      // 5. Fake checkout.
      await page.getByRole('button', { name: strings.buy }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(strings.checkoutDemoBanner)).toBeVisible();
      await settle(page, 300);
      await shot(5, 'checkout');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      // Back one level: the sector focus again, the chosen seat stays gold.
      await page.getByRole('button', { name: strings.otherSeat }).click();
      await waitForSector(page, '1C');
      expect((await demoState(page)).seatId).toBe(seatId);
      await settle(page);
      await shot(6, 'sector-with-gold-seat');
      // And up to the overview.
      await sectorBar.getByRole('button', { name: strings.allSectors }).click();
      await waitForOverview(page);

      // Every other stand: sector → seat → back with Escape (desktop) / the UI (phone).
      for (const { stand, code } of MORE) {
        await settle(page, 300);
        await tapSector(page, code, vp.touch);
        await waitForSector(page, code);
        await tapFreeSeat(page, code, vp.touch);
        await waitForSeat(page, code);
        await settle(page);
        await expect(page.getByRole('region', { name: strings.panelLabel }).getByText(code, { exact: true })).toBeVisible();
        await shot(7, `seat-${stand}-${code}`);
        if (vp.touch) {
          await page.getByRole('button', { name: strings.otherSeat }).click();
          await waitForSector(page, code);
          await page.getByRole('button', { name: strings.allSectors }).click();
        } else {
          await page.keyboard.press('Escape');
          await waitForSector(page, code);
          await page.keyboard.press('Escape');
        }
        await waitForOverview(page);
      }

      expect(errors).toEqual([]);
    });
  });
}
