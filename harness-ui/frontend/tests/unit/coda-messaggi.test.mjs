import assert from 'node:assert/strict';
import test from 'node:test';

import { descriviCoda, normalizzaStatoCoda } from '../../src/components/coda-messaggi.js';

/* ───────────── ⭐⭐ 14/09 — le parole della coda (vedi le fonti nel modulo) ───────────── */

test('CODA — a giro vivo: quanti, cosa, quando parte, e l’azione è la stessa del bivio', () => {
  const d = descriviCoda({ voci: [{ id: 'a', testo: 'poi aggiorna il README', immagini: 0 }], inPausa: false }, { giroVivo: true });
  assert.equal(d.conteggio, '1 in coda');
  assert.equal(d.testo, '«poi aggiorna il README»', 'la riga mostra il messaggio: la spiegazione non ci stava mai');
  assert.equal(d.spiegazione, 'Entra dopo il passo in corso di TALOS');
  assert.equal(d.titoloTesto, '«poi aggiorna il README» — Entra dopo il passo in corso di TALOS');
  assert.equal(d.azione, 'Indirizza ora');
  assert.equal(d.tono, 'neutro');
});

test('CODA — dopo uno stop: in pausa, e non promette più una partenza che non avverrà', () => {
  const d = descriviCoda({ voci: [{ id: 'a', testo: 'poi aggiorna il README' }, { id: 'b', testo: 'e i test' }], inPausa: true });
  assert.equal(d.conteggio, '2 in pausa', 'quanti aspettano sta nel badge, che non si accorcia');
  assert.equal(d.tono, 'attenzione');
  assert.equal(d.testo, '«poi aggiorna il README»');
  assert.equal(d.spiegazione, 'In pausa dallo stop: parte solo se lo invii tu');
  assert.equal(d.azione, 'Invia ora');
  assert.doesNotMatch(`${d.testo} ${d.spiegazione}`, /fine di questo giro|finisce di rispondere/, '⛔ la frase del giro vivo non sopravvive a uno stop');
});

test('CODA — la pausa la decide lo stop, l’azione la decide il giro (14/09, giro vero)', () => {
  const inPausaAGiroVivo = descriviCoda({ voci: [{ id: 'b', testo: 'e i test' }], inPausa: true }, { giroVivo: true });
  assert.equal(inPausaAGiroVivo.conteggio, '1 in pausa', 'un giro ripreso non toglie la pausa alle voci rimaste');
  assert.equal(inPausaAGiroVivo.azione, 'Indirizza ora', 'a giro vivo la stessa rotta indirizza: il pulsante lo dice');
  assert.doesNotMatch(`${inPausaAGiroVivo.spiegazione} ${inPausaAGiroVivo.titoloTesto}`, /giro è fermo/, '⛔ la parola che mentiva nella foto 06');
  const ferma = descriviCoda({ voci: [{ id: 'b', testo: 'e i test' }], inPausa: true }, { giroVivo: false });
  assert.equal(ferma.azione, 'Invia ora', 'AL CONTRARIO: stesso stato della coda, giro fermo, azione diversa');
  assert.equal(ferma.conteggio, inPausaAGiroVivo.conteggio);
});

test('CODA AL CONTRARIO — niente in coda, niente banner; una pausa senza voci non è una pausa', () => {
  assert.equal(descriviCoda({ voci: [], inPausa: false }), null);
  assert.equal(descriviCoda({ voci: [], inPausa: true }), null);
  assert.equal(descriviCoda(undefined), null);
  assert.deepEqual(normalizzaStatoCoda({ voci: [], inPausa: true }), { voci: [], inPausa: false });
  assert.deepEqual(normalizzaStatoCoda({ voci: [{ id: 'x', testo: '   ' }, 7, null], inPausa: true }), { voci: [], inPausa: false }, 'voci senza testo non contano');
});

test('CODA — un testo lunghissimo ha un tetto nella riga, il titolo lo porta INTERO, e più voci si contano', () => {
  const lungo = 'Controlla ogni file della cartella dei test uno per uno fino in fondo e poi scrivi il resoconto '.repeat(3).trim();
  const d = descriviCoda({ voci: [{ id: 'a', testo: lungo }, { id: 'b', testo: 'x' }, { id: 'c', testo: 'y' }] });
  assert.equal(d.conteggio, '3 in coda');
  assert.ok(d.testo.length <= 202 && d.testo.endsWith('…»'), `tetto della riga: ${d.testo.length} caratteri`);
  assert.doesNotMatch(d.testo, /altr/, '⛔ niente conteggio in coda al testo: è la parte che i puntini tagliavano');
  assert.ok(d.titoloTesto.startsWith(`«${lungo}»`), '⛔ il titolo porta il messaggio intero, non quello tagliato della riga');
});

test('CODA — un messaggio di 90 caratteri NON si taglia a mano: decide la larghezza della riga', () => {
  const medio = 'Quando hai finito, aggiungi in fondo una riga che dica quanti numeri hai trovato davvero.';
  assert.equal(descriviCoda({ voci: [{ id: 'a', testo: medio }] }).testo, `«${medio}»`, '14/09, giro vero: a 1440 px si fermava a «quan…» con spazio libero');
});

