/**
 * 0.1.25 — la seconda porta dei fornitori esclusi (owner 09/10/2026): elencare libero, escludere e riammettere con la CARTA.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs'
import { creaOspiteFornitori } from '../src/fornitori-per-il-modello.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function scena(t, { slugDelFornitoreFn = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-ospite-fornitori-'))
  t.after(() => rimuoviCartellaDiProva(dir))
  const providerStore = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') })
  const fabbrica = creaOspiteFornitori({ providerStore, slugDelFornitoreFn })
  return { providerStore, ospite: fabbrica({}), delGiro: fabbrica({ automazioneDelGiro: 'auto-1' }) }
}

test('FORN-01 — elencare è libero (nessuna carta) e dice la lista della persona e i di-serie col loro stato', async (t) => {
  const { providerStore, ospite } = scena(t)
  providerStore.impostaEsclusi('openrouter', ['deepinfra'])
  assert.deepEqual(await ospite('provider_exclusions_list', {}, { fase: 'anteprima' }), { ok: true, carta: false })
  const { testo } = await ospite('provider_exclusions_list', {}, { fase: 'esegui' })
  assert.match(testo, /Excluded by the person, for every model: deepinfra\./u)
  assert.match(testo, /Excluded by default for z-ai\/glm-5\.3-flash: open-inference/u)
})

test('FORN-02 — escludere: l\'anteprima chiede la carta con prima → dopo e NON scrive; esegui scrive', async (t) => {
  const { providerStore, ospite } = scena(t)
  const anteprima = await ospite('provider_exclude', { provider: 'DeepInfra' }, { fase: 'anteprima' })
  assert.deepEqual(anteprima, { ok: true, carta: true, azione: { fornitore: 'deepinfra', cambi: [{ campo: 'persona', modello: null, prima: [], dopo: ['deepinfra'] }] } })
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusi, [], 'l\'anteprima non scrive')
  const fatto = await ospite('provider_exclude', { provider: 'DeepInfra' }, { fase: 'esegui' })
  assert.equal(fatto.ok, true)
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusi, ['deepinfra'])
})

test('FORN-03 — riammettere un di-serie: carta con attivo → tolto; poi escluderlo di nuovo lo RIMETTE (non va nella lista della persona)', async (t) => {
  const { providerStore, ospite } = scena(t)
  const via = await ospite('provider_allow', { provider: 'open-inference' }, { fase: 'anteprima' })
  assert.deepEqual(via.azione, { fornitore: 'open-inference', cambi: [{ campo: 'di-serie', modello: 'z-ai/glm-5.3-flash', prima: true, dopo: false }] })
  await ospite('provider_allow', { provider: 'open-inference' }, { fase: 'esegui' })
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusiDiSerieTolti, ['z-ai/glm-5.3-flash#open-inference'])
  const rimetti = await ospite('provider_exclude', { provider: 'open-inference', model: 'z-ai/glm-5.3-flash' }, { fase: 'anteprima' })
  assert.deepEqual(rimetti.azione.cambi, [{ campo: 'di-serie', modello: 'z-ai/glm-5.3-flash', prima: false, dopo: true }])
  await ospite('provider_exclude', { provider: 'open-inference', model: 'z-ai/glm-5.3-flash' }, { fase: 'esegui' })
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusiDiSerieTolti, [])
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusi, [], 'la lista della persona non si tocca')
})

test('FORN-04 — un nome umano si cerca col modello; senza modello si rifiuta subito, senza carta', async (t) => {
  const chiesti = []
  const { ospite } = scena(t, { slugDelFornitoreFn: async (q) => { chiesti.push(q); return 'open-inference' } })
  const senza = await ospite('provider_exclude', { provider: 'Open Inference' }, { fase: 'anteprima' })
  assert.equal(senza.ok, false)
  assert.match(senza.messaggio, /not a provider short name/u)
  const con = await ospite('provider_exclude', { provider: 'Open Inference', model: 'qwen/qwen3.8-flash' }, { fase: 'anteprima' })
  assert.equal(con.azione.fornitore, 'open-inference')
  assert.deepEqual(chiesti, [{ fornitore: 'Open Inference', modello: 'qwen/qwen3.8-flash' }])
})

test('FORN-05 AL CONTRARIO — niente da cambiare non chiede la carta; un giro di automazione non cambia niente; uno slug sbagliato si rifiuta', async (t) => {
  const { providerStore, ospite, delGiro } = scena(t)
  assert.deepEqual(await ospite('provider_allow', { provider: 'chutes' }, { fase: 'anteprima' }), { ok: true, carta: false })
  assert.match((await ospite('provider_allow', { provider: 'chutes' }, { fase: 'esegui' })).testo, /Nothing to change: chutes is not excluded/u)
  const giro = await delGiro('provider_exclude', { provider: 'deepinfra' }, { fase: 'anteprima' })
  assert.equal(giro.ok, false)
  assert.match(giro.messaggio, /automation run cannot change/u)
  assert.equal((await delGiro('provider_exclusions_list', {}, { fase: 'esegui' })).ok, true, 'leggere sì')
  assert.equal((await ospite('provider_exclude', { provider: '' }, { fase: 'anteprima' })).ok, false)
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusi, [])
})

/* ⛔ Review del bugfixer (09/10/2026, YELLOW) — i quattro casi trovati con una sonda, e la prova sull'INSTRADAMENTO, non solo sul negozio. */
test('FORN-06 — riammettere uno slug che sta SIA nella lista della persona SIA fra i di-serie: una carta per tutti e due, e l\'instradamento lo usa davvero', async (t) => {
  const { creaInstradamentoDiSerie } = await import('../src/esclusi-di-serie.mjs')
  for (const argomenti of [{ provider: 'open-inference' }, { provider: 'open-inference', model: 'z-ai/glm-5.3-flash' }]) {
    const { providerStore, ospite } = scena(t)
    providerStore.impostaEsclusi('openrouter', ['open-inference', 'chutes'])
    const anteprima = await ospite('provider_allow', argomenti, { fase: 'anteprima' })
    assert.deepEqual(anteprima.azione.cambi, [
      { campo: 'persona', modello: null, prima: ['open-inference', 'chutes'], dopo: ['chutes'] },
      { campo: 'di-serie', modello: 'z-ai/glm-5.3-flash', prima: true, dopo: false },
    ], JSON.stringify(argomenti))
    const fatto = await ospite('provider_allow', argomenti, { fase: 'esegui' })
    assert.match(fatto.testo, /Excluded for every model: chutes\. open-inference is allowed again for z-ai\/glm-5\.3-flash\./u)
    const instrada = creaInstradamentoDiSerie(() => providerStore.getRuntime('openrouter'))
    assert.equal(instrada('z-ai/glm-5.3-flash'), null, 'glm-5.3-flash non lo salta più')
    assert.deepEqual(providerStore.getRuntime('openrouter').esclusi, ['chutes'])
  }
})

