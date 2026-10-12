/*
 * 11/10/2026 notte — TROVATO DAL VIVO col piano dell'owner sul 4177: scollegato ChatGPT dalla chat (carta approvata), il giro ha
 * fatto un'altra richiesta al modello del piano e si è chiuso con `RunError CHATGPT_NON_COLLEGATO`. La chat ha mostrato la carta
 * «This kind of error is not translated yet» col testo grezzo del server. ⇒ Gli errori del piano (`CHATGPT_*`) hanno la loro carta:
 * dice cosa è successo con le frasi già tradotte dei codici, e cosa fare (ricollegare, riprovare, o scegliere un altro modello).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spiegaErrore, vestizioneErrore } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';

test('PIANO-ERRORE-01: a plan error mid-turn gets its own card, in English and Italian; the code stays in the technical detail', () => {
  try {
    for (const [lingua, collegare, altro, riprova] of [
      ['en', /Continue with ChatGPT/u, /another model/u, /again/u],
      ['it', /Continue with ChatGPT/u, /un altro modello/u, /Riprova|riprova/u],
    ]) {
      impostaLingua(lingua);
      const scollegato = spiegaErrore('No ChatGPT account is connected.', 'CHATGPT_NON_COLLEGATO');
      assert.equal(scollegato.id, 'piano-chatgpt'); assert.equal(scollegato.riconosciuto, true);
      assert.doesNotMatch(scollegato.perche, /not translated|non è ancora tradott/u);
      // the reason is the code's own translated sentence, the same the routes use
      assert.match(scollegato.perche, lingua === 'en' ? /^No ChatGPT account is connected/u : /^Nessun account ChatGPT/u);
      assert.ok(scollegato.rimedi.some((r) => collegare.test(r)), `${lingua}: ${scollegato.rimedi}`);
      assert.ok(scollegato.rimedi.some((r) => altro.test(r)), `${lingua}: ${scollegato.rimedi}`);
      assert.match(scollegato.tecnico, /CHATGPT_NON_COLLEGATO/u);
      // a network failure is a "try again", not a "sign in again"
      const rete = spiegaErrore('OpenAI could not be reached.', 'CHATGPT_RETE');
      assert.equal(rete.id, 'piano-chatgpt');
      assert.ok(rete.rimedi.some((r) => riprova.test(r)), `${lingua}: ${rete.rimedi}`);
      assert.ok(!rete.rimedi.some((r) => collegare.test(r)), 'no sign-in for a network failure');
      for (const codice of ['CHATGPT_ACCESSO_SCADUTO', 'CHATGPT_PIANO_NON_ABILITATO', 'CHATGPT_RINNOVO_FALLITO', 'CHATGPT_SERVIZIO_NON_DISPONIBILE', 'CHATGPT_RICHIESTA_NON_AMMESSA', 'CHATGPT_PIANO_NON_AMMESSO']) {
        const s = spiegaErrore('', codice);
        assert.equal(s.id, 'piano-chatgpt', codice);
        assert.ok(s.perche && !/^errori\./u.test(s.perche), `${codice}: ${s.perche}`);
      }
      assert.notEqual(vestizioneErrore(scollegato).badge, vestizioneErrore(spiegaErrore('', 'XYZ_SCONOSCIUTO')).badge, 'not the unknown-error badge');
    }
  } finally { impostaLingua('it'); }
});

test('PIANO-ERRORE-02: AL CONTRARIO — the same words without a plan code do not become this card', () => {
  assert.notEqual(spiegaErrore('No ChatGPT account is connected.', '').id, 'piano-chatgpt');
  assert.notEqual(spiegaErrore('No ChatGPT account is connected.', 'PROVIDER_REQUEST_ERROR').id, 'piano-chatgpt');
});
