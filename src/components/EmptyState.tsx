import Link from 'next/link';

/**
 * The empty state from .forge/wireframes/00-patterns.html, frame 1, state 3:
 * dashed card, a title naming what is absent, one sentence saying what to do,
 * one primary action. No illustration, ever.
 */
export function EmptyState({
  label,
  title,
  body,
  actionLabel,
  actionHref,
}: {
  label: string;
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <div className="card empty">
      <span className="lbl">{label}</span>
      <div className="head">{title}</div>
      <p className="sub">{body}</p>
      <div className="actions">
        <Link prefetch={false} className="btn primary block" href={actionHref}>
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
