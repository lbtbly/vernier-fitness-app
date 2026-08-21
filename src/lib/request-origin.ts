/**
 * Where a request arrived from, read off the headers Tailscale Serve actually
 * sends. Not guessed: a probe server was put behind a second serve proxy on
 * this machine on 2026-08-22 and a request through the HTTPS name arrived with
 * exactly these, and a request straight to the loopback port arrived with none
 * of them.
 *
 *   Tailscale-Headers-Info: https://tailscale.com/s/serve-headers
 *   Tailscale-User-Login:   <the tailnet user's email address>
 *   Tailscale-User-Name:    <the tailnet user's display name>
 *   Tailscale-User-Profile-Pic: <a URL>
 *   X-Forwarded-For:        100.65.127.62
 *   X-Forwarded-Host:       lamberts-mac-mini.tailda76d6.ts.net:8443
 *   X-Forwarded-Proto:      https
 *
 * THIS IS EVIDENCE OF ORIGIN, NEVER A CREDENTIAL. The BRIEF is explicit that
 * Tailscale is the network barrier and never the authentication, so nothing
 * here may gate access, open a session or enter an authorization decision. A
 * later slice adding the passkey gate must not read this file to decide who
 * anyone is: a header can be set by any client that reaches the port, and the
 * three Tailscale-User-* headers are identity, which is exactly why this
 * function never returns them and nothing ever stores them.
 */
export type RequestOrigin = {
  viaTailscale: boolean;
  peerAddress: string | null;
};

export function readRequestOrigin(headers: Headers): RequestOrigin {
  // The one header Tailscale sends to say the headers above are its own. Its
  // presence marks the proxy hop, and marks nothing else.
  const viaTailscale = headers.has('tailscale-headers-info');

  // A forwarded list has the client first. There is exactly one proxy in front
  // of this app, so in practice the list is one address long.
  const forwarded = headers.get('x-forwarded-for');
  const peerAddress = forwarded?.split(',')[0]?.trim() || null;

  return { viaTailscale, peerAddress: peerAddress && peerAddress.length <= 64 ? peerAddress : null };
}
