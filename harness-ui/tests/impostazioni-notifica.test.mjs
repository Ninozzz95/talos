/*
 * Fase 8, cura 3 (forma `FORMA-FASE-8-TRE-CURE-2026-11-01.md` §3, domanda 6 del Frontend, decisione D6) — LA NOTIFICA di un cambio fatto
 *   dal modello. Un fatto nuovo `impostazioni` nel registro delle notifiche del PC (`notifiche-scrittori.mjs`), a ogni `set`/`undo` del
 *   modello: chiave, prima → dopo, conversazione, `confermatoDa`.
 *   · Performance 3: si scrive DOPO l'esito, senza farlo aspettare; un fallimento della scrittura non cambia l'esito per la persona;
 *   · Frontend: non entra in «Da fare» né nel numero della campanella;
 *   · Mobile (correzione accolta): il telefono non legge il registro del PC — qui nessuna promessa al telefono.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs'
import { creaRegistroNotifiche } from '../src/notifiche-registro.mjs'
import { creaScrittoriNotifiche } from '../src/notifiche-scrittori.mjs'
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const giroDelCiclo = () => new Promise((r) => setImmediate(r))

async function banco(t, { osserva = 'scrittori', rompiRegistro = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'talos-imp-notifica-'))
  t.after(() => rimuoviCartellaDiProvaAttesa(dir))
  const registro = creaRegistroNotifiche({ file: join(dir, 'n.jsonl'), adesso: () => Date.parse('2026-11-01T21:00:00.000Z') })
  const segnalati = []
  const registroUsato = rompiRegistro ? { ...registro, scrivi: () => Promise.reject(new Error('disk full')) } : registro
  const scrittori = creaScrittoriNotifiche({ registro: registroUsato, segnala: (e) => segnalati.push(e) })
  const osservati = []
  const osservaCambioFn = osserva === 'scrittori' ? (ricevuta) => { osservati.push(ricevuta); scrittori.impostazioni(ricevuta, { nome: 'Una chat' }) }
    : osserva === 'lancia' ? () => { throw new Error('observer broken') }
      : osserva === 'appeso' ? () => new Promise(() => {})
        : osserva === 'rifiuta' ? () => Promise.reject(new Error('observer rejected'))
          : null
  let n = 0
  const servizio = creaServizioImpostazioni({ copiaFinestra: creaCopiaFinestra(), idFn: () => `id-${++n}`, attesaFinestraMs: 50, ...(osservaCambioFn ? { osservaCambioFn } : {}) })
  const fn = servizio.perLaSessione({ sessionId: 'sess-1', confermatoDaFn: () => ({ tipo: 'finestra-pc' }) })
  const rev = async () => Number(/Revision (\d+)/u.exec((await fn('app_settings', { action: 'list', section: 'appearance' }, { fase: 'esegui' })).testo)[1])
  return { registro, scrittori, servizio, fn, rev, osservati, segnalati }
}

test('IMP-NOTIF-01: un set del modello diventa UNA voce «impostazioni» — chiave, prima → dopo, conversazione, confermatoDa — fuori da «Da fare»', async (t) => {
  const b = await banco(t)
  const esito = await b.fn('app_settings', { action: 'set', expected_revision: await b.rev(), changes: [{ key: 'appearance.theme', value: 'paper' }] }, { fase: 'esegui', toolCallId: 'call-1' })
  assert.equal(esito.ok, true)
  await giroDelCiclo()
  await b.registro.attendi()
  const { voci } = await b.registro.elenco()
  const voce = voci.find((v) => v.fatto === 'impostazioni')
  assert.ok(voce, JSON.stringify(voci))
  assert.equal(voce.id, `impostazioni:sess-1:${esito.ricevuta}`)
  assert.equal(voce.azione, 'set')
  assert.deepEqual(voce.cosa, { tipo: 'sessione', id: 'sess-1', nome: 'Una chat' })
  assert.deepEqual(voce.porta, { tipo: 'sessione', id: 'sess-1' })
  assert.deepEqual(voce.dato, { genere: 'testo', valore: 'appearance.theme: "forge" → "paper"' })
  assert.deepEqual(voce.impostazioni, { ricevuta: esito.ricevuta, cambi: [{ chiave: 'appearance.theme', prima: 'forge', dopo: 'paper' }], confermatoDa: { tipo: 'finestra-pc' } })
  /* Frontend: non entra in «Da fare» né nel numero della campanella */
  assert.equal((await b.registro.riassunto()).totaleDaFare, 0)
  assert.equal(voci.filter((v) => v.fatto === 'impostazioni').length, 1)
  /* l'Annulla del modello: una seconda voce, `undo` */
  const annullo = await b.fn('app_settings', { action: 'undo', receipt_id: esito.ricevuta }, { fase: 'esegui', toolCallId: 'call-2' })
  assert.equal(annullo.ok, true, annullo.messaggio)
  await giroDelCiclo()
  await b.registro.attendi()
  const dopo = (await b.registro.elenco()).voci.filter((v) => v.fatto === 'impostazioni')
  assert.deepEqual(dopo.map((v) => v.azione), ['set', 'undo'])
  assert.equal(dopo[1].dato.valore, 'appearance.theme: "paper" → "forge"')
  assert.equal((await b.registro.riassunto()).totaleDaFare, 0)
})

