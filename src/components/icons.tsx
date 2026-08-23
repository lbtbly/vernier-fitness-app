/**
 * The tab bar glyphs, lifted from .forge/wireframes/00-patterns.html so the
 * shipped shell and the approved wireframe draw the same five shapes.
 */
type IconProps = { className?: string };

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <rect x="3.4" y="4.6" width="17.2" height="16" rx="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.4 9.6h17.2M8 3.2v3M16 3.2v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function WaveIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        d="M2.5 12.5h4l2-5.5 3.6 11 2.4-7 1.5 1.5h5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DumbbellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        d="M4 9v6M7 7.2v9.6M17 7.2v9.6M20 9v6M7 12h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ForkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        d="M7 3v7M5 3v4.2a2 2 0 0 0 4 0V3M7 10v11M16.6 3c-1.8 2-1.8 6.4 0 8.4V21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GearIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2.6v3M12 18.4v3M21.4 12h-3M5.6 12h-3M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1M18.6 18.6l-2.1-2.1M7.5 7.5 5.4 5.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CloudOffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M15.4 15.2H5.6a3.6 3.6 0 0 1-.5-7.16A4.7 4.7 0 0 1 13 6.1a3.4 3.4 0 0 1 3.3 3.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function WarnIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path d="M10 3 18.2 17H1.8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8v3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="10" cy="14.3" r=".9" fill="currentColor" />
    </svg>
  );
}

/**
 * The gate glyphs, lifted from .forge/wireframes/01-sign-in.html so the shipped
 * screen and the approved wireframe draw the same shapes.
 */
export function LockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <rect x="4" y="8.6" width="12" height="8.4" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.8 8.6V6.4a3.2 3.2 0 0 1 6.4 0v2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function KeyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <circle cx="7.2" cy="7.2" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.8 9.8 16.4 16.4M13.6 13.6l-1.5 1.5M15.2 15.2l1.4 1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FaceIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M2.6 6.6V4.4a1.8 1.8 0 0 1 1.8-1.8h2.2M13.4 2.6h2.2a1.8 1.8 0 0 1 1.8 1.8v2.2M17.4 13.4v2.2a1.8 1.8 0 0 1-1.8 1.8h-2.2M6.6 17.4H4.4a1.8 1.8 0 0 1-1.8-1.8v-2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M7.2 8v1.6M12.8 8v1.6M7.4 13a4 4 0 0 0 5.2 0M10 8v3.2h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InfoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="6.2" r=".9" fill="currentColor" />
    </svg>
  );
}

export function OkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M4 10.5 8 14.5 16 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/*
 * The provenance and quick-log glyphs, lifted from
 * .forge/wireframes/00-patterns.html and 03-quick-log.html with the same
 * geometry, so the source chips on screen draw exactly what the sheets draw.
 */

export function ScaleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <rect x="2.6" y="4.6" width="14.8" height="11" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.6 11.4 10 8.2l3.4 3.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function HandIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M6.5 10V4.6a1.5 1.5 0 0 1 3 0V9M9.5 9V3.6a1.5 1.5 0 0 1 3 0V9M12.5 9V5.6a1.5 1.5 0 0 1 3 0v6.6a5 5 0 0 1-5 5H9.4a4 4 0 0 1-3.1-1.5L3.6 11.8a1.5 1.5 0 0 1 2.3-1.9L6.5 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DocIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path d="M5 2.5h6.5L16 7v10.5H5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11.2 2.6V7.2H15.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function SyncIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path d="M16.6 10a6.6 6.6 0 1 1-2-4.75" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M16.9 2.9v3.5h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SparkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M10 2.5 11.6 7 16 8.6 11.6 10.2 10 14.7 8.4 10.2 4 8.6 8.4 7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path d="M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Screen 03 frame 2's undo arrow, the same path .forge/wireframes/03-quick-log.html draws. */
export function UndoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M4 8.6h8.2a4.2 4.2 0 1 1 0 8.4H8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 5.6 4 8.6l3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M7.5 4.5 13 10l-5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Screen 05's three, lifted from .forge/wireframes/05-labs-review.html so the
 * shipped review and the approved sheet draw the same shapes. `aria-hidden`
 * like every other glyph here: the control around them carries the name, and a
 * title inside an svg would be a second spoken string with no key.
 */
export function EditIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M4 16.5h3.2l8.6-8.6-3.2-3.2L4 13.3v3.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M4.4 6h11.2M8 6V4.4h4V6M6 6l.7 10.4h6.6L14 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M10 2.6 16.4 5v5.4c0 3.6-2.6 6-6.4 7-3.8-1-6.4-3.4-6.4-7V5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7 10.2 9.2 12.4l4-4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The recipe box, on a line the box supplies. Chrome, never a colour. */
export function BoxIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M2.6 6.4 10 3l7.4 3.4v7.2L10 17l-7.4-3.4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M2.6 6.4 10 9.8l7.4-3.4M10 9.8V17" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** The cupboard, on a line already in stock. */
export function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <path
        d="M3.2 8.6 10 3.4l6.8 5.2V16a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 17v-4.4h4V17" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
