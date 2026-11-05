/** One stroke icon set for the whole app (24-unit grid, round caps), matching the designs. */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  activity: "M3 12h4l3-7 4 14 3-7h4",
  settings:
    "M4 7h10M18 7h2M4 17h2M10 17h10M16 5a2 2 0 1 0 0 4 2 2 0 1 0 0-4M8 15a2 2 0 1 0 0 4 2 2 0 1 0 0-4",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "m5 12 5 5 9-10",
  close: "M6 6l12 12M18 6 6 18",
  back: "m15 18-6-6 6-6",
  chevron: "m9 18 6-6-6-6",
  chevronDown: "m7 10 5 5 5-5",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14M20 20l-3.5-3.5",
  userPlus: "M9 4a4 4 0 1 0 0 8 4 4 0 1 0 0-8M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6",
  message: "M4 5h16v11H9l-5 4z",
  phone:
    "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  calendar:
    "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M3 10h18M8 3v4M16 3v4",
  sort: "m7 15 5 5 5-5M7 9l5-5 5 5",
  lock: "M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1M8 11V8a4 4 0 0 1 8 0v3",
  key: "M7 11a4 4 0 1 0 0 8 4 4 0 1 0 0-8M10 13.5 20 4M16 8l3 3M18 6l2 2",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  alert: "M12 7v6M12 17h.01",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 11v5M12 8h.01",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z",
  scale: "M12 4v16M8 20h8M5 8h14M12 4l-1 4h2zM5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z",
  eyeOff:
    "M3 3l18 18M10.6 6.1Q11.3 6 12 6c5 0 9 6 9 6a16 16 0 0 1-2.6 3.2M6.6 6.6A16 16 0 0 0 3 12s4 6 9 6a9 9 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  cloud: "M7 18a5 5 0 0 1-.9-9.9A6 6 0 0 1 17.7 9 4.5 4.5 0 0 1 17.5 18z",
  offline:
    "M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18",
  backspace: "M21 5H9l-6 7 6 7h12zM16 9l-5 6M11 9l5 6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