test('IMP-NOTIF-02 (Performance 3): la notifica parte DOPO l\'esito e non lo fa aspettare; un osservatore che lancia, rifiuta o resta appeso non cambia l\'esito', async (t) => {
  const riferimento = await banco(t, { osserva: null })
  const atteso = await riferimento.fn('app_settings', { action: 'set', expected_revision: await riferimento.rev(), changes: [{ key: 'appearance.theme', value: 'paper' }] }, { fase: 'esegui', toolCallId: 'c' })
  const b = await banco(t)
  const esito = await b.fn('app_settings', { action: 'set', expected_revision: await b.rev(), changes: [{ key: 'appearance.theme', value: 'paper' }] }, { fase: 'esegui', toolCallId: 'c' })
  assert.equal(b.osservati.length, 0, 'all\'arrivo dell\'esito la notifica non è ancora partita')
  await giroDelCiclo()
  assert.equal(b.osservati.length, 1, 'parte al giro dopo del ciclo')
  assert.deepEqual(esito, atteso)
  for (const osserva of ['lancia', 'rifiuta', 'appeso']) {
    const x = await banco(t, { osserva })
    const r = await x.fn('app_settings', { action: 'set', expected_revision: await x.rev(), changes: [{ key: 'appearance.theme', value: 'paper' }] }, { fase: 'esegui', toolCallId: 'c' })
    assert.deepEqual(r, atteso, osserva)
    await giroDelCiclo()
  }
  /* il registro che non scrive: l'esito è lo stesso, e il guasto si segnala */
  const rotto = await banco(t, { rompiRegistro: true })
  const r = await rotto.fn('app_settings', { action: 'set', expected_revision: await rotto.rev(), changes: [{ key: 'appearance.theme', value: 'paper' }] }, { fase: 'esegui', toolCallId: 'c' })
  assert.deepEqual(r, atteso)
  await giroDelCiclo()
  await new Promise((ok) => setTimeout(ok, 10))
  assert.equal(rotto.segnalati.length, 1)
  assert.match(String(rotto.segnalati[0]?.message), /disk full/u)
})

test('IMP-NOTIF-03 AL CONTRARIO: niente voce per list, pick, un set che non cambia niente, un set rifiutato, l\'anteprima, e l\'Annulla fatto dalla persona', async (t) => {
  const b = await banco(t)
  await b.fn('app_settings', { action: 'list', query: 'theme' }, { fase: 'esegui' })
  await b.fn('app_settings', { action: 'pick', key: 'appearance.theme' }, { fase: 'esegui' })
  const rev = await b.rev()
  await b.fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'appearance.theme', value: 'forge' }] }, { fase: 'esegui', toolCallId: 'c1' })
  await b.fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'appearance.theme', value: 'neon' }] }, { fase: 'esegui', toolCallId: 'c2' })
  await b.fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'appearance.theme', value: 'paper' }] }, { fase: 'anteprima', toolCallId: 'c3' })
  await giroDelCiclo()
  await b.registro.attendi()
  assert.deepEqual((await b.registro.elenco()).voci, [])
  /* un set vero, poi l'Annulla della PERSONA dalle Impostazioni: quello no (è un suo gesto, non un cambio del modello) */
  const esito = await b.fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'appearance.theme', value: 'paper' }] }, { fase: 'esegui', toolCallId: 'c4' })
  await b.servizio.annullaDallaPersona({ receiptId: esito.ricevuta, origine: { tipo: 'pc' } })
  await giroDelCiclo()
  await b.registro.attendi()
  assert.deepEqual((await b.registro.elenco()).voci.map((v) => v.azione), ['set'])
  /* e lo scrittore da solo: una ricevuta che non viene dal modello, o senza conversazione, non scrive */
  b.scrittori.impostazioni({ id: 'set-x', sessionId: 'sess-1', origine: { tipo: 'pc' }, cambi: [{ chiave: 'appearance.theme', prima: 'a', dopo: 'b' }] })
  b.scrittori.impostazioni({ id: 'set-y', sessionId: null, origine: { tipo: 'modello', sessionId: null }, cambi: [{ chiave: 'appearance.theme', prima: 'a', dopo: 'b' }] })
  b.scrittori.impostazioni(null)
  await b.registro.attendi()
  assert.equal((await b.registro.elenco()).voci.length, 1)
})

