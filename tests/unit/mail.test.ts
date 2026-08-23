import { describe, expect, test } from 'vitest';
import {
  buildMessage,
  dotStuff,
  encodeHeader,
  mailSettings,
  mailTransportConfigured,
  replyCode,
  smtpSteps,
} from '@/lib/mail';

/**
 * The mail adapter, graded without a socket.
 *
 * F118 IS THE PREVIEW, NOT THE SEND, and this file is why the two can be told
 * apart. `mailTransportConfigured()` is what the review consults before it
 * claims anything about an email, and it answers false on a machine with no
 * host, which is this machine and the verifier's. F123 is the operator line
 * that needs a real relay.
 *
 * WHAT WOULD MAKE THIS GO RED. Treating a host with no recipient as configured,
 * which is how a settings screen ends up claiming mail works over a relay that
 * has nowhere to deliver. Or dropping the dot-stuffing, which silently
 * truncates a message at the first line of HTML that happens to start with a
 * period, and which no test that only checks headers would ever see.
 */

const SETTINGS = {
  host: 'smtp.example.org',
  port: 465,
  user: 'owner@example.org',
  password: 'a-password',
  to: 'owner@example.org',
  from: 'owner@example.org',
};

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const names = ['MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASSWORD', 'MAIL_TO'];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) {
      const value = values[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    run();
  } finally {
    for (const name of names) {
      const value = before[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe('whether a transport exists at all', () => {
  test('nothing configured is not configured', () => {
    withEnv({}, () => {
      expect(mailSettings()).toBeNull();
      expect(mailTransportConfigured()).toBe(false);
    });
  });

  test('a host with no recipient is not configured either', () => {
    withEnv({ MAIL_HOST: 'smtp.example.org' }, () => {
      expect(mailTransportConfigured()).toBe(false);
    });
  });

  test('a recipient with no host is not configured', () => {
    withEnv({ MAIL_TO: 'owner@example.org' }, () => {
      expect(mailTransportConfigured()).toBe(false);
    });
  });

  test('a nonsense port is not configured, rather than defaulted over', () => {
    withEnv(
      { MAIL_HOST: 'smtp.example.org', MAIL_TO: 'owner@example.org', MAIL_PORT: 'soon' },
      () => {
        expect(mailTransportConfigured()).toBe(false);
      },
    );
  });

  test('a whole configuration is read back, port and all', () => {
    withEnv(
      {
        MAIL_HOST: 'smtp.example.org',
        MAIL_TO: 'owner@example.org',
        MAIL_USER: 'owner@example.org',
        MAIL_PASSWORD: 'a-password',
        MAIL_PORT: '465',
      },
      () => {
        const settings = mailSettings();
        console.log(`configured: ${settings?.host}:${settings?.port} to ${settings?.to}`);
        expect(settings?.host).toBe('smtp.example.org');
        expect(settings?.port).toBe(465);
        expect(mailTransportConfigured()).toBe(true);
      },
    );
  });

  test('with no user, the sender falls back to the recipient rather than to nothing', () => {
    withEnv({ MAIL_HOST: 'smtp.example.org', MAIL_TO: 'owner@example.org' }, () => {
      expect(mailSettings()?.from).toBe('owner@example.org');
    });
  });
});

describe('the message', () => {
  const message = buildMessage({
    from: 'owner@example.org',
    to: 'owner@example.org',
    subject: 'Vernier, your week: 17 Aug to 23 Aug',
    text: 'Your week\n17 Aug to 23 Aug',
    html: '<!doctype html><html><body><p>Your week</p></body></html>',
    at: new Date('2026-08-23T18:00:00Z'),
  });

  test('is multipart alternative with the text part first', () => {
    const lines = message.split('\r\n');
    console.log(lines.slice(0, 8).join(' / '));
    expect(message).toContain('CONTENT-TYPE: multipart/alternative; boundary="vernier-');
    const textAt = message.indexOf('text/plain');
    const htmlAt = message.indexOf('text/html');
    expect(textAt).toBeGreaterThan(-1);
    expect(htmlAt).toBeGreaterThan(textAt);
  });

  test('carries the five headers a relay needs', () => {
    for (const header of ['FROM:', 'TO:', 'SUBJECT:', 'DATE:', 'MESSAGE-ID:']) {
      expect(message).toContain(header);
    }
  });

  test('every line ends CRLF, which is the only line ending SMTP has', () => {
    const bare = message.split('\r\n').join('').includes('\n');
    expect(bare).toBe(false);
  });

  test('the boundary closes', () => {
    const boundary = /boundary="([^"]+)"/.exec(message)?.[1];
    expect(boundary).toBeDefined();
    expect(message.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
  });
});

describe('the transparency rule', () => {
  test('a line that opens on a period is doubled', () => {
    const body = 'first line\n.hidden line\nlast line';
    const stuffed = dotStuff(body);
    console.log(JSON.stringify(stuffed));
    expect(stuffed).toContain('\r\n..hidden line\r\n');
    // Without this, the message ends at that line and everything after it is
    // read by the relay as a command. RFC 5321 section 4.5.2.
    expect(stuffed.split('\r\n')[1]).toBe('..hidden line');
  });

  test('a period inside a line is left alone', () => {
    expect(dotStuff('a sentence. with a stop')).toBe('a sentence. with a stop');
  });
});

describe('the conversation', () => {
  test('runs in the order a relay expects, with the code each step wants', () => {
    const steps = smtpSteps(SETTINGS, 'a message');
    console.log(steps.map((step) => `${step.send.split('\r\n')[0].slice(0, 24)}=>${step.expect}`).join(' '));
    expect(steps.map((step) => step.expect)).toEqual([250, 334, 334, 235, 250, 250, 354, 250, 221]);
    expect(steps[0].send.startsWith('EHLO ')).toBe(true);
    expect(steps[1].send).toBe('AUTH LOGIN');
    expect(steps[4].send).toBe('MAIL FROM:<owner@example.org>');
    expect(steps[5].send).toBe('RCPT TO:<owner@example.org>');
    expect(steps[6].send).toBe('DATA');
    expect(steps[7].send.endsWith('\r\n.')).toBe(true);
    expect(steps[8].send).toBe('QUIT');
  });

  test('the credentials are base64, which is what AUTH LOGIN takes', () => {
    const steps = smtpSteps(SETTINGS, 'a message');
    expect(Buffer.from(steps[2].send, 'base64').toString('utf8')).toBe('owner@example.org');
    expect(Buffer.from(steps[3].send, 'base64').toString('utf8')).toBe('a-password');
  });

  test('a relay with no credentials skips the authentication and nothing else', () => {
    const steps = smtpSteps({ ...SETTINGS, user: '', password: '' }, 'a message');
    console.log(`unauthenticated conversation is ${steps.length} steps`);
    expect(steps).toHaveLength(6);
    expect(steps.some((step) => step.send.includes('AUTH'))).toBe(false);
  });

  test('a reply code is read off the last line of a multi-line reply', () => {
    expect(replyCode('250 OK')).toBe(250);
    expect(replyCode('354 Start mail input')).toBe(354);
    // A line with no code at all is a zero, which is not a code any relay
    // returns and can therefore never be mistaken for success.
    expect(replyCode('nonsense')).toBe(0);
  });
});

describe('a header outside ASCII', () => {
  test('is encoded, and one inside it is left alone', () => {
    expect(encodeHeader('Vernier, your week')).toBe('Vernier, your week');
    const encoded = encodeHeader('Vernier, votre semaine du 17 aout, resume detaille');
    expect(encoded).toBe('Vernier, votre semaine du 17 aout, resume detaille');
    const accented = encodeHeader('Vernier, resume detailleé');
    console.log(`encoded: ${accented}`);
    expect(accented.startsWith('=?UTF-8?B?')).toBe(true);
    expect(Buffer.from(accented.slice(10, -2), 'base64').toString('utf8')).toBe(
      'Vernier, resume detailleé',
    );
  });
});
