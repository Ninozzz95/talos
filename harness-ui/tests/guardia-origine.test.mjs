/**
 * 0.1.25 — la guardia d'origine e dell'Host di TUTTO il server (owner 08/10/2026 notte e 09/10/2026: «una guardia unica su ogni
 * scrittura» + «Host su ogni richiesta, letture comprese»). Difesa in profondità: l'app installata ha già il cookie
 * `talos_token` (SameSite=Strict); i server SENZA gettone (il 4174, i server di prova) no.
 * Modello: Hermes `hermes_cli/web_server.py` (clone 65ad529, letto il 09/10/2026) — CORS solo per le origini di loopback
 * (:437-445), `_LOOPBACK_HOST_VALUES` (:497), `_host_header_hostname` + `host_header_middleware` (:562-640, GHSA-ppp5-vxwm-4cf7).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { nomeDaHost, hostAmmesso, origineLoopback, origineDellaFinestra, rifiutoScritturaDaAltroSito } from '../src/guardia-origine.mjs'

test('GUARDIA-01 — il nome dall\'Host: un\'autorità, mai un URL; IPv6 solo fra quadre; una porta sola', () => {
  assert.equal(nomeDaHost('127.0.0.1:4174'), '127.0.0.1')
  assert.equal(nomeDaHost('LocalHost'), 'localhost')
  assert.equal(nomeDaHost('[::1]:4174'), '::1')
  for (const sbagliato of ['', 'http://127.0.0.1', '127.0.0.1:4174/x', '::1', '[127.0.0.1]', '[::1]x', '127.0.0.1:', ':4174', 'a b', 'user@127.0.0.1', '127.0.0.1:41a']) {
    assert.equal(nomeDaHost(sbagliato), '', JSON.stringify(sbagliato))
  }
})

test('GUARDIA-02 — Host ammesso: solo i nomi di loopback, porta qualunque (come Hermes: il ponte adb può cambiare porta)', () => {
  for (const ok of ['127.0.0.1:4174', 'localhost:4177', 'localhost', '[::1]:9', '127.0.0.1']) assert.equal(hostAmmesso(ok), true, ok)
  // DNS rebinding: il nome dell'attaccante risolto a 127.0.0.1 arriva col SUO nome nell'Host
  for (const no of ['evil.example:4174', 'evil.example', '127.0.0.1.evil.example', '0.0.0.0:4174', '192.168.1.5:4174', '', ' ']) {
    assert.equal(hostAmmesso(no), false, JSON.stringify(no))
  }
  // un Host ASSENTE viene solo da un programma o da una prova in memoria: un browser (quindi il rebinding) lo manda sempre
  assert.equal(hostAmmesso(undefined), true)
})

test('GUARDIA-03 — origine di loopback: http/https su localhost, 127.0.0.1, [::1], con o senza porta (la forma; quale origine sia la FINESTRA lo dice GUARDIA-03b)', () => {
  for (const ok of ['http://127.0.0.1:4174', 'http://localhost', 'https://localhost:8080', 'http://[::1]:4174']) assert.equal(origineLoopback(ok), true, ok)
  for (const no of ['https://evil.example', 'http://localhost.evil.example', 'http://127.0.0.1.evil.example:4174', 'null', 'file://', 'capacitor://localhost', '']) {
    assert.equal(origineLoopback(no), false, no)
  }
})

test('GUARDIA-03b — l\'origine della FINESTRA: loopback con la porta dell\'Host, o il WebView senza porta (review del bugfixer 09/10)', () => {
  assert.equal(origineDellaFinestra('http://127.0.0.1:4174', '127.0.0.1:4174'), true)
  assert.equal(origineDellaFinestra('http://localhost:4174', '127.0.0.1:4174'), true, 'un altro alias di loopback, stessa porta: stessa macchina, stesso server')
  assert.equal(origineDellaFinestra('http://[::1]:4174', '[::1]:4174'), true)
  assert.equal(origineDellaFinestra('https://localhost', '127.0.0.1:4174'), true, 'il WebView di Capacitor (androidScheme https) dal ponte adb')
  assert.equal(origineDellaFinestra('http://127.0.0.1:4174', undefined), true, 'senza Host (un programma) non c\'è porta da confrontare')
  // AL CONTRARIO: un altro server della stessa macchina (il dev server del progetto, uno strumento locale)
  for (const [o, h] of [['http://localhost', '127.0.0.1:4174'] /* la porta 80: qualunque server http locale, non il WebView */, ['http://localhost:5173', '127.0.0.1:4174'], ['http://127.0.0.1:4175', '127.0.0.1:4174'], ['http://127.0.0.1', '127.0.0.1:4174'],
    ['https://127.0.0.1:4174', '127.0.0.1:4174'], ['http://127.0.0.1:80', '127.0.0.1:4174'], ['https://evil.example', '127.0.0.1:4174'], ['null', '127.0.0.1:4174']]) {
    assert.equal(origineDellaFinestra(o, h), false, `${o} con Host ${h}`)
  }
})

