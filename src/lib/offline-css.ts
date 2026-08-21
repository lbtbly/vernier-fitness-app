/**
 * The stylesheet the offline document carries inside itself.
 *
 * It is a copy, on purpose. The offline screen is the one screen that has to
 * render when nothing else can be fetched, so it may not depend on a
 * stylesheet, a font file, a script or a chunk. A <link> to the app's
 * stylesheet would be one more request that fails exactly when this document
 * is needed. The tokens are section 3 of .forge/DESIGN.md, the same source
 * globals.css copies from, and the rules below are the subset of globals.css
 * that this one document uses. Change a token in DESIGN.md and both files
 * follow it.
 */
export const OFFLINE_CSS = `
:root{
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --t-display: 30px; --t-display-lh: 33px; --t-display-ls: -.02em;
  --t-body: 15px; --t-body-lh: 20px;
  --t-sub: 13px; --t-sub-lh: 19px;
  --t-label: 11px; --t-label-lh: 14px; --t-label-ls: .06em;
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:20px;
  --r-md:12px; --r-lg:16px; --r-full:999px;
  --touch:44px;
  --dur-fast:120ms; --dur:200ms;
  --ease: cubic-bezier(.2,.6,.2,1);
  --tabbar-h:49px;
  --tabbar-pad:max(8px, env(safe-area-inset-bottom));
  --gutter:16px;
}

html[data-theme=dark]{
  color-scheme: dark;
  --bg:#0A0A0B; --surface:#141416; --surface-2:#1C1C1F;
  --line:#2A2A2E; --line-2:#3A3A40;
  --text:#F5F5F7; --text-2:#A1A1A8; --text-3:#7C7C85;
  --accent:#5AA9FF; --accent-ink:#08080A;
  --focus:#8FC4FF;
}

html[data-theme=light]{
  color-scheme: light;
  --bg:#F2F2F5; --surface:#FFFFFF; --surface-2:#EDEDF1;
  --line:#DCDCE2; --line-2:#C6C6CE;
  --text:#101013; --text-2:#4A4A52; --text-3:#6B6B73;
  --accent:#0A6CD0; --accent-ink:#FFFFFF;
  --focus:#0A4C93;
}

*{box-sizing:border-box;margin:0;padding:0}

html,body{background:var(--bg);color:var(--text)}

body{
  font-family:var(--font);
  font-size:var(--t-body);
  line-height:var(--t-body-lh);
  -webkit-font-smoothing:antialiased;
  text-size-adjust:100%;
  overscroll-behavior-y:contain;
}

.app{min-height:100dvh;display:flex;flex-direction:column}

.app-scroll{
  flex:1;
  padding-top:max(var(--s2), env(safe-area-inset-top));
  padding-bottom:calc(var(--tabbar-h) + var(--tabbar-pad) + var(--s5));
  padding-left:max(var(--gutter), env(safe-area-inset-left));
  padding-right:max(var(--gutter), env(safe-area-inset-right));
  max-width:720px;
  width:100%;
  margin:0 auto;
}

.tabbar{
  position:fixed;
  inset:auto 0 0 0;
  height:calc(var(--tabbar-h) + var(--tabbar-pad));
  padding:0 6px var(--tabbar-pad);
  padding-left:max(6px, env(safe-area-inset-left));
  padding-right:max(6px, env(safe-area-inset-right));
  display:flex;
  background:var(--surface);
  border-top:1px solid var(--line);
  z-index:20;
}

.tabbar a{
  flex:1;
  min-width:var(--touch);
  min-height:var(--touch);
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:3px;
  color:var(--text-3);
  text-decoration:none;
  font-size:10px;
  line-height:1.2;
  letter-spacing:.01em;
}

.tabbar svg{width:24px;height:24px}

.title{padding:var(--s1) 0 var(--s3)}
.title h1{font-size:var(--t-display);line-height:var(--t-display-lh);letter-spacing:var(--t-display-ls);font-weight:700}

.lbl{
  font-size:var(--t-label);
  line-height:var(--t-label-lh);
  letter-spacing:var(--t-label-ls);
  text-transform:uppercase;
  color:var(--text-3);
  font-weight:600;
  display:block;
}

.sub{font-size:var(--t-sub);line-height:var(--t-sub-lh);color:var(--text-2)}

.card{
  background:var(--surface);
  border:1px solid var(--line);
  border-radius:var(--r-lg);
  padding:var(--s4);
  margin-bottom:var(--s3);
}

.actions{display:flex;gap:var(--s2);flex-wrap:wrap;margin-top:var(--s3)}
.grow{flex:1;min-width:0}

.banner{
  display:flex;
  gap:10px;
  align-items:flex-start;
  padding:11px 12px;
  border-radius:var(--r-md);
  font-size:var(--t-sub);
  line-height:1.45;
  margin-bottom:var(--s3);
  border:1px solid var(--line);
  background:var(--surface-2);
  color:var(--text);
}
.banner svg{width:18px;height:18px;flex:none;margin-top:1px;color:var(--text-2)}

.btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:var(--s2);
  min-height:var(--touch);
  padding:0 var(--s4);
  border-radius:var(--r-md);
  border:1px solid var(--line-2);
  background:var(--surface-2);
  color:var(--text);
  font:inherit;
  font-size:var(--t-body);
  font-weight:500;
  cursor:pointer;
  text-decoration:none;
  transition:opacity var(--dur-fast) var(--ease);
}
.btn:active{opacity:.7}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}
.btn.block{width:100%}

a:focus-visible,button:focus-visible,[tabindex]:focus-visible{
  outline:2px solid var(--focus);
  outline-offset:2px;
}

@media (prefers-reduced-motion: reduce){
  *{transition-duration:1ms !important}
}
`;