test('FORN-07 — escludere per un modello ciò che quel modello già esclude di serie: niente da cambiare, niente carta', async (t) => {
  const { providerStore, ospite } = scena(t)
  assert.deepEqual(await ospite('provider_exclude', { provider: 'open-inference', model: 'z-ai/glm-5.3-flash' }, { fase: 'anteprima' }), { ok: true, carta: false })
  assert.match((await ospite('provider_exclude', { provider: 'open-inference', model: 'z-ai/glm-5.3-flash' }, { fase: 'esegui' })).testo,
    /Nothing to change: open-inference is already excluded by default for z-ai\/glm-5\.3-flash\./u)
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusi, [], 'non finisce nella lista di OGNI modello')
})

test('FORN-09 AL CONTRARIO — una carta con due cambi e la scrittura che fallisce: NIENTE cambia (memoria e disco), e il rifiuto lo dice', async (t) => {
  const { mkdirSync, rmdirSync, readFileSync } = await import('node:fs')
  const dir = mkdtempSync(join(tmpdir(), 'talos-ospite-fornitori-guasto-'))
  t.after(() => rimuoviCartellaDiProva(dir))
  // il file temporaneo del negozio diventa una CARTELLA: writeFileSync fallisce, come un disco pieno o un EPERM
  const runtimeFile = join(dir, 'providers.json')
  const negozio = createProviderCredentialStore({ env: {}, runtimeFile })
  negozio.impostaEsclusi('openrouter', ['open-inference', 'chutes'])
  const primaSuDisco = readFileSync(runtimeFile, 'utf8')
  const ospiteGuasto = creaOspiteFornitori({ providerStore: negozio })({})
  mkdirSync(`${runtimeFile}.tmp`)
  const no = await ospiteGuasto('provider_allow', { provider: 'open-inference' }, { fase: 'esegui' })
  assert.equal(no.ok, false)
  assert.match(no.messaggio, /nothing was changed/u)
  assert.deepEqual(negozio.getRuntime('openrouter').esclusi, ['open-inference', 'chutes'], 'la lista della persona è com\'era')
  assert.deepEqual(negozio.getRuntime('openrouter').esclusiDiSerieTolti, [], 'il di-serie è com\'era')
  assert.equal(readFileSync(runtimeFile, 'utf8'), primaSuDisco, 'il file non è cambiato')
  // e tolto il guasto la stessa carta passa intera
  rmdirSync(`${runtimeFile}.tmp`)
  assert.equal((await ospiteGuasto('provider_allow', { provider: 'open-inference' }, { fase: 'esegui' })).ok, true)
  const riletto = createProviderCredentialStore({ env: {}, runtimeFile })
  assert.deepEqual(riletto.getRuntime('openrouter').esclusi, ['chutes'])
  assert.deepEqual(riletto.getRuntime('openrouter').esclusiDiSerieTolti, ['z-ai/glm-5.3-flash#open-inference'])
})

