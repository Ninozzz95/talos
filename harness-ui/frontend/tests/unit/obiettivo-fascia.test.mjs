import test from 'node:test';
import assert from 'node:assert/strict';
import {
  statoVisibile, controlliSuperati, pezziDellaTestata, motivoDaLeggere, righeDeiControlli, vociDelMenu, fasciaAperta, chiaveDelloStato,
  sceltaPer, ricordaScelta, tokenCorti,
} from '../../src/components/obiettivo-fascia.js';
import { impostaLingua } from '../../src/components/lingua.js';

/*
 * ⭐ /goal G6 (owner 15/10/2026) — le funzioni PURE della fascia dell'obiettivo (mockup A0-A4m). La superficie si prova nel browser.
 * Ogni numero viene da un campo vero dell'obiettivo del server (`src/obiettivo/stato.mjs`): qui si prova anche che senza quel
 * campo il numero NON compare.
 */
const CRITERI = [
  { id: 'c1', testo: 'I test del checkout passano', verifica: { tipo: 'comando', comando: 'npm test', uscita: 0 } },
  { id: 'c2', testo: 'Il README ha la sezione', verifica: { tipo: 'file', percorso: 'README.md', fatto: 'contiene', testo: '## Install' } },
  { id: 'c3', testo: 'I passi funzionano', verifica: { tipo: 'giudizio' } },
];
const base = (extra = {}) => ({ id: 'ob-1111', testo: 'Fai passare i test', stato: 'attivo', motivo: null, revisione: 3, contratto: { criteri: CRITERI }, ...extra });
const VERIFICA = { verdetti: [
  { id: 'c1', esito: 'verde', durataMs: 12_400 },
  { id: 'c2', esito: 'rosso', motivo: { tipo: 'text-missing' } },
  { id: 'c3', esito: 'rosso', motivo: { tipo: 'judge-not-met' }, giudizio: { motivo: 'il README salta «npm ci»' } },
] };

test('GOAL-UI-01 — la testata (forma minima): stato · controlli superati · giro di tetto · token di tetto, solo coi numeri veri', () => {
  impostaLingua('it');
  const ob = base({ verifica: VERIFICA, ciclo: { giri: 4, token: 182_000, senzaProgresso: 0 } });
  assert.deepEqual(pezziDellaTestata(ob, { giri: 20, token: 2_000_000 }), ['Obiettivo attivo', '1 di 3 controlli superati', 'giro 4 di 20', `${tokenCorti(182_000)} di ${tokenCorti(2_000_000)} token`]);
  // tetto dei token assente (`null`, il di serie): niente «di …»
  assert.deepEqual(pezziDellaTestata(ob, { giri: 20, token: null }).slice(2), ['giro 4 di 20', `${tokenCorti(182_000)} token`]);
  // AL CONTRARIO: niente ciclo ⇒ niente giro né token; niente verifica ⇒ «non ancora eseguiti»; niente contratto ⇒ niente conto
  assert.deepEqual(pezziDellaTestata(base(), { giri: 20, token: null }), ['Obiettivo attivo', '3 controlli, non ancora eseguiti']);
  assert.deepEqual(pezziDellaTestata(base({ contratto: undefined }), null), ['Obiettivo attivo']);
  assert.deepEqual(pezziDellaTestata(null, null), []);
  impostaLingua('en');
  assert.deepEqual(pezziDellaTestata(ob, { giri: 20, token: null }).slice(0, 3), ['Goal active', '1 of 3 checks passed', 'turn 4 of 20']);
  impostaLingua('it');
});

test('GOAL-UI-02 — controlli superati contano solo i criteri del contratto ATTUALE (un verde di un criterio tolto non conta)', () => {
  assert.equal(controlliSuperati(base({ contratto: undefined })), null);
  assert.deepEqual(controlliSuperati(base({ verifica: { verdetti: [...VERIFICA.verdetti, { id: 'c9', esito: 'verde' }] } })), { superati: 1, totale: 3 });
});