test('GUARDIA-04 — una scrittura da un altro sito si rifiuta; i metodi sicuri e i programmi senza intestazioni del browser passano', () => {
  const r = (method, headers = {}) => rifiutoScritturaDaAltroSito({ method, headers })
  assert.equal(r('GET', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }), null, 'una lettura: la decide l\'Host, non questa guardia')
  assert.equal(r('POST'), null, 'un programma (test, script, CLI): niente Origin, niente Sec-Fetch')
  assert.equal(r('POST', { origin: 'http://127.0.0.1:4174', host: '127.0.0.1:4174', 'sec-fetch-site': 'same-origin' }), null)
  assert.equal(r('POST', { origin: 'http://localhost:5173', host: '127.0.0.1:4174', 'sec-fetch-site': 'same-site' }), 'altra-origine', 'il dev server del progetto non è la finestra di TALOS')
  assert.equal(r('POST', { origin: 'https://localhost', host: '127.0.0.1:4174', 'sec-fetch-site': 'cross-site' }), null, 'il WebView del telefono, anche se «cross-site» per il browser')
  assert.equal(r('DELETE', { origin: 'https://evil.example' }), 'altra-origine')
  assert.equal(r('PATCH', { origin: 'null' }), 'altra-origine', 'un iframe sandboxato o un file: origine opaca')
  assert.equal(r('POST', { 'sec-fetch-site': 'cross-site' }), 'altro-sito', 'senza Origin ma il browser dice che arriva da un altro sito')
  assert.equal(r('POST', { 'sec-fetch-site': 'same-site' }), 'altro-sito', 'same-site: un\'altra porta o un sottodominio non è la finestra di TALOS')
  assert.equal(r('PUT', { 'sec-fetch-site': 'none' }), null, 'navigazione diretta della persona')
})

test('GUARDIA-05 — dal server vero: Host, CORS, preflight e scritture; i programmi senza intestazioni passano', async (t) => {
  const { createServer, request } = await import('node:http')
  const { createHttpApp } = await import('../src/http-app.mjs')
  const server = createServer(createHttpApp({ staticHandler: async () => null }))
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
  t.after(() => new Promise((ok) => server.close(ok)))
  const porta = server.address().port
  const chiedi = (method, percorso, headers = {}, corpo = null) => new Promise((ok, ko) => {
    const req = request({ host: '127.0.0.1', port: porta, method, path: percorso, headers: { host: `127.0.0.1:${porta}`, ...headers } }, (res) => {
      let testo = ''; res.on('data', (c) => { testo += c }); res.on('end', () => ok({ status: res.statusCode, headers: res.headers, testo }))
    })
    req.on('error', ko)
    if (corpo !== null) req.end(JSON.stringify(corpo)); else req.end()
  })
  // Host: il DNS rebinding porta il nome dell'attaccante
  const rebinding = await chiedi('GET', '/api/v1/health', { host: `evil.example:${porta}` })
  assert.equal(rebinding.status, 400)
  assert.match(rebinding.testo, /HOST_FORBIDDEN/u)
  assert.equal((await chiedi('GET', '/api/v1/health', { host: `localhost:${porta}` })).status, 200, 'localhost con qualunque porta')
  assert.equal((await chiedi('GET', '/api/v1/health')).status, 200)
  // CORS: solo l'origine della finestra (stessa porta) e il WebView senza porta ricevono l'intestazione
  assert.equal((await chiedi('GET', '/api/v1/health', { origin: 'https://localhost' })).headers['access-control-allow-origin'], 'https://localhost')
  assert.equal((await chiedi('GET', '/api/v1/health', { origin: `http://127.0.0.1:${porta}` })).headers['access-control-allow-origin'], `http://127.0.0.1:${porta}`)
  const altra = await chiedi('GET', '/api/v1/health', { origin: 'https://evil.example' })
  assert.equal(altra.headers['access-control-allow-origin'], undefined, 'un altro sito non legge la risposta')
  assert.equal(altra.headers.vary, 'Origin', 'anche negata, la risposta dipende dall\'Origin')
  const altraPorta = `http://localhost:${porta === 65535 ? 65534 : porta + 1}`
  assert.equal((await chiedi('GET', '/api/v1/health', { origin: altraPorta })).headers['access-control-allow-origin'], undefined, 'un altro server locale non legge')
  const scritturaAltraPorta = await chiedi('POST', '/api/v1/me/notes', { origin: altraPorta, 'sec-fetch-site': 'same-site', 'content-type': 'application/json' }, {})
  assert.equal(scritturaAltraPorta.status, 403, 'un altro server locale (il dev server del progetto) non scrive')
  assert.match(scritturaAltraPorta.testo, /ORIGIN_FORBIDDEN/u)
  assert.notEqual((await chiedi('POST', '/api/v1/me/notes', { origin: `http://localhost:${porta}`, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }, {})).status, 403, 'la finestra di TALOS sì')
  // preflight
  const pre = await chiedi('OPTIONS', '/api/v1/me/notes/x', { origin: 'https://evil.example', 'access-control-request-method': 'DELETE' })
  assert.equal(pre.status, 403)
  assert.equal(pre.headers['access-control-allow-origin'], undefined)
  assert.equal((await chiedi('OPTIONS', '/api/v1/me/notes/x', { origin: 'https://localhost', 'access-control-request-method': 'DELETE' })).status, 204)
  assert.equal((await chiedi('OPTIONS', '/api/v1/me/notes/x', { origin: altraPorta, 'access-control-request-method': 'DELETE' })).status, 403, 'preflight da un altro server locale')
  // scritture
  const scrittura = await chiedi('POST', '/api/v1/me/notes', { origin: 'https://evil.example', 'content-type': 'text/plain' }, { titolo: 'x', contenuto: 'y' })
  assert.equal(scrittura.status, 403)
  assert.match(scrittura.testo, /ORIGIN_FORBIDDEN/u)
  assert.equal((await chiedi('POST', '/api/v1/me/notes', { 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain' }, {})).status, 403, 'senza Origin ma da un altro sito')
  const programma = await chiedi('POST', '/api/v1/me/notes', { 'content-type': 'application/json' }, {})
  assert.notEqual(programma.status, 403, 'un programma senza intestazioni del browser non è fermato dalla guardia (risponde la rotta)')
  assert.notEqual(programma.status, 400)
})
