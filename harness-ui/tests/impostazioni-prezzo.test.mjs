/*
 * Revisione avversaria della fase 8, REV8-06 (S3) — un prezzo d'uscita assente diventava «$0.00» (gratis) sulla carta del cambio di modello.
 *   Un prezzo vale solo con TUTTI E DUE i numeri, finiti e non negativi; altrimenti «price unknown». La funzione del server ora sta in un
 *   modulo (`prezzo-del-modello.mjs`) e si prova; il servizio fa lo stesso controllo su qualunque ospite.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { prezzoPerMilione } from '../src/impostazioni/prezzo-del-modello.mjs'
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaFonteSessione } from '../src/impostazioni/fonti-impostazioni.mjs'

test('PREZZO-01 dalle capacità del modello: i due numeri ci sono ⇒ per milione; uno manca, è vuoto, negativo o non numerico ⇒ null', () => {
  assert.deepEqual(prezzoPerMilione({ prezzoPrompt: 0.000002, prezzoCompletion: 0.000008 }), { in: 2, out: 8 })
  assert.deepEqual(prezzoPerMilione({ prezzoPrompt: '0', prezzoCompletion: '0' }), { in: 0, out: 0 }, 'gratis davvero (stringhe di OpenRouter) resta zero')
  assert.equal(prezzoPerMilione({ prezzoPrompt: 0.0000001, prezzoCompletion: null }), null, 'uscita assente: mai «$0.00»')
  assert.equal(prezzoPerMilione({ prezzoPrompt: 0.0000001 }), null)
  assert.equal(prezzoPerMilione({ prezzoPrompt: null, prezzoCompletion: 0.0000004 }), null)
  assert.equal(prezzoPerMilione({ prezzoPrompt: '', prezzoCompletion: '' }), null)
  assert.equal(prezzoPerMilione({ prezzoPrompt: '-1', prezzoCompletion: '-1' }), null, 'un prezzo «variabile» negativo è sconosciuto')
  assert.equal(prezzoPerMilione({ prezzoPrompt: 'abc', prezzoCompletion: 0 }), null)
  assert.equal(prezzoPerMilione(null), null)
})

test('PREZZO-02 nel servizio: un ospite che dà un numero non valido ⇒ «price unknown» nell\'esito, mai «$0.00» né un prezzo negativo', async () => {
  const s = { modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: null, fasciaVeloce: false, permessi: 'Workspace write', permessiPerAttrezzo: {} }
  const registro = { impostazioniCorrenti: () => structuredClone(s), aggiornaImpostazioni: async (_id, p) => { Object.assign(s, p); return { ok: true } },
    doveGiranoIComandi: async () => ({ ok: true }), comandiNellaConversazione: async () => ({ ok: true }) }
  const prezzi = { 'z-ai/glm-5.3-flash': { in: 0.1, out: 0.4 }, 'a/senza-uscita': { in: 0.1, out: NaN }, 'a/negativo': { in: -1, out: -1 } }
  const servizio = creaServizioImpostazioni({ fonti: { sessione: creaFonteSessione(() => registro) }, prezzoDelModelloFn: (id) => prezzi[id] ?? null })
  const fn = servizio.perLaSessione({ sessionId: 's1' })
  for (const [dopo, atteso] of [['a/senza-uscita', /\$0\.10\/\$0\.40 per million tokens in\/out → price unknown/u], ['a/negativo', /→ price unknown/u]]) {
    s.modello = 'z-ai/glm-5.3-flash'
    const rev = Number(/Revision (\d+)/u.exec((await fn('app_settings', { action: 'list', query: 'conversation.model' })).testo)[1])
    const esito = await fn('app_settings', { action: 'set', changes: [{ key: 'conversation.model', value: dopo }], expected_revision: rev }, { fase: 'esegui' })
    assert.ok(esito.ok, JSON.stringify(esito))
    assert.match(esito.testo, atteso, esito.testo)
    assert.doesNotMatch(esito.testo, /\$-|\$0\.00|\$NaN|\?\/|\/\?/u)
  }
})