test('RIPRESA-CODA-ORIGINE — risultato agente distinto da input persona',()=>{
 const c=normalizzaStatoCoda({voci:[{id:'q',testo:'risultato',origine:'delega',childId:'f'}]});
 assert.equal(c.voci[0].origine,'delega');assert.equal(c.voci[0].childId,'f');assert.match(descriviCoda(c).testo,/Risultato di un agente/);
});

test('RIPRESA-CODA-RISULTATO — schema valido, sorgente e testo ostile restano dati',async()=>{
 const m=await import('../../src/components/coda-messaggi.js');assert.equal(typeof m.descriviRisultatoDelega,'function');
 const testo='Avviso\n'+JSON.stringify({schema:'talos.subagent-result.v1',childId:'a',stato:'concluso',compito:'Test',risultatoNonFidato:'<script>mai()</script>'});
 assert.deepEqual(m.descriviRisultatoDelega(testo,'a'),{titolo:'Test',testo:'<script>mai()</script>',errore:false});
 assert.equal(m.descriviRisultatoDelega(testo,'b'),null);assert.equal(m.descriviRisultatoDelega('rotto','a'),null);
});

/* ⛔ TACCUINO (09/10/2026, bugfixer): la figlia fermata consegna la frase del kernel, in inglese; la nota «sotto-agente non
   concluso» la mostrava così anche in italiano (misurato sulla 4176). Si scrive dal dizionario, col punto tradotto. */
test('TACCUINO-FERMATA — la fermata di una figlia si legge nella lingua dell’interfaccia, il resto passa com’è', async () => {
  const { impostaLingua } = await import('../../src/components/lingua.js');
  const m = await import('../../src/components/coda-messaggi.js');
  const contratto = (risultatoNonFidato) => 'Avviso\n' + JSON.stringify({ schema: 'talos.subagent-result.v1', childId: 'f', stato: 'non concluso', compito: 'Crea il file', risultatoNonFidato });
  try {
    impostaLingua('it');
    assert.equal(m.descriviRisultatoDelega(contratto('⛔ stopped on request: while the model was answering, at round 1.'), 'f').testo,
      '⛔ Fermata su richiesta: mentre il modello stava rispondendo, al giro 1.');
    assert.equal(m.fermataNellaLingua('⛔ stopped on request.'), '⛔ Fermata su richiesta.');
    assert.equal(m.fermataNellaLingua('⛔ stopped on request: a point nobody declared.\nseconda riga'), '⛔ Fermata su richiesta: a point nobody declared.\nseconda riga',
      'un punto che il dizionario non conosce passa com’è, la riga dopo resta');
    impostaLingua('en');
    assert.equal(m.fermataNellaLingua('⛔ stopped on request: while the model was answering, at round 3.'), '⛔ Stopped on request: while the model was answering, at round 3.');
    impostaLingua('it');
    assert.equal(m.fermataNellaLingua('Il file non esiste.'), 'Il file non esiste.', 'un altro errore non si tocca');
    const concluso = 'Avviso\n' + JSON.stringify({ schema: 'talos.subagent-result.v1', childId: 'f', stato: 'concluso', compito: 'X', risultatoNonFidato: '⛔ stopped on request.' });
    assert.equal(m.descriviRisultatoDelega(concluso, 'f').testo, '⛔ stopped on request.', 'un risultato CONCLUSO è testo del modello: non si riscrive');
  } finally { impostaLingua('it'); }
});

// C3 tappa 4 (09/10/2026): la frase di PAUSA del kernel («⏸ paused on request: before round 3.») nella lingua dell'interfaccia,
// col punto tradotto dalla stessa tabella; al contrario, una frase di fermata resta di fermata e un testo qualunque non si tocca.
test('C3-PAUSA-NELLA-LINGUA — the kernel pause sentence is written in the interface language', async () => {
  const { impostaLingua } = await import('../../src/components/lingua.js');
  const m = await import('../../src/components/coda-messaggi.js');
  try {
    impostaLingua('en');
    assert.equal(m.fermataNellaLingua('⏸ paused on request: before round 3.'), '⏸ Paused on request: before round 3.');
    impostaLingua('it');
    const it = m.fermataNellaLingua('⏸ paused on request: before round 3.');
    assert.match(it, /^⏸ In pausa su richiesta: /u);
    assert.doesNotMatch(it, /paused|before round/u, 'no English left on screen');
    assert.equal(m.fermataNellaLingua('⏸ paused on request.'), '⏸ In pausa su richiesta.');
    assert.match(m.fermataNellaLingua('⛔ stopped on request.'), /^⛔ Fermata su richiesta\.$/u, 'a stop stays a stop');
    assert.equal(m.fermataNellaLingua('Ho messo in pausa il lavoro.'), 'Ho messo in pausa il lavoro.', 'free text is untouched');
  } finally { impostaLingua('it'); }
});
