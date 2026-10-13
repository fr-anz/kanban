const paths = {
  panel: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  board: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 8v8M15 8v5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  edit: <><path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-3-3L5 16l-1 4Z" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  tag: <><path d="M3 4h8l10 10-7 7L3 10V4Z" /><circle cx="7.5" cy="8" r="1" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  device: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  grip: <><path d="M9 5h.1M15 5h.1M9 12h.1M15 12h.1M9 19h.1M15 19h.1" strokeWidth="3" /></>,
  arrowLeft: <path d="m14 6-6 6 6 6" />,
  arrowRight: <path d="m10 6 6 6-6 6" />,
} as const;

export default function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
