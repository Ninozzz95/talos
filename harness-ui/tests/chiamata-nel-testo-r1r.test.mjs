/*
 * R1-R (CLI 30/10/2026, misurata sulla suite della CLI su r4 3d69a1dd5: «partial answer» rigiocato come «partial »). Il filtro di R-34
 * tratteneva la parola finale quando era l'inizio di un nome offerto («answer» → answer_child_question) e la perdeva se il flusso finiva
 * senza `chiudi()`: Stop, errore, silenzio, taglio. Forma concordata con Desktop, CLI e Mobile:
 *   - ogni fine NON normale svuota il trattenuto UNA volta, nel testo e nei delta (la garanzia: Mobile);
 *   - una pausa del fornitore di RILASCIO_DOPO_PAUSA_MS rilascia un possibile attacco (solo per la vista dal vivo), e nessun timer
 *     sopravvive alla fine del flusso (Desktop, CLI);
 *   - un attacco GIÀ cominciato e tagliato non va a schermo né nella risposta: diventa «interrotta» nel giornale (Desktop, CLI), ma solo
 *     se ha ancora la taglia di una chiamata — un falso attacco seguito da tanta prosa torna testo (Mobile).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as nucleo from '../src/kernel/talosHarness.mjs';
import { creaFiltroChiamataNelTesto } from '../src/kernel/chiamata-nel-testo.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

/* letti dal modulo (e non importati per nome) così la prova si può far girare anche sul nucleo di PRIMA della cura e vederla rossa */
const { consumaFlussoSSE, talosLavora } = nucleo
const RILASCIO_DOPO_PAUSA_MS = nucleo.RILASCIO_DOPO_PAUSA_MS ?? 300
const OFFERTI = ['shell', 'leggi', 'answer_child_question', 'answer_parent_question']
const CODA_G_R3 = 'Confronto il sorgente vero della funzione caricata da Node con quello che vedo nel file:shell<arg_key>comando</arg_key><arg_value>node -e "\nimport(\'./src/kernel/confine-dati.mjs\').then(m => console.log(m.creaFiltroConfiniNelTesto.toString().slice(0, 800)))"</arg_value><arg_key>description: Stampa il sorgente della funzione caricata</arg_value></tool_call>'
const FRASE_G_R3 = 'Confronto il sorgente vero della funzione caricata da Node con quello che vedo nel file:'

const enc = new TextEncoder()
const pacchetto = (o) => enc.encode(`data: ${JSON.stringify(o)}\n\n`)
const dorme = (ms) => new Promise((r) => { setTimeout(r, ms) })
/* un flusso a copione: testo ⇒ un delta; { pausa } ⇒ silenzio; { appeso } ⇒ silenzio per sempre (senza timer); 'FINE' ⇒ fine normale; 'TAGLIO' ⇒ chiuso senza evento finale; 'ERRORE' ⇒ il trasporto cade */
function flussoACopione(passi, { quando } = {}) {
  return new Response(new ReadableStream({
    async start(c) {
      for (const p of passi) {
        if (typeof p === 'object') { if (p.appeso) await new Promise(() => {}); await dorme(p.pausa); continue }
        /* `c.error()` butta i pezzi in coda: prima si lascia leggere quello che c'è */
        if (p === 'ERRORE') await dorme(30)
        if (p === 'FINE') { c.enqueue(pacchetto({ choices: [{ delta: {}, finish_reason: 'stop' }] })); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); return }
        if (p === 'TAGLIO') { c.close(); return }
        if (p === 'ERRORE') { c.error(new TypeError('terminated')); return }
        c.enqueue(pacchetto({ choices: [{ delta: { content: p } }] }))
        quando?.(p)
      }
    },
  }))
}
async function consuma(passi, opzioni = {}) {
  const delta = []
  const tempi = []
  const altri = []
  const t0 = Date.now()
  const onDelta = (d) => {
    if (d.tipo === 'testo') { delta.push(d.delta); tempi.push(Date.now() - t0) } else altri.push(d)
  }
  let esito = null
  let errore = null
  try { esito = await consumaFlussoSSE(flussoACopione(passi, opzioni), onDelta, { nomiAttrezzi: OFFERTI, inattivitaDatiMs: 0, ...opzioni.flusso }) } catch (e) { errore = e }
  return { delta, tempi, altri, esito, errore }
}

