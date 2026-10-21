// Lucide glyphs (ISC license), inlined at 1.25px stroke per the brand system.
const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const LocateIcon = () => (
  <svg {...base}>
    <line x1="2" x2="5" y1="12" y2="12" />
    <line x1="19" x2="22" y1="12" y2="12" />
    <line x1="12" x2="12" y1="2" y2="5" />
    <line x1="12" x2="12" y1="19" y2="22" />
    <circle cx="12" cy="12" r="7" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const ArrowUpRight = () => (
  <svg {...base} width={16} height={16} strokeWidth={2}>
    <path d="M7 7h10v10" />
    <path d="M7 17 17 7" />
  </svg>
);

export const ArrowDownRight = () => (
  <svg {...base} width={16} height={16} strokeWidth={2}>
    <path d="m7 7 10 10" />
    <path d="M17 7v10H7" />
  </svg>
);

export const Dash = () => (
  <svg {...base} width={16} height={16} strokeWidth={2}>
    <path d="M5 12h14" />
  </svg>
);
