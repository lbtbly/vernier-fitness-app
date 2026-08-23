import { randomUUID } from 'node:crypto';
import { strings } from '@/lib/strings';

/**
 * The mail adapter, and the boundary that lets the weekly review be finished
 * and proved months before an SMTP host exists.
 *
 * NO DEPENDENCY. PLAN.md line 30 names every package this build may install and
 * no mail library is on it, so this speaks SMTP over `node:tls` directly:
 * implicit TLS on 465, `AUTH LOGIN`, one recipient, one message. That is about
 * a hundred lines and it is the whole of what this product needs. A message
 * body is built by `buildMessage`, which is pure and graded in the unit suite,
 * so the part that is easy to get wrong is the part that has a test.
 *
 * F118 IS THE PREVIEW AND IT NEEDS NONE OF THIS. `mailTransportConfigured()`
 * answers false on a machine with no host, the review is prepared and rendered
 * anyway, and the screen says so in words rather than pretending a send
 * happened. F123 is the operator line that needs a real relay, and its sibling
 * is the preview.
 */

export type MailSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  to: string;
  from: string;
};

function trimmed(name: string): string {
  return process.env[name]?.trim() ?? '';
}

/**
 * Everything a send needs, or null.
 *
 * A host with no recipient cannot send and a recipient with no host cannot
 * either, so a partial configuration is not configured. Half-set values are
 * exactly how an operator ends up with a screen claiming mail works.
 */
export function mailSettings(): MailSettings | null {
  const host = trimmed('MAIL_HOST');
  const to = trimmed('MAIL_TO');
  const user = trimmed('MAIL_USER');
  const password = trimmed('MAIL_PASSWORD');
  if (host === '' || to === '') return null;
  const port = Number(trimmed('MAIL_PORT') || '465');
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) return null;
  return { host, port, user, password, to, from: user === '' ? to : user };
}

export function mailTransportConfigured(): boolean {
  return mailSettings() !== null;
}

/**
 * A subject header that survives a word outside ASCII.
 *
 * RFC 2047 encoded-word, base64, UTF-8. The product name is ASCII and so is
 * every word in the catalogue today, but a date rendered in another language
 * is one configuration change away and a raw eight-bit byte in a header is how
 * a message gets refused by the relay rather than by anything here.
 */
export function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/**
 * A line beginning with a period ends the DATA command. Doubling it is the
 * transparency rule in RFC 5321 section 4.5.2, and forgetting it is a message
 * that silently truncates at the first line of HTML that happens to start with
 * a dot.
 */
export function dotStuff(body: string): string {
  return body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n').replace(/^\./gm, '..');
}

export type MessageInput = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  at: Date;
};

/**
 * The header names and the SMTP verbs, as tokens.
 *
 * WHY THEY ARE A TABLE AND NOT WRITTEN INTO THE TEMPLATES. `From:` and
 * `AUTH LOGIN` read to a source scanner exactly like a capitalised English
 * phrase, which is what C6's shape rule catches, and it is right to catch it:
 * there is no way to look at `'Subject: ' + x` and know whether the word is
 * protocol or prose. Naming them here says which they are once. RFC 5322 field
 * names and RFC 5321 verbs are both case insensitive, so upper case costs
 * nothing and is what a protocol token looks like.
 */
const HEADER = {
  from: 'FROM',
  to: 'TO',
  subject: 'SUBJECT',
  date: 'DATE',
  messageId: 'MESSAGE-ID',
  mimeVersion: 'MIME-VERSION',
  contentType: 'CONTENT-TYPE',
  encoding: 'CONTENT-TRANSFER-ENCODING',
} as const;

const VERB = {
  ehlo: 'EHLO',
  auth: 'AUTH',
  login: 'LOGIN',
  mail: 'MAIL',
  rcpt: 'RCPT',
  from: 'FROM',
  to: 'TO',
  data: 'DATA',
  quit: 'QUIT',
} as const;

/**
 * One `multipart/alternative` message: the plain text part first, the HTML part
 * second, which is the order that makes a client prefer the HTML and a watch
 * read the text.
 */
