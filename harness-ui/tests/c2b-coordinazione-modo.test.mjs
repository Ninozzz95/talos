/*
 * ⛔⛔ C2b «Coordinazione» (owner 08/10/2026 sera, quattro tornate di AskUserQuestion; contratto in
 *   `Downloads/handoff-talos-2026-09-27/C2B-CONTRATTO-2026-10-08.md`) — il MODO di una sessione, calcolato lungo la catena dalla
 *   sessione fino alla radice, con la chiave `delega_sottotask` delle scelte per attrezzo:
 *   - un «nega» in qualunque anello ⇒ nega (mai);
 *   - un «chiedi» in qualunque anello, oppure la radice che non vale «sempre» (assente = spenta, di serie, anche per le sessioni
 *     di prima) ⇒ chiedi, motivo «spenta»;
 *   - altrimenti ⇒ sempre, finché l'albero non ha già 20 avvii da soli (poi chiedi, motivo «tetto»).
 * ⛔ Perché non la fusione di C2 (`unisciPermessiPerAttrezzo`): lì «Accesso pieno» concede da solo ogni attrezzo
 *   (`permessi-catena.mjs`, `CONCESSI_DA_SOLO`), e Coordinazione risulterebbe accesa senza che nessuno l'abbia scelta.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { CHIAVE_COORDINAZIONE, TETTO_AVVII_DA_SOLO, modoCoordinazione, sempreDellaFigliaVarrebbe } from '../src/coordinazione.mjs'
import { ATTREZZI_CON_PERMESSO_PER_ATTREZZO, permessiPerAttrezzoRichiestaValido } from '../src/config.mjs'

test('C2B-MODO-00 — la mappa delle scelte ACCETTA la chiave di Coordinazione, ma l\'insieme degli attrezzi resta com\'è', () => {
  for (const valore of ['sempre', 'chiedi', 'nega']) {
    assert.equal(permessiPerAttrezzoRichiestaValido({ [CHIAVE_COORDINAZIONE]: valore }), true, valore)
  }
  assert.equal(permessiPerAttrezzoRichiestaValido({ [CHIAVE_COORDINAZIONE]: 'boh' }), false, 'AL CONTRARIO: un valore storto si rifiuta')
  assert.equal(permessiPerAttrezzoRichiestaValido({ shell: 'chiedi', [CHIAVE_COORDINAZIONE]: 'sempre' }), true, 'insieme alle altre')
  assert.equal(permessiPerAttrezzoRichiestaValido({ delega_altro: 'sempre' }), false, 'AL CONTRARIO: nessun\'altra chiave nuova')
  // ⛔ fuori da quell'insieme apposta: lì «Accesso pieno» concede da solo, e il pannello degli attrezzi ne fa una riga
  assert.equal(ATTREZZI_CON_PERMESSO_PER_ATTREZZO.has(CHIAVE_COORDINAZIONE), false)
})

const S = (valore) => (valore === undefined ? {} : { [CHIAVE_COORDINAZIONE]: valore })
const SPENTA = { modo: 'chiedi', motivo: 'spenta' }

test('C2B-MODO-01 — la radice da sola: assente o «chiedi» è spenta, «sempre» è accesa, «nega» è mai', () => {
  assert.equal(CHIAVE_COORDINAZIONE, 'delega_sottotask')
  assert.equal(TETTO_AVVII_DA_SOLO, 20, 'owner 08/10: venti, il doppio del massimo misurato sulle sessioni CLI')
  assert.deepEqual(modoCoordinazione([S()]), SPENTA, 'di serie spenta, anche per una sessione di prima')
  assert.deepEqual(modoCoordinazione([null]), SPENTA, 'nessuna mappa: spenta')
  assert.deepEqual(modoCoordinazione([S('chiedi')]), SPENTA)
  assert.deepEqual(modoCoordinazione([S('sempre')]), { modo: 'sempre' })
  assert.deepEqual(modoCoordinazione([S('nega')]), { modo: 'nega' })
  // le altre chiavi non contano: un «sempre» sulla shell non accende Coordinazione
  assert.deepEqual(modoCoordinazione([{ shell: 'sempre', scrivi: 'sempre' }]), SPENTA)
})

test('C2B-MODO-02 — la catena: la figlia eredita dalla radice, non le sta mai sopra, e «nega» vince ovunque', () => {
  assert.deepEqual(modoCoordinazione([S(), S('sempre')]), { modo: 'sempre' }, 'figlia senza la chiave: eredita la radice accesa')
  assert.deepEqual(modoCoordinazione([S(), S(), S('sempre')]), { modo: 'sempre' }, 'anche la nipote')
  assert.deepEqual(modoCoordinazione([S('chiedi'), S('sempre')]), SPENTA, 'la figlia può essere più prudente')
  assert.deepEqual(modoCoordinazione([S('sempre'), S()]), SPENTA, 'AL CONTRARIO: mai sopra la radice spenta')
  assert.deepEqual(modoCoordinazione([S('sempre'), S('chiedi')]), SPENTA, 'revoca: spenta sulla radice, spenta per tutto l\'albero')
  assert.deepEqual(modoCoordinazione([S(), S('chiedi'), S('sempre')]), SPENTA, 'una madre spenta in mezzo spegne la nipote')
  assert.deepEqual(modoCoordinazione([S('nega'), S('sempre')]), { modo: 'nega' })
  assert.deepEqual(modoCoordinazione([S('sempre'), S('nega')]), { modo: 'nega' }, '«nega» in un antenato vince sulla figlia')
  assert.deepEqual(modoCoordinazione([S('chiedi'), S('nega')]), { modo: 'nega' }, '«nega» vince anche su «chiedi»')
})

test('C2B-MODO-03 — il tetto: 20 avvii da soli per albero, poi chiede col suo motivo', () => {
  assert.deepEqual(modoCoordinazione([S('sempre')], { avviiDaSolo: 19 }), { modo: 'sempre' })
  assert.deepEqual(modoCoordinazione([S('sempre')], { avviiDaSolo: 20 }), { modo: 'chiedi', motivo: 'tetto' })
  assert.deepEqual(modoCoordinazione([S(), S('sempre')], { avviiDaSolo: 25 }), { modo: 'chiedi', motivo: 'tetto' })
  // il motivo vero viene prima del conteggio: da spenta chiede perché è spenta, e «nega» resta nega
  assert.deepEqual(modoCoordinazione([S()], { avviiDaSolo: 30 }), SPENTA)
  assert.deepEqual(modoCoordinazione([S('nega')], { avviiDaSolo: 30 }), { modo: 'nega' })
  assert.deepEqual(modoCoordinazione([S('sempre')], { avviiDaSolo: 2, tetto: 2 }), { modo: 'chiedi', motivo: 'tetto' }, 'il tetto si passa')
})

test('C2B-MODO-04 — AL CONTRARIO: un valore storto non accende niente (vale «nega», come la fusione di C2)', () => {
  for (const storto of ['boh', 1, true, { sempre: true }, '']) {
    assert.deepEqual(modoCoordinazione([S(storto)]), { modo: 'nega' }, JSON.stringify(storto))
    assert.deepEqual(modoCoordinazione([S(), S(storto)]), { modo: 'nega' }, `nella radice: ${JSON.stringify(storto)}`)
  }
  assert.deepEqual(modoCoordinazione([]), SPENTA, 'nessun anello: spenta, non accesa')
  assert.deepEqual(modoCoordinazione(undefined), SPENTA)
})

test('C2B-MODO-05 — «Per questa sessione» sulla carta: vale solo se il «sempre» di quella sessione verrebbe onorato', () => {
  assert.equal(sempreDellaFigliaVarrebbe([S()]), true, 'la radice stessa: il suo sì accende davvero')
  assert.equal(sempreDellaFigliaVarrebbe([S('chiedi')]), true)
  assert.equal(sempreDellaFigliaVarrebbe([S(), S('sempre')]), true, 'figlia di una radice accesa')
  assert.equal(sempreDellaFigliaVarrebbe([S(), S()]), false, 'AL CONTRARIO: radice spenta, il sì della figlia non varrebbe')
  assert.equal(sempreDellaFigliaVarrebbe([S(), S('chiedi'), S('sempre')]), false, 'una madre spenta in mezzo')
  assert.equal(sempreDellaFigliaVarrebbe([S(), S('nega')]), false)
  assert.equal(sempreDellaFigliaVarrebbe([S('nega')]), false, 'un «nega» della sessione stessa non si scavalca dalla carta (vince il Nega, C2-R7)')
})
