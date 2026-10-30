/*
 * 27/10/2026 (contratto cartelle bloccate, giro 2, revisione 1; richiesta della CLI) — DIFESA IN PROFONDITÀ nella finestra federata.
 * Nella CLI una scrittura di un dispositivo su una conversazione che esiste gira nella finestra che la possiede, dove il remoto non c'è
 * (`remotoFn()` null): il cancello del consenso di http-app saltava (lo copre l'ospite, `federation.ts` `checkForwardedWrite`). Con
 * `cartelleDispositiviFn` gira anche lì. Al contrario: senza l'opzione tutto come prima (il desktop ha sempre il remoto).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHttpApp } from '../src/http-app.mjs'
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs'

function banco({ cartelleDispositiviFn } = {}) {
  const ripresi = []
  const chiesti = []
  const sessionRegistry = {
    elenca: () => [], esiste: () => true,
    cartellaPerChatFile: async () => ({ cartella: 'C:\\progetti\\avm' }),
    resume: (sessionId) => { ripresi.push(sessionId); return { sessionId } },
  }
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry,
    ...(cartelleDispositiviFn ? { cartelleDispositiviFn: () => cartelleDispositiviFn(chiesti) } : {}) })
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 })
  return { chiama, ripresi, chiesti }
}
const DAL_PAD = { origine: 'telefono:pad-1', origineRemota: { tipo: 'telefono', nome: 'Pad', dispositivoId: 'pad-1' } }
const coordinatore = (risposta) => (chiesti) => ({ consentita: async (id, cartella) => { chiesti.push([id, cartella]); return risposta } })

test('DIFESA-01 finestra senza remoto, cartella NON consentita al dispositivo: la scrittura si rifiuta CONSENT_REQUIRED, niente ripreso', async () => {
  const b = banco({ cartelleDispositiviFn: coordinatore(false) })
  await assert.rejects(b.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s1/resume', corpo: { messaggio: 'ciao' }, ...DAL_PAD }),
    (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403)
  assert.deepEqual(b.ripresi, [])
  assert.deepEqual(b.chiesti, [['pad-1', 'C:\\progetti\\avm']], 'chiesto per QUEL dispositivo e la cartella della conversazione')
})

test('DIFESA-02 finestra senza remoto, cartella consentita: passa', async () => {
  const b = banco({ cartelleDispositiviFn: coordinatore(true) })
  await b.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s1/resume', corpo: { messaggio: 'ciao' }, ...DAL_PAD })
  assert.deepEqual(b.ripresi, ['s1'])
})

test('DIFESA-03 al contrario: dal PC il coordinatore non si interpella; senza l\'opzione tutto come prima', async () => {
  const b = banco({ cartelleDispositiviFn: coordinatore(false) })
  await b.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s1/resume', corpo: { messaggio: 'ciao' }, origine: 'pc' })
  assert.deepEqual(b.ripresi, ['s1'])
  assert.deepEqual(b.chiesti, [])
  const senza = banco()
  await senza.chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s1/resume', corpo: { messaggio: 'ciao' }, ...DAL_PAD })
  assert.deepEqual(senza.ripresi, ['s1'], 'oggi, senza remoto e senza opzione, il cancello non c\'è (lo copre l\'ospite della CLI)')
})