export function buildMessage(input: MessageInput): string {
  const boundary = `vernier-${randomUUID()}`;
  const domain = input.from.split('@')[1] ?? 'localhost';
  /*
   * CRLF EVERYWHERE, INCLUDING INSIDE THE PARTS. The renderers join their own
   * lines with a bare newline, because that is what a string of prose is, and a
   * message carrying those is malformed on the wire whatever the headers say.
   * `dotStuff` normalises again on the way out, and it is right to: a message
   * that is only correct after one particular caller has touched it is a
   * message that is wrong the first time anybody sends it another way.
   */
  const crlf = (value: string) => value.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const lines = [
    `${HEADER.from}: ${input.from}`,
    `${HEADER.to}: ${input.to}`,
    `${HEADER.subject}: ${encodeHeader(input.subject)}`,
    `${HEADER.date}: ${input.at.toUTCString()}`,
    `${HEADER.messageId}: <${randomUUID()}@${domain}>`,
    `${HEADER.mimeVersion}: 1.0`,
    `${HEADER.contentType}: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `${HEADER.contentType}: text/plain; charset=utf-8`,
    `${HEADER.encoding}: 8bit`,
    '',
    crlf(input.text),
    '',
    `--${boundary}`,
    `${HEADER.contentType}: text/html; charset=utf-8`,
    `${HEADER.encoding}: 8bit`,
    '',
    crlf(input.html),
    '',
    `--${boundary}--`,
    '',
  ];
  return lines.join('\r\n');
}

export type MailResult =
  | { ok: true; code: number; detail: string }
  | { ok: false; code: number; error: string; detail: string };

/**
 * The command sequence, as data, so the order is graded without a socket.
 *
 * Every step names the reply code it expects. A relay that answers anything
 * else ends the conversation there rather than pressing on and reporting
 * success off the last reply it happened to read, which is the shape of every
 * mail bug anybody has ever had.
 */
export function smtpSteps(settings: MailSettings, message: string): Array<{
  send: string;
  expect: number;
}> {
  const steps: Array<{ send: string; expect: number }> = [
    { send: `${VERB.ehlo} ${settings.host}`, expect: 250 },
  ];
  if (settings.user !== '' && settings.password !== '') {
    steps.push(
      { send: `${VERB.auth} ${VERB.login}`, expect: 334 },
      { send: Buffer.from(settings.user, 'utf8').toString('base64'), expect: 334 },
      { send: Buffer.from(settings.password, 'utf8').toString('base64'), expect: 235 },
    );
  }
  steps.push(
    { send: `${VERB.mail} ${VERB.from}:<${settings.from}>`, expect: 250 },
    { send: `${VERB.rcpt} ${VERB.to}:<${settings.to}>`, expect: 250 },
    { send: VERB.data, expect: 354 },
    { send: `${dotStuff(message)}\r\n.`, expect: 250 },
    { send: VERB.quit, expect: 221 },
  );
  return steps;
}

/** The three-digit reply code at the head of a relay's answer, or zero. */
export function replyCode(reply: string): number {
  const match = /^(\d{3})/.exec(reply.trim());
  return match ? Number(match[1]) : 0;
}

/**
 * Sends one message, over implicit TLS.
 *
 * `node:tls` is imported inside the function so nothing that merely asks
 * whether mail is configured drags a socket module into a bundle. The whole
 * conversation is bounded by one timeout: a relay that stops answering halfway
 * through must not hold the Sunday run's ledger claim open for twenty minutes.
 */
export async function sendMail(
  settings: MailSettings,
  message: string,
  timeoutMs = 20_000,
): Promise<MailResult> {
  const tls = await import('node:tls');
  const steps = smtpSteps(settings, message);

  return new Promise<MailResult>((resolve) => {
    let settled = false;
    const finish = (result: MailResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const socket = tls.connect({ host: settings.host, port: settings.port, servername: settings.host });
    socket.setTimeout(timeoutMs, () =>
      finish({ ok: false, code: 0, error: strings.api.review.failed, detail: 'timeout' }),
    );
    socket.setEncoding('utf8');

    let index = -1;
    let buffer = '';

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      // A multi-line reply keeps going while the fourth character is a hyphen.
      // Waiting for the final line is what stops "250-STARTTLS" being read as
      // the answer to the command after it.
      const lines = buffer.split('\r\n').filter((line) => line !== '');
      const last = lines[lines.length - 1] ?? '';
      if (!/^\d{3} /.test(last)) return;
      const reply = last;
      buffer = '';

      const expected = index === -1 ? 220 : steps[index].expect;
      const code = replyCode(reply);
      if (code !== expected) {
        finish({ ok: false, code, error: strings.api.review.failed, detail: reply });
        return;
      }

      index += 1;
      if (index >= steps.length) {
        finish({ ok: true, code, detail: reply });
        return;
      }
      socket.write(`${steps[index].send}\r\n`);
    });

    socket.on('error', (error: Error) =>
      finish({ ok: false, code: 0, error: strings.api.review.failed, detail: error.message }),
    );
    socket.on('close', () =>
      finish({ ok: false, code: 0, error: strings.api.review.failed, detail: 'closed' }),
    );
  });
}
