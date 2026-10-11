import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer, connect as http2Connect } from 'node:http2';
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
    assert.equal(await sender(input), 'delivery-unknown'); assert.ok(seen.sessionClosed);
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
  assert.equal(await pending, 'delivery-unknown');
  assert.ok(seen.sessionClosed && seen.streamClosed);
});
test('caller cancellation skips unopened transport and closes an active request', async () => {
  const before = new AbortController(); before.abort();
  const untouched = fixture(() => assert.fail('must not send'));
  assert.equal(await untouched.sender(input, before.signal), 'skipped');
  assert.equal(untouched.seen.origin, undefined);
  const during = new AbortController();
  const active = fixture(stream => { during.abort(); stream.emit('response', { ':status': 200 }); stream.emit('end'); });
  assert.equal(await active.sender(input, during.signal), 'delivery-unknown');
  assert.ok(active.seen.streamClosed && active.seen.sessionClosed);
});
test('cancellation while opening transport releases the just-created session', async () => {
  const controller = new AbortController(); let destroyed = false;
  const session = new EventEmitter();
  session.destroy = () => { destroyed = true; };
  session.request = () => assert.fail('must not create stream');
  const sender = createSandboxAPNsSender({ environment: 'Sandbox', providerToken: () => 'a.b.c',
    connect: () => { controller.abort(); return session; } });
  assert.equal(await sender(input, controller.signal), 'skipped');
  assert.equal(destroyed, true);
});
test('real loopback HTTP/2 transport accepts a response and cancels an unfinished request', async () => {
  const server = createServer(), sessions = new Set();
  server.on('session', session => {
    sessions.add(session); session.on('error', () => {});
    session.on('close', () => sessions.delete(session));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    let cancel;
    server.on('stream', (stream, headers) => {
      stream.on('error', () => {});
      assert.equal(headers[':method'], 'POST');
      assert.equal(headers['apns-topic'], 'jp.ouchi.maintenance');
      assert.equal(headers.authorization, 'bearer a.b.c');
      if (cancel) { cancel.abort(); return; }
      let body = '';
      stream.setEncoding('utf8'); stream.on('data', bytes => { body += bytes; });
      stream.on('end', () => {
        assert.equal(JSON.parse(body).aps.alert.title, 'おうちメンテ');
        stream.respond({ ':status': 200 }); stream.end();
      });
    });
    const sender = createSandboxAPNsSender({ environment: 'Sandbox', providerToken: () => 'a.b.c',
      connect: (destination, options) => {
        assert.equal(destination, 'https://api.sandbox.push.apple.com');
        assert.equal(options.minVersion, 'TLSv1.2');
        return http2Connect(origin);
      } });
    assert.equal(await sender(input), 'accepted');
    cancel = new AbortController();
    assert.equal(await sender(input, cancel.signal), 'delivery-unknown');
  } finally {
    for (const session of sessions) session.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