test('GOAL-UI-03 — lo stato visibile: una pausa «bloccato» del modello si mostra come bloccata; stati sconosciuti non si mostrano', () => {
  assert.equal(statoVisibile(base({ stato: 'in-pausa', motivo: { tipo: 'bloccato', dettaglio: 'manca la chiave' } })), 'bloccato');
  assert.equal(statoVisibile(base({ stato: 'in-pausa', motivo: { tipo: 'persona' } })), 'in-pausa');
  assert.equal(statoVisibile(base({ stato: 'qualcosa' })), null);
  assert.equal(statoVisibile(null), null);
});

test('GOAL-UI-04 — il motivo da leggere: frase di TALOS, e le parole di un modello come citazione con chi le ha dette', () => {
  impostaLingua('it');
  assert.equal(motivoDaLeggere(base()), null, 'attivo: niente motivo');
  const bloccato = motivoDaLeggere(base({ stato: 'in-pausa', motivo: { tipo: 'bloccato', dettaglio: 'manca la chiave API' } }));
  assert.equal(bloccato.testo, 'Il modello dice che non può andare avanti senza di te.');
  assert.deepEqual(bloccato.citazione, { chi: 'Il modello', testo: 'manca la chiave API' });
  const smentito = motivoDaLeggere(base({ stato: 'in-pausa', motivo: { tipo: 'fatto-smentito', dettaglio: '2' }, confutazione: { esito: 'smentito', motivo: 'password vuota accettata' } }));
  assert.match(smentito.testo, /smentito il «fatto» 2 volte/u);
  assert.equal(smentito.citazione.chi, 'Revisore');
  assert.match(motivoDaLeggere(base({ stato: 'in-pausa', motivo: { tipo: 'prove-rosse', dettaglio: 'c1, c2' } })).testo, /\(c1, c2\)/u);
  assert.equal(motivoDaLeggere(base({ stato: 'tetto', motivo: { tipo: 'giri' } })).testo, 'Ha usato tutti i suoi giri.');
  assert.equal(motivoDaLeggere(base({ stato: 'fatto', daGuardare: 2 })).testo, 'Fatto, con 2 controlli a giudizio da guardare tu.');
  // un motivo di una versione più nuova del server: detto col suo nome, mai una chiave grezza
  assert.equal(motivoDaLeggere(base({ stato: 'in-pausa', motivo: { tipo: 'nuovo-motivo' } })).testo, 'Fermo (nuovo-motivo).');
});

test('GOAL-UI-05 — una riga per controllo: tipo, esito, perché; le parole del giudice come citazione; senza verifica «non ancora controllato»', () => {
  impostaLingua('it');
  const righe = righeDeiControlli(base({ verifica: VERIFICA }));
  assert.deepEqual(righe.map((r) => [r.id, r.tipo, r.esito, r.etichetta]), [
    ['c1', 'comando', 'verde', 'Superato · 12 s'], ['c2', 'file', 'rosso', 'Non ancora'], ['c3', 'giudizio', 'rosso', 'Non ancora']]);
  assert.equal(righe[1].perche, 'Il testo non è nel file.');
  assert.deepEqual(righe[2].citazione, { chi: 'Giudice', testo: 'il README salta «npm ci»' });
  assert.equal(righeDeiControlli(base({ verifica: { verdetti: [{ id: 'c1', esito: 'rosso', motivo: { tipo: 'exit-code' }, uscita: { codice: 2 } }] } }))[0].perche, 'Il comando è finito con codice di uscita 2.');
  assert.deepEqual(righeDeiControlli(base()).map((r) => r.etichetta), ['Non ancora controllato', 'Non ancora controllato', 'Non ancora controllato']);
  assert.deepEqual(righeDeiControlli(base({ contratto: undefined })), []);
});

