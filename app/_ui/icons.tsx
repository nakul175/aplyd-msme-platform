// Small inline icons: no icon font, no request. Each is decorative (aria-hidden); the words next to it carry the meaning.
type P = { className?: string };
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

export const Check = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const Arrow = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const Lock = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </svg>
);
export const Layers = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
);
export const Eye = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const Coin = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9h6M9 12h6M11 9c3 0 3 6-1 6l4 0" />
  </svg>
);

/** The mark: a rounded square with an A and a marigold spark. Colours come from the theme. */
export function Logo({ className }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable={false}>
      <rect width="32" height="32" rx="8" style={{ fill: "var(--brand)" }} />
      <path d="M9 23.5L16 8l7 15.5M12 18.5h8" fill="none" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--brand-fg)" }} />
      <circle cx="24.2" cy="8.2" r="2.4" style={{ fill: "var(--turn)" }} />
    </svg>
  );
}