test('FORN-09b AL CONTRARIO — il guasto della 0.1.25 v3: la lista scritta e il di-serie che fallisce. Ora una scrittura sola: niente a metà', async (t) => {
  const { providerStore } = scena(t)
  providerStore.impostaEsclusi('openrouter', ['open-inference', 'chutes'])
  // un negozio in cui la SECONDA scrittura (quella del di-serie) fallisce: con due scritture di fila la lista restava cambiata
  const guasto = Object.freeze({ ...providerStore, impostaDiSerie() { throw Object.assign(new Error('disco pieno'), { code: 'PROVIDER_RUNTIME_UNAVAILABLE' }) },
    impostaEsclusioni(provider, cambi) {
      if (cambi.diSerie?.length) throw Object.assign(new Error('disco pieno'), { code: 'PROVIDER_RUNTIME_UNAVAILABLE' })
      return providerStore.impostaEsclusioni(provider, cambi)
    } })
  const ospite = creaOspiteFornitori({ providerStore: guasto })({})
  const no = await ospite('provider_allow', { provider: 'open-inference' }, { fase: 'esegui' })
  assert.equal(no.ok, false)
  assert.match(no.messaggio, /nothing was changed/u)
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusi, ['open-inference', 'chutes'], 'la lista della persona NON è stata scritta a metà')
})

test('FORN-10 — impostaEsclusioni valida tutto PRIMA di scrivere: una voce di serie sbagliata non lascia passare la lista', async (t) => {
  const { providerStore } = scena(t)
  providerStore.impostaEsclusi('openrouter', ['chutes'])
  assert.throws(() => providerStore.impostaEsclusioni('openrouter', { esclusi: ['deepinfra'], diSerie: [{ modello: 'z-ai/glm-5.3-flash', slug: 'non-esiste', attivo: false }] }),
    { code: 'PROVIDER_RUNTIME_INVALID' })
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusi, ['chutes'])
  const dopo = providerStore.impostaEsclusioni('openrouter', { diSerie: [{ modello: 'z-ai/glm-5.3-flash', slug: 'open-inference', attivo: false }] })
  assert.deepEqual(dopo.esclusi, ['chutes'], 'esclusi assente = lista invariata')
  assert.deepEqual(dopo.esclusiDiSerieTolti, ['z-ai/glm-5.3-flash#open-inference'])
})

test('FORN-08 AL CONTRARIO — lista piena (30): il rifiuto arriva all\'anteprima, col suo motivo, mai dopo il sì', async (t) => {
  const { providerStore, ospite } = scena(t)
  providerStore.impostaEsclusi('openrouter', Array.from({ length: 30 }, (_, i) => `p${i}`))
  const anteprima = await ospite('provider_exclude', { provider: 'deepinfra' }, { fase: 'anteprima' })
  assert.equal(anteprima.ok, false)
  assert.match(anteprima.messaggio, /the list of excluded providers is full \(30\)/u)
})
