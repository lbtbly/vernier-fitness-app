/**
 * A client with its own cookie jar.
 *
 * Tests that check what a Set-Cookie says, or that talk to the scratch instance
 * over plain loopback HTTP, need to see and control every cookie rather than
 * let a browser apply its own rules to them. The session cookie is Secure, as
 * F11 requires, and a browser is right to refuse to send it over HTTP; this
 * client says exactly what it was told to say, which is what makes it useful
 * for measuring the gate rather than the browser.
 */
export type ApiResponse = {
  status: number;
  headers: Headers;
  setCookie: string[];
  body: Record<string, unknown>;
  text: string;
};

export function apiClient(baseUrl: string) {
  const jar = new Map<string, string>();
  let lastSetCookie: string[] = [];

  function cookieHeader(): string {
    return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  function absorb(response: Response) {
    lastSetCookie = response.headers.getSetCookie();
    for (const line of lastSetCookie) {
      const pair = line.split(';')[0];
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '') jar.delete(name);
      else jar.set(name, value);
    }
  }

  async function shape(response: Response): Promise<ApiResponse> {
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = {};
    }
    return { status: response.status, headers: response.headers, setCookie: lastSetCookie, body, text };
  }

  return {
    cookie: (name: string) => jar.get(name),
    async get(path: string): Promise<ApiResponse> {
      const response = await fetch(`${baseUrl}${path}`, {
        redirect: 'manual',
        headers: { cookie: cookieHeader() },
      });
      absorb(response);
      return shape(response);
    },
    async post(
      path: string,
      body: unknown,
      options: { csrf?: boolean; csrfValue?: string } = {},
    ): Promise<ApiResponse> {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        cookie: cookieHeader(),
      };
      if (options.csrf !== false) {
        headers['x-vernier-csrf'] = options.csrfValue ?? jar.get('vernier_csrf') ?? '';
      }
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        redirect: 'manual',
        headers,
        body: JSON.stringify(body ?? {}),
      });
      absorb(response);
      return shape(response);
    },
  };
}
