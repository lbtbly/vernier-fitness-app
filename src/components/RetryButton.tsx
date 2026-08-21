'use client';

export function RetryButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn primary block" onClick={() => window.location.reload()}>
      {label}
    </button>
  );
}
