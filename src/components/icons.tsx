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
