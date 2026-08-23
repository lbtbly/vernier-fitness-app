import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

/**
 * F114's first half, read off the source: subscription runs inside the tap
 * handler with no awaited call before the permission request.
 *
 * WHY A SOURCE TEST AND NOT A BROWSER TEST. User activation on iOS is
 * transient. An `await` before `Notification.requestPermission()` spends it and
 * the prompt NEVER APPEARS: no throw, no warning, the promise resolves to
 * 'default', and the owner taps a button that appears to do nothing forever.
 * No headless browser reproduces that, because activation in Chromium and in a
 * driven WebKit does not behave the way it does on a real iPhone under a real
 * finger. So the property that is actually checkable is the ORDERING, and that
 * is a fact about the source.
 *
 * A comment saying "do not move this line" is not a check. This is.
 *
 * WHAT WOULD MAKE IT GO RED. Adding `const registration = await
 * navigator.serviceWorker.ready;` above the permission call, which is the most
 * natural refactor anybody would reach for and is exactly the defect. The
 * positive controls at the bottom prove the walker still bites by feeding it
 * that shape.
 */

const HANDLER_FILE = fileURLToPath(new URL('../../src/components/PushEnable.tsx', import.meta.url));

type Verdict =
  | { ok: true; firstStatement: string }
  | { ok: false; reason: 'not-found' | 'awaits-first' | 'not-permission'; firstStatement: string };

/**
 * Reads the named handler out of a source file and reports what its FIRST
 * statement is.
 *
 * Deliberately strict: the first statement must itself contain the call to
 * `Notification.requestPermission`, and it must not be an await expression.
 * "First await" is not the rule; "first statement" is, because a synchronous
 * read of anything at all is still a statement that ran before the prompt.
 */
function firstStatementOf(source: string, handler: string): Verdict {
  const file = ts.createSourceFile(handler, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body: ts.Block | null = null;

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === handler &&
      node.initializer
    ) {
      // `const enable = useCallback(() => { ... }, [...])` or a bare arrow.
      const initializer = node.initializer;
      const arrow = ts.isCallExpression(initializer)
        ? initializer.arguments.find((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
        : initializer;
      if (arrow && (ts.isArrowFunction(arrow) || ts.isFunctionExpression(arrow)) && arrow.body && ts.isBlock(arrow.body)) {
        body = arrow.body;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  if (body === null) return { ok: false, reason: 'not-found', firstStatement: '' };
  const block = body as ts.Block;
  const statements = block.statements.filter((statement) => !ts.isEmptyStatement(statement));
  if (statements.length === 0) return { ok: false, reason: 'not-found', firstStatement: '' };

  const first = statements[0];
  const text = first.getText().replace(/\s+/g, ' ').trim();
  if (/\bawait\b/.test(text)) return { ok: false, reason: 'awaits-first', firstStatement: text };
  if (!/Notification\s*\.\s*requestPermission\s*\(/.test(text)) {
    return { ok: false, reason: 'not-permission', firstStatement: text };
  }
  return { ok: true, firstStatement: text };
}

describe('the tap handler', () => {
  test('its first statement is the permission request, with nothing awaited above it', () => {
    const source = readFileSync(HANDLER_FILE, 'utf8');
    const verdict = firstStatementOf(source, 'enable');
    console.log(`first statement of enable(): ${verdict.firstStatement}`);
    expect(verdict.ok).toBe(true);
  });

  test('subscribe is called after the permission answer, inside the same handler', () => {
    const source = readFileSync(HANDLER_FILE, 'utf8');
    const permissionAt = source.indexOf('Notification.requestPermission');
    const subscribeAt = source.indexOf('pushManager.subscribe');
    console.log(`requestPermission at ${permissionAt}, pushManager.subscribe at ${subscribeAt}`);
    expect(permissionAt).toBeGreaterThan(-1);
    expect(subscribeAt).toBeGreaterThan(permissionAt);
  });

  test('the subscription promises to be user visible', () => {
    const source = readFileSync(HANDLER_FILE, 'utf8');
    // userVisibleOnly is not a flag, it is the promise Safari revokes the
    // subscription over. It is asserted here because a subscribe() without it
    // is accepted by Chromium and refused by nothing until the phone stops
    // receiving anything.
    expect(source).toContain('userVisibleOnly: true');
  });

  test('only the public half of the key pair is ever named in this component', () => {
    const source = readFileSync(HANDLER_FILE, 'utf8');
    expect(source).not.toContain('VAPID_PRIVATE_KEY');
    expect(source).not.toContain('privateKey');
  });
});

describe('the walker itself still bites', () => {
  const WRONG = `
    const enable = useCallback(() => {
      const registration = await navigator.serviceWorker.ready;
      const permission = Notification.requestPermission();
    }, []);
  `;
  const ALSO_WRONG = `
    const enable = useCallback(() => {
      setPhase('asking');
      const permission = Notification.requestPermission();
    }, []);
  `;
  const RIGHT = `
    const enable = useCallback(() => {
      const permission = Notification.requestPermission();
      void (async () => { await permission; })();
    }, []);
  `;

  test('an awaited call above the permission request is caught', () => {
    const verdict = firstStatementOf(WRONG, 'enable');
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('awaits-first');
    console.log(`positive control caught: ${verdict.firstStatement}`);
  });

  test('any other statement above it is caught too, awaited or not', () => {
    // A synchronous statement does not spend the activation on its own, but the
    // rule is "first statement" rather than "first await" on purpose: the next
    // edit to that line is the one that adds the await, and by then nobody is
    // reading this file.
    const verdict = firstStatementOf(ALSO_WRONG, 'enable');
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('not-permission');
  });

  test('a handler shaped like the shipped one passes', () => {
    expect(firstStatementOf(RIGHT, 'enable').ok).toBe(true);
  });

  test('a handler that does not exist is a failure and never a pass', () => {
    const verdict = firstStatementOf('const other = () => {};', 'enable');
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('not-found');
  });
});
