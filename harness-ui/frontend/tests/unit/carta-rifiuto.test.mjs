import assert from 'node:assert/strict';
import test from 'node:test';

import { vistaCartaRifiuto } from '../../src/components/carta-rifiuto.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { spiegaErrore, tonoDelTick, vestizioneErrore } from '../../src/components/errori.js';

/* FE-051 (owner 01/11/2026): la carta del rifiuto del modello. Frasi come nel bozzetto `bozzetto-rifiuto-modello/dati.js`. */
impostaLingua('it');
const base = { perche: 'Riprovare con lo stesso modello dà lo stesso rifiuto e può costare.', modelloCheHaRifiutato: 'a/uno', testo: 'Scrivi la lettera', nome: (m) => m.split('/')[1] };

test('RIFIUTO-CARTA-01: col modello che ha rifiutato: la frase del rifiuto e «Scegli un altro modello», mai un «Riprova»', () => {
  const v = vistaCartaRifiuto({ ...base, modelloOra: 'a/uno' });
  assert.equal(v.perche, base.perche);
  assert.deepEqual(v.azione, { tipo: 'scegli', testo: 'Scegli un altro modello' });
});

test('RIFIUTO-CARTA-02: scelto un altro modello il tasto rimanda con quel nome, e la frase dice che non è ancora ripartito', () => {
  const v = vistaCartaRifiuto({ ...base, modelloOra: 'b/due' });
  assert.equal(v.perche, 'Hai scelto due: il messaggio non è ancora ripartito.');
  assert.deepEqual(v.azione, { tipo: 'invia', testo: 'Invia di nuovo con due' });
});

test('RIFIUTO-CARTA-03 — AL CONTRARIO: tornando al modello di prima la carta torna quella di partenza', () => {
  assert.equal(vistaCartaRifiuto({ ...base, modelloOra: 'b/due' }).azione.tipo, 'invia');
  assert.equal(vistaCartaRifiuto({ ...base, modelloOra: 'a/uno' }).azione.tipo, 'scegli');
});

test('RIFIUTO-CARTA-04: dopo l invio dice con che modello è ripartito e non ha più tasti', () => {
  const v = vistaCartaRifiuto({ ...base, modelloOra: 'b/due', inviataCon: 'b/due' });
  assert.equal(v.perche, 'Messaggio inviato di nuovo con due.');
  assert.equal(v.azione, null);
});

test('RIFIUTO-CARTA-05: senza un messaggio da rimandare (giro di una delega) niente tasto che manderebbe il vuoto', () => {
  const v = vistaCartaRifiuto({ ...base, testo: '  ', modelloOra: 'b/due' });
  assert.equal(v.perche, 'Hai scelto due: il prossimo messaggio parte con questo modello.');
  assert.equal(v.azione, null);
});

test('RIFIUTO-CARTA-06: senza un modello in uso resta la carta di partenza', () => {
  assert.equal(vistaCartaRifiuto({ ...base, modelloOra: null }).azione.tipo, 'scegli');
});

test('RIFIUTO-FAMIGLIA-01: la frase del server, inglese o tradotta, è il rifiuto anche se il code è quello della risposta vuota', () => {
  for (const frase of ['The model refused to answer this conversation.', 'Il modello ha rifiutato di rispondere a questa conversazione. Scegli un altro modello.']) {
    const s = spiegaErrore(frase, 'PROVIDER_EMPTY_RESPONSE');
    assert.equal(s.id, 'rifiuto-del-modello', frase);
    assert.equal(s.cosa, 'Il modello ha rifiutato di rispondere a questa conversazione.');
    assert.equal(s.perche, base.perche);
    assert.deepEqual(s.rimedi, []);
  }
});

test('RIFIUTO-FAMIGLIA-02: testo a metà: dal code, con le sue frasi', () => {
  const s = spiegaErrore('⛔ the model stopped and refused to continue: the text that arrived is kept.', 'rifiuto-del-modello');
  assert.equal(s.id, 'rifiuto-del-modello');
  assert.equal(s.cosa, 'Il modello si è fermato e ha rifiutato di continuare.');
  assert.equal(s.perche, 'Il testo qui sopra è quello scritto fino a quel punto: può essere incompleto.');
});

test('RIFIUTO-FAMIGLIA-03: colore attenzione, non il rosso del guasto; badge «Rifiutata»', () => {
  const v = vestizioneErrore(spiegaErrore('The model refused to answer this conversation.', 'PROVIDER_EMPTY_RESPONSE'));
  assert.deepEqual({ badge: v.badge, titolo: v.titolo, tono: v.tono }, { badge: 'Rifiutata', titolo: 'TALOS · risposta rifiutata', tono: 'warning' });
  assert.equal(tonoDelTick(v), 'warning');
});

test('RIFIUTO-FAMIGLIA-04 — AL CONTRARIO: una risposta vuota qualunque resta nella sua famiglia', () => {
  const s = spiegaErrore('The model answered with neither text nor tools (2 times in a row; provider reason: length).', 'PROVIDER_EMPTY_RESPONSE');
  assert.equal(s.id, 'risposta-vuota-dopo-tentativi');
});

test('RIFIUTO-LINGUE: in inglese le frasi del bozzetto', () => {
  impostaLingua('en');
  try {
    assert.deepEqual(vistaCartaRifiuto({ ...base, modelloOra: 'b/due' }), { perche: 'You chose due: the message has not been sent again yet.', azione: { tipo: 'invia', testo: 'Send again with due' } });
    assert.equal(vistaCartaRifiuto({ ...base, modelloOra: 'b/due', inviataCon: 'b/due' }).perche, 'Message sent again with due.');
    assert.equal(vistaCartaRifiuto({ ...base, testo: '', modelloOra: 'b/due' }).perche, 'You chose due: the next message will use this model.');
    assert.equal(vistaCartaRifiuto({ ...base, modelloOra: 'a/uno' }).azione.testo, 'Choose another model');
    const s = spiegaErrore('x', 'rifiuto-del-modello');
    assert.equal(s.cosa, 'The model stopped and refused to continue.');
    assert.equal(s.perche, 'The text above is what it wrote up to that point: it may be incomplete.');
    assert.equal(vestizioneErrore(s).badge, 'Refused');
    assert.equal(vestizioneErrore(s).titolo, 'TALOS · answer refused');
  } finally { impostaLingua('it'); }
});