test('R34-22 (R1-R) il filtro: un prefisso di un nome offerto è «in attesa di attacco» e si rilascia; un attacco cominciato no', () => {
  const f = creaFiltroChiamataNelTesto(OFFERTI)
  assert.equal(f.scrivi('partial answer'), 'partial ')
  assert.equal(f.inAttesaDiAttacco(), true)
  assert.equal(f.rilascia(), 'answer')
  assert.equal(f.inAttesaDiAttacco(), false)
  const g = creaFiltroChiamataNelTesto(OFFERTI)
  g.scrivi('vedo:shell<arg_key>comando')
  assert.equal(g.inAttesaDiAttacco(), false, 'un attacco cominciato non aspetta una pausa')
  assert.equal(g.rilascia(), '', 'e non si rilascia')
  assert.deepEqual(g.chiudiInterrotto(), { testo: '', interrotta: { nome: 'shell', forma: 'glm', frammento: 'shell<arg_key>comando' } })
})

for (const [nome, fine] of [['flusso tagliato senza evento finale', 'TAGLIO'], ['errore del trasporto', 'ERRORE']]) {
  test(`R34-23 (R1-R, Mobile) ${nome} subito dopo un prefisso: la parola resta nei delta E nel parziale salvato`, async () => {
    const { delta, errore } = await consuma(['partial answer', fine])
    assert.ok(errore, 'il flusso finisce in errore')
    assert.equal(delta.join(''), 'partial answer')
    assert.equal(errore.parziale?.content, 'partial answer')
  })
}

test('R34-24 (R1-R, Mobile) Stop a metà prefisso: la parola resta, e dopo lo Stop nessun delta in più nemmeno 500 ms dopo (Desktop)', async () => {
  const ac = new AbortController()
  const { delta, errore } = await consuma(['partial answer', { pausa: 2_000 }, 'FINE'], { quando: () => setTimeout(() => ac.abort(), 50), flusso: { segnaleStop: ac.signal } })
  assert.equal(errore?.fermatoSuRichiesta, true)
  assert.equal(delta.join(''), 'partial answer')
  const quanti = delta.length
  await dorme(500)
  assert.equal(delta.length, quanti, 'nessun rilascio dopo la fine del flusso')
})

test('R34-31 (R1-R, Desktop S3) un ascoltatore che lancia sul delta dello svuotamento NON copre lo Stop, e il parziale resta giusto', async () => {
  const ac = new AbortController()
  const visti = []
  const onDelta = (d) => { if (d.tipo === 'testo') { visti.push(d.delta); if (d.delta === 'answer') throw new Error('ascoltatore rotto') } }
  let errore = null
  try {
    await consumaFlussoSSE(flussoACopione(['partial answer', { appeso: true }], { quando: () => setTimeout(() => ac.abort(), 20) }), onDelta, { nomiAttrezzi: OFFERTI, inattivitaDatiMs: 0, segnaleStop: ac.signal })
  } catch (e) { errore = e }
  assert.equal(errore?.fermatoSuRichiesta, true, `l'errore che esce è lo Stop: ${errore?.message}`)
  assert.deepEqual(visti, ['partial ', 'answer'])
})

test('R34-25 (R1-R) silenzio del fornitore a metà prefisso: la parola resta', async () => {
  const { delta, errore } = await consuma(['partial answer', { pausa: 2_000 }, 'FINE'], { flusso: { inattivitaDatiMs: 100 } })
  assert.ok(errore, 'il silenzio chiude il flusso')
  assert.equal(delta.join(''), 'partial answer')
})

