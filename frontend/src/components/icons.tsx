/**
 * Icon set — outline SVGs sized via the parent's font-size or explicit props.
 * All strokes inherit currentColor, which is how the nav-item active-state
 * tinting works without per-icon CSS rules.
 */

type Props = { size?: number; className?: string };

const Ico = ({
  size = 14,
  children,
  className,
}: Props & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {children}
  </svg>
);

export const IconBook = (p: Props) => (
  <Ico {...p}>
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </Ico>
);

export const IconUsers = (p: Props) => (
  <Ico {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </Ico>
);

export const IconClock = (p: Props) => (
  <Ico {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Ico>
);

export const IconMap = (p: Props) => (
  <Ico {...p}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0" />
    <circle cx="12" cy="10" r="3" />
  </Ico>
);

export const IconLink = (p: Props) => (
  <Ico {...p}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="18" r="3" />
    <path d="M9 6h6a3 3 0 0 1 3 3v6" />
  </Ico>
);

export const IconAlert = (p: Props) => (
  <Ico {...p}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Ico>
);

export const IconSearch = (p: Props) => (
  <Ico {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Ico>
);

export const IconChevron = (p: Props) => (
  <Ico {...p}>
    <path d="m6 9 6 6 6-6" />
  </Ico>
);

export const IconChat = (p: Props) => (
  <Ico {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Ico>
);

export const IconSettings = (p: Props) => (
  <Ico {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Ico>
);

export const IconPlus = (p: Props) => (
  <Ico {...p}>
    <path d="M12 5v14M5 12h14" />
  </Ico>
);

export const IconFile = (p: Props) => (
  <Ico {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </Ico>
);

export const IconArrow = (p: Props) => (
  <Ico {...p}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </Ico>
);

export const IconTrash = (p: Props) => (
  <Ico {...p}>
    <path d="M3 6h18M9 6v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6M10 11h4" />
  </Ico>
);

export const IconBox = (p: Props) => (
  <Ico {...p}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </Ico>
);

export const IconCheck = (p: Props) => (
  <Ico {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Ico>
);

export const IconSparkle = (p: Props) => (
  <Ico {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    <path d="M18 16l.6 1.8L20.5 18.5 18.7 19l-.7 1.9L17.3 19l-1.8-.5 1.8-.7z" />
  </Ico>
);
