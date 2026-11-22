/**
 * Small inline SVG icons (no icon library). All are decorative: callers
 * provide the accessible text next to them.
 */
type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

/** A generic stadium mark (our own drawing: a bowl around a pitch; not a venue or club logo). */
export function StadiumMark({ size = 32, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable={false}>
      <ellipse cx="16" cy="16" rx="14.5" ry="10.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />
      <ellipse cx="16" cy="16" rx="10" ry="6.8" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
      <rect x="10.5" y="12.2" width="11" height="7.6" rx="1" fill="#3fa56b" />
      <line x1="16" y1="12.2" x2="16" y2="19.8" stroke="#ffffff" strokeWidth="0.8" opacity="0.85" />
    </svg>
  );
}

export function ChevronDown({ size = 18, className }: IconProps) {
  return (
    <svg className={className} {...base(size)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function CloseIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} {...base(size)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function MinusIcon({ size = 18, className }: IconProps) {
  return (
    <svg className={className} {...base(size)}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function PlusIcon({ size = 18, className }: IconProps) {
  return (
    <svg className={className} {...base(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckIcon({ size = 28, className }: IconProps) {
  return (
    <svg className={className} {...base(size)} strokeWidth={2.4}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ArrowLeft({ size = 18, className }: IconProps) {
  return (
    <svg className={className} {...base(size)}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function TicketIcon({ size = 18, className }: IconProps) {
  return (
    <svg className={className} {...base(size)}>
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="2 2" />
    </svg>
  );
}

/** Horizontal drag / look-around gesture. */
export function DragIcon({ size = 16, className }: IconProps) {
  return (
    <svg className={className} {...base(size)}>
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M3 12h18" />
    </svg>
  );
}

export function TapIcon({ size = 16, className }: IconProps) {
  return (
    <svg className={className} {...base(size)}>
      <circle cx="12" cy="9" r="3" />
      <path d="M12 12v8M8.5 4.5a5 5 0 0 1 7 0" />
    </svg>
  );
}

export function WheelchairIcon({ size = 16, className }: IconProps) {
  return (
    <svg className={className} {...base(size)}>
      <circle cx="11" cy="4" r="1.6" />
      <path d="M11 6.5v6h5.5l2.5 5.5" />
      <path d="M11 9.5h4" />
      <path d="M8 10.2a5.5 5.5 0 1 0 7.6 6.3" />
    </svg>
  );
}

export function InfoIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