test(`R34-26 (R1-R) una pausa di 1 s dopo un prefisso: la parola arriva a ~${RILASCIO_DOPO_PAUSA_MS} ms, e nessun pezzo dopo la pausa si perde`, async () => {
  const { delta, tempi, esito } = await consuma(['partial answer', { pausa: 1_000 }, ' and the rest.', 'FINE'])
  assert.equal(esito.scelta.content, 'partial answer and the rest.')
  assert.equal(delta.join(''), 'partial answer and the rest.')
  const i = delta.indexOf('answer')
  assert.ok(i >= 0, JSON.stringify(delta))
  assert.ok(tempi[i] >= RILASCIO_DOPO_PAUSA_MS - 20 && tempi[i] < 900, `rilasciata durante la pausa, a ${tempi[i]} ms`)
})

test('R34-27 (R1-R, CLI) nessun timer resta vivo dopo la fine del flusso, normale o fermata', async (t) => {
  const timer = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length
  /* i timer della pausa sono `unref` (non tengono vivo il processo, e `getActiveResourcesInfo` non li conta): si contano a mano quelli
     da RILASCIO_DOPO_PAUSA_MS armati e mai spenti né scattati alla fine del flusso */
  const vivi = new Set()
  const { setTimeout: st, clearTimeout: ct } = globalThis
  globalThis.setTimeout = (fn, ms, ...a) => { const h = st((...x) => { vivi.delete(h); fn(...x) }, ms, ...a); if (ms === RILASCIO_DOPO_PAUSA_MS) vivi.add(h); return h }
  globalThis.clearTimeout = (h) => { vivi.delete(h); return ct(h) }
  t.after(() => { globalThis.setTimeout = st; globalThis.clearTimeout = ct })
  const prima = timer()
  await consuma(['partial answer', 'FINE'])
  assert.equal(vivi.size, 0, 'dopo la fine normale nessun timer della pausa resta armato')
  const ac = new AbortController()
  await consuma(['partial answer', { appeso: true }], { quando: () => st(() => ac.abort(), 20), flusso: { segnaleStop: ac.signal } })
  assert.equal(vivi.size, 0, 'dopo lo Stop nessun timer della pausa resta armato')
  await dorme(0)
  assert.ok(timer() <= prima, `timer vivi: prima ${prima}, dopo ${timer()}`)
})

for (const fine of ['ERRORE', 'STOP']) test(`R34-28 (R1-R, Desktop e CLI) ${fine} a metà della coda vera di G r3: la frase c'è, il markup mai, e c'è l'«interrotta»`, async () => {
  const ac = new AbortController()
  const taglio = CODA_G_R3.indexOf('</arg_value>')
  const passi = [CODA_G_R3.slice(0, 60), CODA_G_R3.slice(60, taglio), fine === 'STOP' ? { pausa: 2_000 } : 'ERRORE', 'FINE']
  const { delta, altri, errore } = await consuma(passi, fine === 'STOP' ? { quando: (p) => { if (p.includes('<arg_key>')) setTimeout(() => ac.abort(), 20) }, flusso: { segnaleStop: ac.signal } } : {})
  assert.ok(errore)
  assert.equal(delta.join(''), FRASE_G_R3, 'la frase prima della coda, nei delta')
  if (fine === 'ERRORE') assert.equal(errore.parziale.content, FRASE_G_R3, 'e nel parziale salvato')
  const interrotte = altri.filter((d) => d.tipo === 'chiamata-nel-testo-interrotta')
  assert.equal(interrotte.length, 1, 'una volta sola')
  assert.equal(interrotte[0].nome, 'shell')
  assert.ok(interrotte[0].frammento.startsWith('shell<arg_key>comando'))
})