test('IMP-NOTIF-04: il registro tiene solo la forma del fatto «impostazioni» (al più 10 cambi, valori brevi), e mai su altri fatti', async (t) => {
  const b = await banco(t)
  const lungo = 'x'.repeat(500)
  await b.registro.scrivi({ id: 'impostazioni:s:set-1', fatto: 'impostazioni', azione: 'set', cosa: { tipo: 'sessione', id: 's', nome: '' },
    impostazioni: { ricevuta: 'set-1', cambi: Array.from({ length: 12 }, (_, i) => ({ chiave: `k${i}`, prima: lungo, dopo: { annidato: true }, extra: 1 })), confermatoDa: { tipo: 'dispositivo', dispositivoId: 'pad', segreto: 'no' }, altro: 'no' } })
  const [voce] = (await b.registro.elenco()).voci
  assert.equal(voce.impostazioni.cambi.length, 10)
  assert.equal(voce.impostazioni.cambi[0].prima.length <= 200, true)
  assert.equal(voce.impostazioni.cambi[0].dopo, null, 'un oggetto non è un valore di un\'impostazione')
  assert.deepEqual(Object.keys(voce.impostazioni.cambi[0]).sort(), ['chiave', 'dopo', 'prima'])
  assert.deepEqual(voce.impostazioni.confermatoDa, { tipo: 'dispositivo', dispositivoId: 'pad' })
  assert.deepEqual(Object.keys(voce.impostazioni).sort(), ['cambi', 'confermatoDa', 'ricevuta'])
  await b.registro.scrivi({ id: 'fine:s:giro-1', fatto: 'fine', cosa: { tipo: 'sessione', id: 's' }, impostazioni: { ricevuta: 'set-1', cambi: [] } })
  const fine = (await b.registro.elenco()).voci.find((v) => v.fatto === 'fine')
  assert.equal(Object.hasOwn(fine, 'impostazioni'), false)
})

test('IMP-NOTIF-05 (giro 2, voce 2): un cambio della PERSONA dal DISPOSITIVO diventa la voce «impostazioni» con l\'origine del dispositivo; dal PC no', async (t) => {
  const b = await banco(t)
  const dalDispositivo = { origine: { tipo: 'dispositivo', dispositivoId: 'pad' }, confermatoDa: { tipo: 'dispositivo', dispositivoId: 'pad' } }
  /* una voce dell'app, senza conversazione: la voce non porta a una sessione */
  const app = await b.servizio.applicaDallaPersona({ changes: [{ key: 'appearance.theme', value: 'paper' }], ...dalDispositivo })
  /* nella conversazione da cui è partito: porta lì */
  const conv = await b.servizio.applicaDallaPersona({ sessionId: 'sess-1', changes: [{ key: 'appearance.colorMode', value: 'dark' }], ...dalDispositivo })
  /* AL CONTRARIO: la persona al PC (la nota in chat le basta) */
  await b.servizio.applicaDallaPersona({ sessionId: 'sess-1', changes: [{ key: 'appearance.density', value: 'comfortable' }], origine: { tipo: 'persona' }, confermatoDa: { tipo: 'finestra-pc' } })
  await giroDelCiclo()
  await b.registro.attendi()
  const voci = (await b.registro.elenco()).voci.filter((v) => v.fatto === 'impostazioni')
  assert.equal(voci.length, 2, JSON.stringify(voci))
  const perId = new Map(voci.map((v) => [v.id, v]))
  const a = perId.get(`impostazioni:app:${app.ricevuta}`)
  assert.ok(a, 'la voce dell\'app ha un id suo')
  assert.equal(a.azione, 'set')
  assert.equal(a.porta, null)
  assert.deepEqual(a.impostazioni.origine, { tipo: 'dispositivo', dispositivoId: 'pad' })
  assert.deepEqual(a.impostazioni.cambi, [{ chiave: 'appearance.theme', prima: 'forge', dopo: 'paper' }])
  const c = perId.get(`impostazioni:sess-1:${conv.ricevuta}`)
  assert.ok(c)
  assert.deepEqual(c.porta, { tipo: 'sessione', id: 'sess-1' })
  assert.deepEqual(c.impostazioni.origine, { tipo: 'dispositivo', dispositivoId: 'pad' })
  assert.equal((await b.registro.riassunto()).totaleDaFare, 0, 'non aspetta nessuno')
  /* il cambio del modello non porta `origine` (la forma di IMP-NOTIF-04 resta quella) */
  const delModello = await b.fn('app_settings', { action: 'set', expected_revision: await b.rev(), changes: [{ key: 'appearance.messageStyle', value: 'bubbles' }] }, { fase: 'esegui', toolCallId: 'c9' })
  await giroDelCiclo()
  await b.registro.attendi()
  const m = (await b.registro.elenco()).voci.find((v) => v.id === `impostazioni:sess-1:${delModello.ricevuta}`)
  assert.equal(Object.hasOwn(m.impostazioni, 'origine'), false)
})
