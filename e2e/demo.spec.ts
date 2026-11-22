import { expect, test } from '@playwright/test';
import { strings } from '../src/ui/strings.ts';
import { settle, tapSector, trackErrors, waitForOverview, waitForSeat } from './helpers.ts';

const SEAT_PANEL = strings.panelLabel;

/** One sector per stand (plus both rings across the set). */
const SECTORS = [
  { stand: 'tribuna-I', code: '2C' },
  { stand: 'peluza-II', code: '1H' },
  { stand: 'tribuna-II', code: '2M2' },
  { stand: 'peluza-I', code: '2V' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'phone', width: 390, height: 844, touch: true },
];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      hasTouch: vp.touch,
      isMobile: vp.touch,
    });

    test('overview → tap a sector in each stand → seat view → back; fake checkout; no console errors', async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto('/?dpr=2'); // pinned: crisp screenshots (adaptive DPR would drop in software GL)
      await waitForOverview(page);
      await expect(page.getByText('Cluj Arena').first()).toBeVisible();
      await expect(page.getByText('Demo – geometrie aproximativă')).toBeVisible();
      await settle(page, 1500);
      await page.screenshot({ path: `screenshots/${vp.name}-overview.png` });

      for (const [i, { stand, code }] of SECTORS.entries()) {
        if (i > 0) {
          await page.getByRole('button', { name: 'Înapoi la stadion' }).click();
          await waitForOverview(page);
          await settle(page, 400);
        }
        await tapSector(page, code, vp.touch);
        await waitForSeat(page, code);
        await settle(page);
        // The seat panel (a labelled region) shows the selected sector code.
        const panel = page.getByRole('region', { name: SEAT_PANEL });
        await expect(panel).toBeVisible();
        await expect(panel.getByText(code, { exact: true })).toBeVisible();
        await page.screenshot({ path: `screenshots/${vp.name}-seat-${stand}-${code}.png` });
      }

      // Fake checkout from the last seat.
      await page.getByRole('button', { name: 'Cumpără' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Demo – fără plată reală')).toBeVisible();
      await settle(page, 300);
      await page.screenshot({ path: `screenshots/${vp.name}-checkout.png` });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      expect(errors).toEqual([]);
    });
  });
}
