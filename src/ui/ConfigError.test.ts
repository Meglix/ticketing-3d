import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import raw from '../../venues/cluj-arena.json';
import { parseVenueConfig } from '../venue/validate.ts';
import { ConfigError } from './ConfigError.tsx';

describe('ConfigError page', () => {
  it('shows the Romanian title and the validator messages', () => {
    const broken = structuredClone(raw) as { capacity: { total: number } };
    broken.capacity.total = 1;
    let error: unknown;
    try {
      parseVenueConfig(broken);
    } catch (e) {
      error = e;
    }
    const html = renderToStaticMarkup(createElement(ConfigError, { error }));
    expect(html).toContain('Configurația locației este invalidă');
    expect(html).toContain('capacity.total is 1 but the rows add up to 30335');
    expect(html).toContain('role="alert"');
  });
});