test('GOAL-UI-06 — il menu: le azioni che lo stato permette; «Riprendi» mai nel menu (è il pulsante della riga); «Togli» sempre, ultima e pericolosa', () => {
  const chiavi = (ob) => vociDelMenu(ob).map((v) => v.chiave);
  assert.deepEqual(chiavi(base()), ['pausa', 'verifica', 'togli']);
  assert.deepEqual(chiavi(base({ stato: 'in-pausa', motivo: { tipo: 'persona' } })), ['verifica', 'togli'], 'riga e menu: intersezione vuota (owner 13/09)');
  assert.deepEqual(chiavi(base({ stato: 'in-pausa', motivo: { tipo: 'bloccato' } })), ['verifica', 'togli']);
  assert.deepEqual(chiavi(base({ stato: 'tetto', motivo: { tipo: 'giri' } })), ['verifica', 'togli']);
  assert.deepEqual(chiavi(base({ stato: 'fatto' })), ['togli']);
  assert.deepEqual(chiavi(base({ contratto: undefined })), ['pausa', 'togli'], 'senza contratto non c\'è niente da eseguire');
  const togli = vociDelMenu(base()).at(-1);
  assert.equal(togli.pericolo, true);
  assert.equal(togli.separaPrima, true);
  assert.deepEqual(chiavi(null), []);
});

test('GOAL-UI-07 — la forma: MINIMA di serie; si apre da sola su uno stato fermo o finito non ancora visto; richiusa resta richiusa per quello stato', () => {
  const attivo = base();
  assert.equal(fasciaAperta(attivo, null), false, 'di serie minima (owner 15/10)');
  assert.equal(fasciaAperta(attivo, { aperta: true, chiave: chiaveDelloStato(attivo) }), true);
  const inPausa = base({ stato: 'in-pausa', motivo: { tipo: 'prove-rosse' } });
  assert.equal(fasciaAperta(inPausa, { aperta: false, chiave: chiaveDelloStato(attivo) }), true, 'arrivata la pausa, si apre da sola');
  assert.equal(fasciaAperta(inPausa, { aperta: false, chiave: chiaveDelloStato(inPausa) }), false, 'richiusa per QUESTA pausa resta richiusa');
  const bloccato = base({ stato: 'in-pausa', motivo: { tipo: 'bloccato' } });
  assert.equal(fasciaAperta(bloccato, { aperta: false, chiave: chiaveDelloStato(inPausa) }), true, 'una pausa diversa è un motivo nuovo da leggere');
  assert.equal(fasciaAperta(base({ stato: 'fatto' }), null), true);
  assert.equal(fasciaAperta(null, { aperta: true, chiave: '' }), false);
});

test('GOAL-UI-08 — la scelta si ricorda PER CONVERSAZIONE; una memoria rotta o assente torna alla forma di serie', () => {
  const dati = new Map();
  const memoria = { getItem: (k) => dati.get(k) ?? null, setItem: (k, v) => dati.set(k, v) };
  ricordaScelta('s1', { aperta: true, chiave: 'ob-1:attivo:' }, memoria);
  ricordaScelta('s2', { aperta: false, chiave: 'ob-2:attivo:' }, memoria);
  assert.deepEqual(sceltaPer('s1', memoria), { aperta: true, chiave: 'ob-1:attivo:' });
  assert.deepEqual(sceltaPer('s2', memoria), { aperta: false, chiave: 'ob-2:attivo:' });
  assert.equal(sceltaPer('s3', memoria), null);
  dati.set('talos.obiettivo.fascia.v1', '{rotto');
  assert.equal(sceltaPer('s1', memoria), null);
  const piena = { getItem: () => { throw new Error('bloccata'); }, setItem: () => { throw new Error('bloccata'); } };
  assert.equal(sceltaPer('s1', piena), null);
  assert.doesNotThrow(() => ricordaScelta('s1', { aperta: true, chiave: 'x' }, piena));
});

test('GOAL-UI-KEY (15/10/2026) — il primo giro rifiutato per la chiave mancante non «è finito con un errore»: non è partito, e la frase dice che cosa fare; AL CONTRARIO un altro errore resta generico', () => {
  const chiave = motivoDaLeggere(base({ stato: 'in-pausa', motivo: { tipo: 'errore', dettaglio: 'provider-key-missing-named' } }));
  assert.equal(chiave.testo, 'Il giro non è partito: manca la chiave del fornitore. Collegala, poi premi Riprendi.');
  const altro = motivoDaLeggere(base({ stato: 'in-pausa', motivo: { tipo: 'errore', dettaglio: 'boom' } }));
  assert.equal(altro.testo, 'Un giro dell’obiettivo è finito con un errore.');
});
