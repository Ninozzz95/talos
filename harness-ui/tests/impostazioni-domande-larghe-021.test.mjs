/*
 * 0.2.2-DL, giro 2 (revisione avversaria del 09/11/2026, reperto 2) — LA PORTA DEL MODELLO su «Domande a tutta larghezza».
 *   Le prove del primo giro guardavano solo `chiave` e `diSerie` della voce: una voce che scrive il campo di un'altra passava. Qui il
 *   modello fa `set` e si legge IL CAMPO SCRITTO nella copia della finestra, l'evento mandato alle finestre e ciò che resta dopo un riavvio.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs'

const CHIAVE = 'appearance.userBubbleFullWidth'

function banco(copia = creaCopiaFinestra()) {
  let n = 0
  const servizio = creaServizioImpostazioni({ copiaFinestra: copia, idFn: () => `id-${++n}`, attesaFinestraMs: 20 })
  const fn = servizio.perLaSessione({ sessionId: null })
  const leggi = async () => {
    const { testo } = await fn('app_settings', { action: 'list', query: CHIAVE }, { fase: 'esegui' })
    const riga = testo.split('\n').find((r) => r.includes(CHIAVE))
    return { riga, valore: /= (true|false);/u.exec(riga)?.[1], rev: Number(/Revision (\d+)/u.exec(testo)[1]) }
  }
  const metti = async (value) => fn('app_settings', { action: 'set', expected_revision: (await leggi()).rev, changes: [{ key: CHIAVE, value }] }, { fase: 'esegui', toolCallId: 'c' })
  return { servizio, copia, leggi, metti }
}

test('DLS-01 · senza copia il modello legge ACCESA; il suo `set` a false scrive il campo `userBubbleFullWidth`, e solo quello', async () => {
  const b = banco()
  assert.equal((await b.leggi()).valore, 'true', 'installazione nuova: il modello legge ciò che la persona vede')
  const eventi = []
  b.servizio.finestra.ascolta((evento) => { eventi.push(evento) })
  const esito = await b.metti(false)
  assert.match(esito.testo, /appearance\.userBubbleFullWidth: true → false/u)
  assert.deepEqual((await b.copia.leggi()).valori, { userBubbleFullWidth: false }, 'il campo scritto è quello della voce, e nessun altro')
  assert.deepEqual(eventi.map((e) => e.valori), [{ userBubbleFullWidth: false }], 'alle finestre arriva lo stesso campo')
  assert.equal((await b.leggi()).valore, 'false')
  /* la voce vicina («Chat a tutta larghezza») non si è mossa */
  const vicina = (await b.servizio.perLaSessione({ sessionId: null })('app_settings', { action: 'list', query: 'appearance.chatFullWidth' }, { fase: 'esegui' })).testo
  assert.match(vicina, /appearance\.chatFullWidth = false;/u)
  /* riaccesa: il campo torna true (scritto: sul server la copia è esplicita, non rada) */
  await b.metti(true)
  assert.deepEqual((await b.copia.leggi()).valori, { userBubbleFullWidth: true })
})

test('DLS-02 · un false scritto dal modello sta sul disco e resta spento dopo un riavvio; un true resta acceso', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'dls-')), 'preferenze-finestra.json') // giro 6 (R-E): nel TEMP di chi lancia, non in una cartella fissa
  const primo = banco(creaCopiaFinestra({ file }))
  await primo.metti(false)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).valori.userBubbleFullWidth, false)
  /* riavvio: copia e servizio nuovi sullo stesso file */
  const secondo = banco(creaCopiaFinestra({ file }))
  assert.equal((await secondo.leggi()).valore, 'false', 'dopo il riavvio resta spenta')
  assert.match((await secondo.metti(false)).testo, /Nothing to change/u, 'già spenta: nessuna scrittura')
  await secondo.metti(true)
  assert.equal((await banco(creaCopiaFinestra({ file })).leggi()).valore, 'true', 'riaccesa e riavviato: accesa')
})
