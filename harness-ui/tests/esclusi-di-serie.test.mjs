/**
 * 0.1.25 — i fornitori a valle ESCLUSI DI SERIE su OpenRouter (owner 08/10/2026 notte e 09/10/2026).
 *
 * glm-5.3-flash instradato di serie a OpenInference (fp4) non chiama gli attrezzi: misurato dalla CLI l'08/10 (0/2 fissato,
 * 0/2 libero; Z.AI fp8 3/3, DeepInfra fp4 2/2) e nello stress test desktop dello stesso giorno (le tre risposte vuote, tutte
 * servite da OpenInference). L'owner: esclusione DI SERIE per quel modello, «visibile e togliibile» nelle Impostazioni, tolta
 * resta tolta, e si SOMMA alla lista della persona (decisione 14).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { ESCLUSI_DI_SERIE, esclusiDiSerieAttivi, chiaveDiSerie, normalizzaTolti } from '../src/esclusi-di-serie.mjs'
import { unisciEsclusi, unisciInstradamento } from '../src/runtime-owner-adapter.mjs'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

test('SERIE-08 — il negozio: togliere e rimettere una voce di serie, su disco, conservato da ogni altra scrittura e dal riavvio', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-di-serie-'))
  t.after(() => rimuoviCartellaDiProva(dir))
  const runtimeFile = join(dir, 'providers.json')
  const store = createProviderCredentialStore({ env: {}, runtimeFile })
  const voce = () => store.listPublic().find((p) => p.id === 'openrouter').esclusiDiSerie
    .find((v) => v.modello === 'z-ai/glm-5.3-flash' && v.slug === 'open-inference')
  assert.equal(voce().attivo, true, 'di serie: attiva')
  assert.deepEqual(store.getRuntime('openrouter').esclusiDiSerieTolti, [])
  store.impostaDiSerie('openrouter', 'z-ai/glm-5.3-flash', 'open-inference', false)
  assert.equal(voce().attivo, false)
  assert.deepEqual(JSON.parse(readFileSync(runtimeFile, 'utf8')).providers.openrouter.esclusiDiSerieTolti, ['z-ai/glm-5.3-flash#open-inference'])
  // le altre scritture non la perdono
  store.impostaEsclusi('openrouter', ['deepinfra'])
  store.setRuntime('openrouter', { endpoint: 'https://openrouter.ai/api/v1', timeoutSeconds: 90 })
  store.resetEndpoint('openrouter')
  assert.equal(voce().attivo, false, 'esclusi, tempo e indirizzo non la rimettono')
  assert.deepEqual(store.getRuntime('openrouter').esclusi, ['deepinfra'], 'e la lista della persona resta sua')
  const riletto = createProviderCredentialStore({ env: {}, runtimeFile })
  assert.deepEqual(riletto.getRuntime('openrouter').esclusiDiSerieTolti, ['z-ai/glm-5.3-flash#open-inference'], 'tolta resta tolta, anche dopo un riavvio')
  // rimessa
  riletto.impostaDiSerie('openrouter', 'z-ai/glm-5.3-flash', 'open-inference', true)
  assert.deepEqual(riletto.getRuntime('openrouter').esclusiDiSerieTolti, [])
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(runtimeFile, 'utf8')).providers.openrouter, 'esclusiDiSerieTolti'), false)
})

test('SERIE-10 — la rotta: toglie e rimette una voce di serie, solo dalla finestra di TALOS; l\'elenco pubblico la mostra', async (t) => {
  const { createServer } = await import('node:http')
  const { createHttpApp } = await import('../src/http-app.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'talos-di-serie-http-'))
  t.after(() => rimuoviCartellaDiProva(dir))
  const providerStore = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') })
  const server = createServer(createHttpApp({ staticHandler: async () => null, providerStore }))
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
  t.after(() => new Promise((ok) => server.close(ok)))
  const base = `http://127.0.0.1:${server.address().port}`
  const finestra = { origin: base, 'sec-fetch-site': 'same-origin' }
  const post = async (corpo, intestazioni = finestra) => {
    const r = await fetch(`${base}/api/v1/providers/openrouter/esclusi/di-serie`, { method: 'POST', headers: { 'content-type': 'application/json', ...intestazioni }, body: JSON.stringify(corpo) })
    return { status: r.status, corpo: await r.json() }
  }
  const togli = await post({ modello: 'z-ai/glm-5.3-flash', slug: 'open-inference', attivo: false })
  assert.equal(togli.status, 200, JSON.stringify(togli.corpo))
  assert.deepEqual(togli.corpo.data.esclusiDiSerie.find((v) => v.slug === 'open-inference'),
    { modello: 'z-ai/glm-5.3-flash', slug: 'open-inference', perche: 'it does not call tools with this model (measured 08/10/2026)', attivo: false })
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusiDiSerieTolti, ['z-ai/glm-5.3-flash#open-inference'])
  const elenco = await (await fetch(`${base}/api/v1/providers`)).json()
  assert.equal(elenco.data.items.find((p) => p.id === 'openrouter').esclusiDiSerie[0].attivo, false, 'l\'elenco pubblico lo dice')
  assert.equal((await post({ modello: 'z-ai/glm-5.3-flash', slug: 'open-inference', attivo: true })).corpo.data.esclusiDiSerie[0].attivo, true)
  // al contrario: un'altra finestra, un corpo sbagliato, una voce che non esiste — niente si scrive
  assert.equal((await post({ modello: 'z-ai/glm-5.3-flash', slug: 'open-inference', attivo: false }, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).status, 403)
  for (const sbagliato of [{ modello: 'z-ai/glm-5.3-flash', slug: 'open-inference' }, { modello: 'z-ai/glm-5.3-flash', slug: 'deepinfra', attivo: false },
    { modello: 'z-ai/glm-5.3-flash', slug: 'open-inference', attivo: false, altro: 1 }]) {
    const r = await post(sbagliato)
    assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(sbagliato)} → ${r.status}`)
  }
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusiDiSerieTolti, [])
})

test('SERIE-12 — il «Salva» unico: `/esclusi {esclusi, diSerie}` scrive lista e voci in UNA volta; una voce sbagliata non lascia passare la lista', async (t) => {
  const { createServer } = await import('node:http')
  const { createHttpApp } = await import('../src/http-app.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'talos-di-serie-insieme-'))
  t.after(() => rimuoviCartellaDiProva(dir))
  const providerStore = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') })
  providerStore.impostaEsclusi('openrouter', ['chutes'])
  const server = createServer(createHttpApp({ staticHandler: async () => null, providerStore }))
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
  t.after(() => new Promise((ok) => server.close(ok)))
  const base = `http://127.0.0.1:${server.address().port}`
  const post = async (corpo) => {
    const r = await fetch(`${base}/api/v1/providers/openrouter/esclusi`, { method: 'POST',
      headers: { 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' }, body: JSON.stringify(corpo) })
    return { status: r.status, corpo: await r.json() }
  }
  const OI = { modello: 'z-ai/glm-5.3-flash', slug: 'open-inference', attivo: false }
  // al contrario prima: una voce che non è nella tabella ⇒ nessuna delle due cose si scrive
  for (const sbagliato of [{ esclusi: ['deepinfra'], diSerie: [{ ...OI, slug: 'deepinfra' }] }, { esclusi: ['deepinfra'], diSerie: [{ ...OI, altro: 1 }] },
    { esclusi: ['deepinfra'], diSerie: OI }, {}, { diSerie: [OI], lista: [] }]) {
    const r = await post(sbagliato)
    assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(sbagliato)} → ${r.status}`)
  }
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusi, ['chutes'], 'la lista non è passata da sola')
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusiDiSerieTolti, [])
  const insieme = await post({ esclusi: ['deepinfra'], diSerie: [OI] })
  assert.equal(insieme.status, 200, JSON.stringify(insieme.corpo))
  assert.deepEqual(insieme.corpo.data.esclusi, ['deepinfra'])
  assert.equal(insieme.corpo.data.esclusiDiSerie.find((v) => v.slug === 'open-inference').attivo, false)
  // solo le voci: la lista resta com'è
  assert.deepEqual((await post({ diSerie: [{ ...OI, attivo: true }] })).corpo.data.esclusi, ['deepinfra'])
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusiDiSerieTolti, [])
})

test('SERIE-11 — dalla porta vera: la richiesta a OpenRouter per glm-5.3-flash porta ignore open-inference; tolta, non più', async (t) => {
  const { creaFetchOpenRouterResiliente } = await import('../src/runtime-owner-adapter.mjs')
  const { creaInstradamentoDiSerie } = await import('../src/esclusi-di-serie.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'talos-di-serie-porta-'))
  t.after(() => rimuoviCartellaDiProva(dir))
  const store = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') })
  store.impostaEsclusi('openrouter', ['deepinfra'])
  const corpi = []
  const rete = async (_url, init) => { corpi.push(JSON.parse(init.body)); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }
  const fetchOR = creaFetchOpenRouterResiliente(rete, {
    esclusiFn: async () => store.getRuntime('openrouter').esclusi,
    instradamentoFn: creaInstradamentoDiSerie(() => store.getRuntime('openrouter')),
  })
  const chiedi = (model) => fetchOR('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [] }) })
  await chiedi('z-ai/glm-5.3-flash')
  assert.deepEqual(corpi.at(-1).provider, { ignore: ['open-inference', 'deepinfra'] }, 'di serie + la lista della persona')
  await chiedi('qwen/qwen3.8-flash')
  assert.deepEqual(corpi.at(-1).provider, { ignore: ['deepinfra'] }, 'un altro modello: solo la lista della persona')
  store.impostaDiSerie('openrouter', 'z-ai/glm-5.3-flash', 'open-inference', false)
  await chiedi('z-ai/glm-5.3-flash')
  assert.deepEqual(corpi.at(-1).provider, { ignore: ['deepinfra'] }, 'tolta dalla persona: dalla chiamata dopo, senza riavviare')
})

test('SERIE-09 AL CONTRARIO — si toglie solo una voce che ESISTE nella tabella, e solo su OpenRouter', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-di-serie-'))
  t.after(() => rimuoviCartellaDiProva(dir))
  const store = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') })
  for (const [p, m, s, a] of [['openrouter', 'z-ai/glm-5.3-flash', 'deepinfra', false], ['openrouter', 'qwen/qwen3.8-flash', 'open-inference', false],
    ['anthropic', 'z-ai/glm-5.3-flash', 'open-inference', false], ['openrouter', 'z-ai/glm-5.3-flash', 'open-inference', 'no']]) {
    assert.throws(() => store.impostaDiSerie(p, m, s, a), { code: 'PROVIDER_RUNTIME_INVALID' }, `${p} ${m} ${s} ${a}`)
  }
  assert.deepEqual(store.getRuntime('openrouter').esclusiDiSerieTolti, [])
})

test('SERIE-01 — glm-5.3-flash esclude open-inference di serie; un altro modello niente', () => {
  assert.deepEqual(esclusiDiSerieAttivi('z-ai/glm-5.3-flash', []), ['open-inference'])
  assert.deepEqual(esclusiDiSerieAttivi('qwen/qwen3.8-flash', []), [])
  assert.deepEqual(esclusiDiSerieAttivi(undefined, []), [])
})

test('SERIE-02 — la variante dopo i due punti (`:nitro`, `:floor`) è lo stesso modello', () => {
  assert.deepEqual(esclusiDiSerieAttivi('z-ai/glm-5.3-flash:nitro', []), ['open-inference'])
})

test('SERIE-03 AL CONTRARIO — tolto dalla persona resta tolto', () => {
  const tolti = [chiaveDiSerie('z-ai/glm-5.3-flash', 'open-inference')]
  assert.deepEqual(esclusiDiSerieAttivi('z-ai/glm-5.3-flash', tolti), [])
  assert.deepEqual(esclusiDiSerieAttivi('z-ai/glm-5.3-flash:nitro', tolti), [])
})

test('SERIE-04 — ogni voce di serie dice perché (la riga delle Impostazioni lo mostra)', () => {
  for (const [modello, voci] of Object.entries(ESCLUSI_DI_SERIE)) {
    assert.match(modello, /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u)
    for (const v of voci) {
      assert.match(v.slug, /^[a-z0-9][a-z0-9._-]{0,47}$/u)
      assert.equal(typeof v.perche, 'string')
      assert.ok(v.perche.length > 10)
    }
  }
})

test('SERIE-05 — i tolti dal disco si leggono tolleranti: chiavi sconosciute o malformate cadono, niente eccezioni', () => {
  assert.deepEqual(normalizzaTolti(['z-ai/glm-5.3-flash#open-inference', 'boh', 42, 'z-ai/glm-5.3-flash#open-inference']),
    ['z-ai/glm-5.3-flash#open-inference'])
  assert.deepEqual(normalizzaTolti(null), [])
  assert.deepEqual(normalizzaTolti('x'), [])
})

test('SERIE-06 — nella richiesta: di serie ∪ lista della persona, senza doppioni; prima il modello, poi la persona', () => {
  const instradamento = { ignore: esclusiDiSerieAttivi('z-ai/glm-5.3-flash', []) }
  const provider = unisciEsclusi(unisciInstradamento(undefined, instradamento), ['deepinfra', 'open-inference'])
  assert.deepEqual(provider, { ignore: ['open-inference', 'deepinfra'] })
})

test('SERIE-07 AL CONTRARIO — nessun di serie attivo e nessuna lista: il corpo resta quello di sempre (stesso valore)', () => {
  const body = { sort: 'price' }
  assert.equal(unisciInstradamento(body, null), body)
  assert.equal(unisciInstradamento(body, { ignore: [] }) === body, false, 'un oggetto vuoto non è «niente»: ma non aggiunge esclusi')
  assert.deepEqual(unisciInstradamento(body, { ignore: [] }), { sort: 'price', ignore: [] })
})
