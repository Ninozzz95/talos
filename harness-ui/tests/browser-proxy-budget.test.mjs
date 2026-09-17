import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { proxyPagina, BYTE_MASSIMI, REDIRECT_MASSIMI } from '../src/browser-proxy.mjs';
const html = body => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const local = 'http://127.0.0.1:4567/';

test('F04: UTF-8 byte budget rejects 6 MiB even when text length is smaller', async () => {
  const result = await proxyPagina(local, { fetchFn: async () => html('€'.repeat(2 * 1024 * 1024)) });
  assert.equal(result.codice, 'BROWSER_PROXY_TROPPO_GRANDE');
});
test('F04: exact byte limit is accepted and an extra byte is refused', async () => {
  assert.equal((await proxyPagina(local, { fetchFn: async () => html('x'.repeat(BYTE_MASSIMI)) })).ok, true);
  assert.equal((await proxyPagina(local, { fetchFn: async () => html('x'.repeat(BYTE_MASSIMI + 1)) })).codice, 'BROWSER_PROXY_TROPPO_GRANDE');
});
test('F04: overflowing stream is cancelled before subsequent chunks are consumed', async () => {
  let pulls = 0, cancelled = false;
  const stream = new ReadableStream({
    pull(c) { pulls++; c.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const result = await proxyPagina(local, { fetchFn: async () => html(stream) });
  assert.equal(result.codice, 'BROWSER_PROXY_TROPPO_GRANDE');
  assert.equal(cancelled, true);
  assert.equal(pulls, 6);
});
test('F04: Content-Length rejection consumes no body bytes', async () => {
  let pulls = 0, cancelled = false;
  const stream = new ReadableStream({ pull(c) { pulls++; c.enqueue(new Uint8Array(10)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const result = await proxyPagina(local, { fetchFn: async () => new Response(stream, { headers: { 'content-type': 'text/html', 'content-length': String(BYTE_MASSIMI + 1) } }) });
  assert.equal(result.codice, 'BROWSER_PROXY_TROPPO_GRANDE'); assert.equal(pulls, 0); assert.equal(cancelled, true);
});
test('F04: multibyte characters split across network chunks decode correctly', async () => {
  const bytes = new TextEncoder().encode('<p>€🙂</p>'); let at = 0;
  const stream = new ReadableStream({ pull(c) { if (at === bytes.length) c.close(); else c.enqueue(bytes.slice(at, ++at)); } });
  const result = await proxyPagina(local, { fetchFn: async () => html(stream) });
  assert.equal(result.ok, true); assert.match(result.html, /€🙂/);
});
for (const status of [301, 302, 303, 307, 308]) {
  test(`F07: ${status} external Location is rejected before any external request`, async () => {
    const calls = [];
    const result = await proxyPagina(local, { fetchFn: async (url, options) => {
      calls.push(url); assert.equal(options.redirect, 'manual');
      return new Response(null, { status, headers: { location: 'https://example.org/private' } });
    } });
    assert.equal(result.codice, 'BROWSER_PROXY_SOLO_LOCALE'); assert.deepEqual(calls, [local]);
  });
}
test('F07: relative and loopback redirects are followed one hop at a time', async () => {
  const calls = [];
  const result = await proxyPagina(local, { fetchFn: async (url, options) => {
    calls.push(url); assert.equal(options.redirect, 'manual');
    return calls.length === 1 ? new Response(null, { status: 302, headers: { location: '/next' } }) : html('<p>local</p>');
  } });
  assert.equal(result.ok, true); assert.equal(result.url, local + 'next'); assert.equal(calls.length, 2);
});
test('F07: finite redirect budget stops loops and closes every response', async () => {
  let calls = 0, cancelled = 0;
  const result = await proxyPagina(local, { fetchFn: async () => {
    calls++; return { status: 302, headers: new Headers({ location: '/loop' }), body: { cancel: async () => { cancelled++; } } };
  } });
  assert.equal(result.codice, 'BROWSER_PROXY_REDIRECT'); assert.equal(calls, REDIRECT_MASSIMI + 1); assert.equal(cancelled, calls);
});
for (const target of ['http://user:password@localhost:4567/', 'file:///etc/passwd', 'javascript:alert(1)']) {
  test('F07: redirect URL validation is applied before request: ' + target.split(':')[0], async () => {
    let calls = 0;
    const result = await proxyPagina(local, { fetchFn: async () => { calls++; return new Response(null, { status: 302, headers: { location: target } }); } });
    assert.equal(result.codice, 'QUERY_INVALID'); assert.equal(calls, 1);
  });
}
test('transport that already followed redirects cannot certify its unseen hops', async () => {
  const result = await proxyPagina(local, { fetchFn: async () => ({ status: 200, redirected: true, url: local, body: { cancel: async () => {} } }) });
  assert.equal(result.codice, 'BROWSER_PROXY_SOLO_LOCALE');
});
test('whole-operation timeout also cancels a stalled HTML body', async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const result = await proxyPagina(local, { millisecondi: 20, fetchFn: async () => html(body) });
  assert.equal(result.codice, 'BROWSER_PROXY_IRRAGGIUNGIBILE'); assert.equal(cancelled, true);
});
test('actual HTTP transport: allowed local redirect and streamed HTML are preserved', async t => {
  const server = createServer((req, res) => {
    if (req.url === '/') { res.writeHead(302, { location: '/document' }); res.end(); }
    else { res.writeHead(200, { 'content-type': 'text/html' }); res.write('<p>actual '); res.end('transport</p>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const result = await proxyPagina(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(result.ok, true); assert.match(result.html, /actual transport/); assert.match(result.url, /\/document$/);
});
