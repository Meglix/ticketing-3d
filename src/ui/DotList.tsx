import type { ReactNode } from 'react';

/**
 * "A · B · C" that wraps cleanly on narrow screens: a separator never dangles
 * at the end or the start of a line (CSS: ui.css → .ui-dots). Falsy items are
 * skipped; `trailing` is appended without a separator (e.g. a hint).
 */
export function DotList({ className, items, trailing }: { className: string; items: ReactNode[]; trailing?: ReactNode }) {
  return (
    <p className={`${className} ui-dots`}>
      <span className="ui-dots__row">
        {items.filter(Boolean).map((item, i) => (
          <span key={i} className="ui-dots__item">
            {item}
          </span>
        ))}
        {trailing ? <span className="ui-dots__item ui-dots__item--plain">{trailing}</span> : null}
      </span>
    </p>
  );
}
