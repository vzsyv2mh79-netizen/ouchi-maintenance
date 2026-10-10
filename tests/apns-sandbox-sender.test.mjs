import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const protocol = 'data:text/javascript;base64,' + Buffer.from(compile(readFileSync('lib/apns-maintenance.ts', 'utf8'))).toString('base64');
const source = readFileSync('lib/apns-sandbox-sender.ts', 'utf8').replace("import 'server-only';", '').replace("'./apns-maintenance'", JSON.stringify(protocol));
const { createSandboxAPNsSender } = await import('data:text/javascript;base64,' + Buffer.from(compile(source)).toString('base64'));
const input = { deviceToken: 'ab'.repeat(32), bundleId: 'jp.ouchi.maintenance', dueCount: 2, now: 1791637200000, registeredAt: 1791637100000 };
function fixture(event) {
  const session = new EventEmitter(), stream = new EventEmitter(), seen = {};
  session.destroy = () => { seen.sessionClosed = true; };
  stream.destroy = () => { seen.streamClosed = true; };
  session.request = headers => { seen.headers = headers; return stream; };
  stream.end = body => { seen.body = body; queueMicrotask(() => event(stream, session)); };
  const connect = (origin, options) => { seen.origin = origin; seen.options = options; return session; };
  return { sender: createSandboxAPNsSender({ environment: 'Sandbox', providerToken: () => 'a.b.c', connect }), seen };
}
test('sandbox sender uses fixed HTTP/2 destination, count-only body and closes resources', async () => {
  const { sender, seen } = fixture(stream => { stream.emit('response', { ':status': 200 }); stream.emit('end'); });
  assert.equal(await sender(input), 'accepted');
  assert.equal(seen.origin, 'https://api.sandbox.push.apple.com');
  assert.equal(seen.options.minVersion, 'TLSv1.2');
  assert.equal(seen.headers[':method'], 'POST');
  assert.equal(seen.headers.authorization, 'bearer a.b.c');
  assert.match(JSON.parse(seen.body).aps.alert.body, /2件/);
  assert.ok(seen.sessionClosed && seen.streamClosed);
  const untouched = fixture(() => assert.fail('must not send'));
  assert.equal(await untouched.sender({ ...input, dueCount: 0 }), 'skipped');
  assert.equal(untouched.seen.origin, undefined);
});
test('network failures, oversized replies and provider rejections do not report success', async () => {
  for (const signal of ['error', 'aborted', 'close']) {
    const { sender, seen } = fixture(stream => stream.emit(signal, new Error('synthetic')));
    assert.equal(await sender(input), 'retry'); assert.ok(seen.sessionClosed);
  }
  const oversized = fixture(stream => { stream.emit('response', { ':status': 410 }); stream.emit('data', Buffer.alloc(4097)); stream.emit('end'); });
  assert.equal(await oversized.sender(input), 'inspect');
  const stale = fixture(stream => { stream.emit('response', { ':status': 410 }); stream.emit('data', Buffer.from(JSON.stringify({ reason: 'Unregistered', timestamp: input.registeredAt - 1 }))); stream.emit('end'); });
  assert.equal(await stale.sender(input), 'stale-unregistration');
  const unavailable = createSandboxAPNsSender({ environment: 'Sandbox', providerToken: () => 'a.b.c', connect: () => { throw new Error('synthetic'); } });
  assert.equal(await unavailable(input), 'retry');
  assert.throws(() => createSandboxAPNsSender({ environment: 'Production', providerToken: () => 'a.b.c' }));
  await assert.rejects(fixture(() => {}).sender({ ...input, registeredAt: input.now + 1 }));
  await assert.rejects(createSandboxAPNsSender({ environment: 'Sandbox', providerToken: () => 'bad\r\nheader' })(input));
});
test('an unresponsive provider is bounded by ten seconds and releases resources', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { sender, seen } = fixture(() => {});
  const pending = sender(input);
  await Promise.resolve();
  t.mock.timers.tick(10000);
  assert.equal(await pending, 'retry');
  assert.ok(seen.sessionClosed && seen.streamClosed);
});