test('R34-29 (R1-R, Mobile) AL CONTRARIO: un falso attacco seguito da 5 KB di prosa, poi Stop ⇒ la prosa resta nel testo', async () => {
  const ac = new AbortController()
  const prosa = 'Il formato è shell<arg_key> e poi spiego a lungo. ' + 'Questa è prosa vera della risposta. '.repeat(150)
  const { delta, altri, errore } = await consuma([prosa, { pausa: 2_000 }, 'FINE'], { quando: () => setTimeout(() => ac.abort(), 20), flusso: { segnaleStop: ac.signal } })
  assert.equal(errore?.fermatoSuRichiesta, true)
  assert.equal(delta.join(''), prosa)
  assert.equal(altri.some((d) => d.tipo === 'chiamata-nel-testo-interrotta'), false)
})

test('R34-32 (R1-R, CLI e Mobile «B») una chiamata VERA strutturata di 3 KB (la forma di G r3) tagliata dallo Stop: «interrotta», mai markup', async () => {
  const ac = new AbortController()
  const frase = 'Sto per lanciare il controllo:'
  const coda = 'shell<arg_key>comando</arg_key><arg_value>node -e "' + 'console.log(1); '.repeat(200)
  assert.ok(coda.length > 3_000)
  const pezzi = [frase, ...Array.from({ length: Math.ceil(coda.length / 500) }, (_, i) => coda.slice(i * 500, i * 500 + 500))]
  const { delta, altri, errore } = await consuma([...pezzi, { appeso: true }], { quando: (p) => { if (p === pezzi.at(-1)) setTimeout(() => ac.abort(), 20) }, flusso: { segnaleStop: ac.signal } })
  assert.equal(errore?.fermatoSuRichiesta, true)
  assert.equal(delta.join(''), frase)
  const i = altri.filter((d) => d.tipo === 'chiamata-nel-testo-interrotta')
  assert.equal(i.length, 1)
  assert.equal(i[0].nome, 'shell')
})

test('R34-33 (R1-R, Mobile «B») AL CONTRARIO: un falso attacco strutturato seguito da più di 16 KB di prosa, poi Stop ⇒ tutto testo', async () => {
  const ac = new AbortController()
  const testo = 'Il formato è shell<arg_key>x</arg_key><arg_value>ls e poi spiego a lungo. ' + 'Questa è prosa vera della risposta. '.repeat(480)
  assert.ok(testo.length > 16 * 1024 && testo.length < 64 * 1024)
  const { delta, altri, errore } = await consuma([testo, { appeso: true }], { quando: () => setTimeout(() => ac.abort(), 20), flusso: { segnaleStop: ac.signal } })
  assert.equal(errore?.fermatoSuRichiesta, true)
  assert.equal(delta.join(''), testo)
  assert.equal(altri.some((d) => d.tipo === 'chiamata-nel-testo-interrotta'), false)
})

test('R34-30 (R1-R) il giro: una coda tagliata da un errore diventa UN evento «interrotta» (giornale), il frammento mai in un delta', async () => {
  const eventi = []
  const delta = []
  let i = 0
  const taglio = CODA_G_R3.indexOf('</arg_value>')
  await talosLavora({
    cartella: cartellaDiProva('talos-r1r-'), task: { consegna: 'correggi il confine' }, modello: 'z-ai/glm-5.3-flash', chiave: 'finta',
    onDelta: (d) => { if (d.tipo === 'testo') delta.push(d.delta) }, onGiro: (e) => eventi.push(e),
    fetchDiRete: async () => (i++ === 0 ? flussoACopione([CODA_G_R3.slice(0, taglio), 'ERRORE']) : flussoACopione(['Fatto.', 'FINE'])),
  }).catch(() => null)
  assert.doesNotMatch(delta.join(''), /<arg_key>|shell<arg/u, JSON.stringify(delta.join('').slice(-120)))
  const ev = eventi.filter((e) => e.tipo === 'chiamata-nel-testo')
  assert.deepEqual(ev.map((e) => e.esito), ['interrotta'])
  assert.equal(ev[0].nome, 'shell')
  assert.equal(ev[0].modello, 'z-ai/glm-5.3-flash')
})
