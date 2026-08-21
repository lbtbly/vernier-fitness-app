export function ScreenTitle({ label, title, sub }: { label?: string; title: string; sub?: string }) {
  return (
    <header className="title">
      {label ? <span className="lbl">{label}</span> : null}
      <h1>{title}</h1>
      {sub ? <p className="sub">{sub}</p> : null}
    </header>
  );
}
