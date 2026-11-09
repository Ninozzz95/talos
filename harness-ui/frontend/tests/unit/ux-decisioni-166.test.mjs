/*
 * Decisione dell'owner 166 (04/11/2026, variante A di `variante-43-dopo-lo-stop.html`, riga 43 della revisione d'uso della candidata):
 * dopo uno Stop il messaggio nuovo è una richiesta nuova (la cura nel nucleo: `tests/fermato-poi-domanda-nuova.test.mjs`), e per
 * riprendere il lavoro fermato c'è un PULSANTE sulla nota della fermata, «Riprendi da dove ti eri fermato». La nota dice «Fermato» una volta.
 * La porta del pulsante è quella che c'era già: la ripresa SENZA messaggio (`resumeSession()` ⇒ `POST /resume` vuoto), la stessa di
 * «Continua adesso con…». Ogni prova anche al contrario: il testo vecchio non c'è più.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { spiegaErrore, vestizioneErrore } from '../../src/components/errori.js';
import { creaNotaErrore } from '../../src/components/conversazione.js';
import { documento, clic } from './aiuto-dom-blocchi.mjs';

const leggi = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const conta = (testo, parola) => (testo.match(new RegExp(parola, 'giu')) ?? []).length;

test('UXD166-01 — decisione 191: la nota della fermata ha badge «Fermato», titolo «Hai fermato il giro» (mai «TALOS» sotto l autore TALOS), rimedio «un messaggio nuovo è una richiesta nuova» e il pulsante', async () => {
  const { creaRipresaDopoLoStop } = await import('../../src/components/ripresa-dopo-lo-stop.js');
  try {
    for (const [lingua, badge, titolo, rimedio, pulsante] of [
      ['en', 'Stopped', 'You stopped the turn', 'A new message is a new request.', 'Pick up where you left off'],
      ['it', 'Fermato', 'Hai fermato il giro', 'Un messaggio nuovo è una richiesta nuova.', 'Riprendi da dove ti eri fermato'],
    ]) {
      impostaLingua(lingua);
      const spiegazione = spiegaErrore('stopped on request: while the model was answering', 'fermato');
      assert.equal(spiegazione.famiglia, 'fermato');
      const vestizione = vestizioneErrore(spiegazione);
      assert.deepEqual(vestizione, { badge, titolo, tono: 'accent' });
      assert.deepEqual(spiegazione.rimedi, [rimedio]);
      assert.equal(t('errori.turno.fermato.riprendi'), pulsante);
      const doc = documento();
      const ripresa = creaRipresaDopoLoStop({ riprendi: async () => true, sessioneOra: () => 's1' });
      const nota = creaNotaErrore({ ...vestizione, spiegazione }, { document: doc, azioni: [ripresa.azione()] });
      doc.body.append(nota);
      ripresa.apri(nota, { sessionId: 's1' });
      const testo = nota.textContent;
      assert.equal(testo.split(titolo).length - 1, 1, `${lingua}: il titolo una volta sola, la frase che lo ripete è tolta (${testo})`);
      assert.ok(testo.includes(rimedio), `${lingua}: il rimedio della 166`);
      assert.ok(testo.includes(pulsante), `${lingua}: il pulsante della 166`);
      assert.doesNotMatch(testo, /TALOS/u, `${lingua}: AL CONTRARIO, niente «TALOS» come titolo (ripeteva la riga dell autore)`);
      // «Fermato» tre volte come nel bozzetto approvato: badge, titolo, pulsante (prima: badge, frase, pulsante)
      if (lingua === 'it') assert.equal(conta(testo, 'fermat'), 3, testo);
      assert.doesNotMatch(spiegazione.rimedi.join(' '), /continuare da qui|continue from here/u, 'AL CONTRARIO: il rimedio vecchio diceva che il messaggio dopo CONTINUA il giro fermato');
    }
  } finally { impostaLingua('it'); }
});

test('UXD166-02 — il pulsante: uno, secondario come nel bozzetto (bordo, non il pieno del primario), e al clic riprende SENZA messaggio', async () => {
  const { creaRipresaDopoLoStop } = await import('../../src/components/ripresa-dopo-lo-stop.js');
  const doc = documento();
  const chiamate = [];
  let sessione = 's1';
  const ripresa = creaRipresaDopoLoStop({ riprendi: async (...args) => { chiamate.push(args); return true; }, sessioneOra: () => sessione });
  const nota = creaNotaErrore({ spiegazione: { cosa: 'Hai fermato il giro.', perche: 'p', rimedi: ['r'] } }, { document: doc, azioni: [ripresa.azione()] });
  doc.body.append(nota);
  ripresa.apri(nota, { sessionId: 's1' });
  const tasti = nota.querySelectorAll('[data-nota-azione]');
  assert.equal(tasti.length, 1);
  assert.equal(tasti[0].textContent, 'Riprendi da dove ti eri fermato');
  assert.ok(tasti[0].classList.contains('talos-button--secondary'), tasti[0].className);
  assert.ok(!tasti[0].classList.contains('talos-button--primary'), 'AL CONTRARIO: non il pieno del primario');
  clic(tasti[0]);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(chiamate, [[]], 'la ripresa senza messaggio: niente testo, niente immagini, niente opzioni');
  // doppio clic = una ripresa sola
  clic(tasti[0]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(chiamate.length, 1);
  sessione = 's2';
});

test('UXD166-03 — il pulsante vale solo per l ultimo giro: un giro nuovo lo toglie (dal vivo e alla rigiocata); un altra conversazione non riprende questa', async () => {
  const { creaRipresaDopoLoStop } = await import('../../src/components/ripresa-dopo-lo-stop.js');
  const doc = documento();
  let chiamate = 0;
  let sessione = 's1';
  const ripresa = creaRipresaDopoLoStop({ riprendi: async () => { chiamate += 1; return true; }, sessioneOra: () => sessione });
  // rigiocata: giro 1 fermato, giro 2 partito dopo ⇒ la nota del giro 1 non ha più il pulsante
  const nota1 = creaNotaErrore({ spiegazione: { cosa: 'x' } }, { document: doc, azioni: [ripresa.azione()] });
  doc.body.append(nota1);
  ripresa.apri(nota1, { sessionId: 's1' });
  ripresa.giroNuovo();
  assert.equal(nota1.querySelectorAll('[data-nota-azione]').length, 0, 'un elemento nascosto si clicca ancora da tastiera: via dal DOM');
  assert.equal(await ripresa.riprendi(), false);
  assert.equal(chiamate, 0);
  // AL CONTRARIO: l'ultimo giro fermato lo tiene
  const nota2 = creaNotaErrore({ spiegazione: { cosa: 'x' } }, { document: doc, azioni: [ripresa.azione()] });
  doc.body.append(nota2);
  ripresa.apri(nota2, { sessionId: 's1' });
  assert.equal(nota2.querySelectorAll('[data-nota-azione]').length, 1);
  // un'altra conversazione aperta: il clic non riprende quella di prima
  sessione = 's2';
  assert.equal(await ripresa.riprendi(), false);
  assert.equal(chiamate, 0);
  sessione = 's1';
  ripresa.dimentica();
  assert.equal(await ripresa.riprendi(), false);
  assert.equal(chiamate, 0);
});

test('UXD166-04 — una ripresa che non parte rimette il pulsante (la persona può riprovare); una che parte lo lascia andare col giro nuovo', async () => {
  const { creaRipresaDopoLoStop } = await import('../../src/components/ripresa-dopo-lo-stop.js');
  const doc = documento();
  let esito = false;
  const ripresa = creaRipresaDopoLoStop({ riprendi: async () => esito, sessioneOra: () => 's1' });
  const nota = creaNotaErrore({ spiegazione: { cosa: 'x' } }, { document: doc, azioni: [ripresa.azione()] });
  doc.body.append(nota);
  ripresa.apri(nota, { sessionId: 's1' });
  assert.equal(await ripresa.riprendi(), false);
  assert.equal(nota.querySelector('.talos-system-note__azioni').hidden, false);
  esito = true;
  assert.equal(await ripresa.riprendi(), true);
  assert.equal(nota.querySelector('.talos-system-note__azioni').hidden, true, 'partita: niente secondo clic mentre arriva il giro nuovo');
});

test('UXD166-05 — il cablaggio nella chat del PC: la nota «fermato» porta il pulsante, ogni RunStarted lo chiude, il cambio di conversazione lo dimentica; la ripresa è `resumeSession()` senza messaggio', () => {
  const app = leggi('../../src/legacy/app.js');
  assert.match(app, /creaRipresaDopoLoStop\(\{\s*riprendi: \(\) => resumeSession\(\)/u);
  assert.match(app, /spiegazione\.famiglia === 'fermato'\s*\?\s*\[ripresaDopoLoStop\.azione\(\)\]/u);
  assert.match(app, /if \(spiegazione\?\.famiglia === 'fermato'\) ripresaDopoLoStop\.apri\(article, \{ sessionId: state\.realSession\.id \}\)/u);
  assert.match(app, /schedeAccesso\.giroNuovo\(\);[^\n]*\n\s*ripresaDopoLoStop\.giroNuovo\(\);/u);
  assert.match(app, /if \(!continua\) schedeAccesso\.dimentica\(\);[^\n]*\n\s*if \(!continua\) ripresaDopoLoStop\.dimentica\(\);/u);
  assert.match(app, /import \{ creaRipresaDopoLoStop \} from '\.\.\/components\/ripresa-dopo-lo-stop\.js';/u);
});

test('UXD166-06 — due fermate di fila senza giro in mezzo: il pulsante resta solo sull ultima nota, la prima lo perde', async () => {
  const { creaRipresaDopoLoStop } = await import('../../src/components/ripresa-dopo-lo-stop.js');
  const doc = documento();
  const ripresa = creaRipresaDopoLoStop({ riprendi: async () => true, sessioneOra: () => 's1' });
  const nota1 = creaNotaErrore({ spiegazione: { cosa: 'x' } }, { document: doc, azioni: [ripresa.azione()] });
  doc.body.append(nota1);
  ripresa.apri(nota1, { sessionId: 's1' });
  const nota2 = creaNotaErrore({ spiegazione: { cosa: 'x' } }, { document: doc, azioni: [ripresa.azione()] });
  doc.body.append(nota2);
  ripresa.apri(nota2, { sessionId: 's1' });
  assert.equal(nota1.querySelectorAll('[data-nota-azione]').length, 0, 'due «Riprendi» in pagina: il primo riprenderebbe dal punto sbagliato');
  assert.equal(nota2.querySelectorAll('[data-nota-azione]').length, 1);
  // AL CONTRARIO: riaprire la STESSA nota non la svuota
  ripresa.apri(nota2, { sessionId: 's1' });
  assert.equal(nota2.querySelectorAll('[data-nota-azione]').length, 1);
});
