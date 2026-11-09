/*
 * Scene 1+4 (FE-081, G-B), core: the versions of a live block and its name. Ledger §2 G-B, UIG-1.1 and UIG-1.2.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leggi } from '../src/blocchi/lettore.mjs';
import {
  STORICO_MASSIMO, scriviSorgente, creaStorico, aggiungiVersione, versioneCorrente, tornaAllaVersione, cosaECambiato,
  eventoDellaVersione, storicoDagliEventi, nomeDalRecinto, nominaBlocchi,
} from '../src/blocchi/versioni.mjs';

const fixture = (f) => readFileSync(new URL(`./fixtures/blocchi/${f}`, import.meta.url), 'utf8');
const TABELLA = fixture('01-tabella.txt');
const GRAFICO = fixture('02-grafico.txt');
const blocco = (t) => { const r = leggi(t); assert.equal(r.stato, 'completo', JSON.stringify(r.motivo)); return r.blocco; };

test('scriviSorgente is the inverse of the reader (table and chart round-trip)', () => {
  for (const t of [TABELLA, GRAFICO]) {
    const b = blocco(t);
    assert.deepEqual(blocco(scriviSorgente(b)), b);
  }
  assert.equal(scriviSorgente({ tipo: 'nulla' }), '');
});

test('UIG-1.1 tornaAllaVersione(s, 1) adds a new version and KEEPS v2', () => {
  const b1 = blocco(TABELLA);
  const b2 = { ...b1, righe: [...b1.righe, ['Aprile', 1500]] };
  let s = creaStorico(b1, 'b1', { sorgente: TABELLA, quando: '2026-11-05T21:00:00.000Z' });
  s = aggiungiVersione(s, b2, { origine: 'modello', quando: '2026-11-05T21:01:00.000Z' });
  const s3 = tornaAllaVersione(s, 1, { quando: '2026-11-05T21:02:00.000Z' });
  assert.deepEqual(s3.voci.map((v) => v.versione), [1, 2, 3]);
  const v3 = versioneCorrente(s3);
  assert.equal(v3.origine, 'ritorno');
  assert.equal(v3.aVersione, 1);
  assert.equal(v3.sorgente, TABELLA);
  assert.deepEqual(v3.blocco, b1);
  assert.deepEqual(s3.voci[1].blocco, b2, 'v2 is still in the list');
  /* the version already on screen, or an unknown one: same history */
  assert.equal(tornaAllaVersione(s3, 1), s3);
  assert.equal(tornaAllaVersione(s3, 99), s3);
  /* the event of the return carries aVersione; the others do not */
  const e = eventoDellaVersione(s3, v3, { conversazione: 'c', messaggio: 'm' });
  assert.deepEqual(Object.keys(e).sort(), ['aVersione', 'blocco', 'conversazione', 'cosaECambiato', 'messaggio', 'origine', 'quando', 'sorgente', 'versione']);
  assert.equal('aVersione' in eventoDellaVersione(s3, s3.voci[1]), false);
});

test('UIG-1.2 cosaECambiato names the rows added, in Italian and in English', () => {
  const b1 = blocco(TABELLA);
  const due = { ...b1, righe: [...b1.righe, ['Aprile', 1], ['Maggio', 2]] };
  assert.equal(cosaECambiato(b1, due), '2 righe nuove');
  assert.equal(cosaECambiato(b1, { ...b1, righe: [...b1.righe, ['Aprile', 1]] }), 'una riga nuova');
  assert.equal(cosaECambiato(b1, due, { lingua: 'en' }), '2 new rows');
  assert.equal(cosaECambiato(b1, { ...due, titolo: 'Altro' }), 'titolo cambiato, 2 righe nuove');
  assert.equal(cosaECambiato(b1, { ...b1, righe: b1.righe.slice(1) }), 'una riga in meno');
  assert.equal(cosaECambiato(b1, b1), 'nessun cambiamento');
  const g = blocco(GRAFICO);
  assert.equal(cosaECambiato(g, { ...g, forma: 'barre' }), 'forma da linee a barre');
  assert.equal(cosaECambiato({ ...g, forma: 'barre' }, b1), 'vista da barre a tabella');
  /* the sentence lands in the history entry */
  const s = aggiungiVersione(creaStorico(b1, 'b1'), due);
  assert.equal(versioneCorrente(s).cosaECambiato, '2 righe nuove');
});

test('the cap: at most STORICO_MASSIMO versions, v1 never goes, the oldest model version goes first, numbers never reused', () => {
  const b1 = blocco(TABELLA);
  let s = creaStorico(b1, 'b3');
  s = aggiungiVersione(s, { ...b1, titolo: 'vista' }, { origine: 'vista' });
  for (let i = 0; i < STORICO_MASSIMO + 5; i += 1) s = aggiungiVersione(s, { ...b1, righe: [...b1.righe, [`r${i}`, i]] });
  assert.equal(s.voci.length, STORICO_MASSIMO);
  assert.equal(s.voci[0].versione, 1);
  assert.equal(s.voci[1].origine, 'vista', 'the view version survives: model versions go first');
  const numeri = s.voci.map((v) => v.versione);
  assert.equal(new Set(numeri).size, numeri.length);
  assert.equal(numeri.at(-1), STORICO_MASSIMO + 7);
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.voci) && Object.isFrozen(s.voci[0]));
});

test('reload: the history rebuilt from the events is the same history', () => {
  const b1 = blocco(TABELLA);
  let s = creaStorico(b1, 'b1', { sorgente: TABELLA });
  s = aggiungiVersione(s, { ...b1, titolo: 'Nuovo' });
  s = tornaAllaVersione(s, 1);
  const eventi = s.voci.slice(1).map((v) => eventoDellaVersione(s, v));
  const r = storicoDagliEventi('b1', TABELLA, [...eventi].reverse());
  assert.deepEqual(r.voci.map((v) => [v.versione, v.origine, v.sorgente]), s.voci.map((v) => [v.versione, v.origine, v.sorgente]));
  assert.equal(r.prossima, s.prossima);
  assert.equal(storicoDagliEventi('b1', 'non è un blocco', eventi), null);
});

test('names: TALOS numbers the fences by first appearance; a name the model wrote is replaced', () => {
  assert.equal(nomeDalRecinto(' nome=b12'), 'b12');
  assert.equal(nomeDalRecinto(' nome=x'), null);
  const recinto = (corpo, info = '') => `\`\`\`talos-blocco${info}\n${corpo}\n\`\`\``;
  const messaggi = [
    { role: 'user', content: recinto('root = X()') },
    { role: 'assistant', content: `ecco\n${recinto(TABELLA.trim())}\npoi\n${recinto(GRAFICO.trim())}` },
    { role: 'assistant', content: 'solo testo' },
    { role: 'assistant', content: `${recinto(TABELLA.trim(), ' nome=b7')}\n${recinto('non è un blocco').replace('talos-blocco', 'talos-bloccoX')}` },
  ];
  const { messaggi: fuori, nomi } = nominaBlocchi(messaggi, { correnti: { b1: 'root = Avviso("a", null, "info", "ciao")' } });
  assert.deepEqual(nomi, ['b1', 'b2', 'b3']);
  assert.equal(fuori[0], messaggi[0], 'a user message is never touched');
  assert.equal(fuori[2], messaggi[2]);
  assert.match(fuori[1].content, /```talos-blocco nome=b1\nroot = Avviso\("a", null, "info", "ciao"\)\n```/u);
  assert.match(fuori[1].content, /```talos-blocco nome=b2\nroot = Grafico/u);
  assert.match(fuori[3].content, /^```talos-blocco nome=b3\nroot = Tabella/u, 'a name the model wrote is replaced');
  assert.doesNotMatch(fuori[3].content, /b7/u);
  assert.match(fuori[3].content, /```talos-bloccoX\nnon è un blocco/u, 'another language is not a block');
  /* the input is not changed, and the same history gives the same names */
  assert.doesNotMatch(messaggi[1].content, /nome=/u);
  assert.deepEqual(nominaBlocchi(messaggi).nomi, nomi);
  assert.deepEqual(nominaBlocchi([{ role: 'assistant', content: 'nessun blocco' }]).nomi, []);
});

/* G-B2 (05/11/2026): the name is persisted with the message. A name in the history stays when the host vouches for it (`prossimo`:
   every bK with K < prossimo was given by TALOS in this conversation or in the one it was forked from); a fence with no name, or a
   name TALOS never gave, takes the next number. The host persists the counter, so a removed message never gives its names back. */
test('UIG-1.11 a regenerated message gets new names: the counter goes on, an old name is never reused', () => {
  const recinto = (corpo, info = '') => `\`\`\`talos-blocco${info}\n${corpo}\n\`\`\``;
  const prima = [
    { role: 'user', content: 'una tabella' },
    { role: 'assistant', content: recinto(TABELLA.trim(), ' nome=b1') },
    { role: 'user', content: 'e un grafico' },
  ];
  /* b2 lived in the answer that was regenerated: the host counter says 3, so the new block is b3, not b2 */
  const rifatta = [...prima, { role: 'assistant', content: recinto(GRAFICO.trim()) }];
  const r = nominaBlocchi(rifatta, { prossimo: 3 });
  assert.deepEqual(r.nomi, ['b1', 'b3']);
  assert.equal(r.prossimo, 4);
  assert.deepEqual(r.nuovi.map((n) => n.nome), ['b3']);
  assert.equal(r.nuovi[0].sorgente, GRAFICO.trim(), 'the new block carries the body the model wrote: the v1 of its history');
  assert.equal(r.nuovi[0].indice, 3);
  assert.equal(r.messaggi[1], rifatta[1], 'a message whose names stay comes back as the same object');
  /* rinomina: a message the model has just written loses every name it wrote itself (it copies them from the history) */
  const nuovo = nominaBlocchi([{ role: 'assistant', content: recinto(TABELLA.trim(), ' nome=b1') }], { prossimo: 4, rinomina: true });
  assert.deepEqual(nuovo.nomi, ['b4']);
  assert.match(nuovo.messaggi[0].content, /^```talos-blocco nome=b4\n/u);
});

test('UIG-1.12 reload: the same history and the same counter give the same names', () => {
  const recinto = (corpo, info = '') => `\`\`\`talos-blocco${info}\n${corpo}\n\`\`\``;
  const storia = [
    { role: 'assistant', content: `${recinto(TABELLA.trim(), ' nome=b2')}\n${recinto(GRAFICO.trim(), ' nome=b5')}` },
  ];
  const una = nominaBlocchi(storia, { prossimo: 6 });
  const due = nominaBlocchi(una.messaggi, { prossimo: una.prossimo });
  assert.deepEqual(una.nomi, ['b2', 'b5']);
  assert.deepEqual(due.nomi, una.nomi);
  assert.equal(due.prossimo, 6);
  assert.deepEqual(una.nuovi, []);
});

test('UIG-1.13 a fork keeps the names of its prefix, and its next block goes on from the counter', () => {
  const recinto = (corpo, info = '') => `\`\`\`talos-blocco${info}\n${corpo}\n\`\`\``;
  const prefisso = [
    { role: 'assistant', content: recinto(TABELLA.trim(), ' nome=b1') },
    { role: 'assistant', content: recinto(GRAFICO.trim(), ' nome=b2') },
  ];
  const ramo = [...prefisso, { role: 'user', content: 'ancora' }, { role: 'assistant', content: recinto(TABELLA.trim()) }];
  const r = nominaBlocchi(ramo, { prossimo: 3 });
  assert.deepEqual(r.nomi, ['b1', 'b2', 'b3']);
  /* a name the host never gave (the model wrote b9, or a duplicate) takes the next number */
  const finto = nominaBlocchi([...prefisso, { role: 'assistant', content: `${recinto(TABELLA.trim(), ' nome=b9')}\n${recinto(GRAFICO.trim(), ' nome=b1')}` }], { prossimo: 3 });
  assert.deepEqual(finto.nomi, ['b1', 'b2', 'b3', 'b4']);
  assert.equal(finto.prossimo, 5);
});

// ---- G-B3 (06/11/2026) ----
import { creaOspiteDeiBlocchi } from '../src/blocchi/aggiorna.mjs';
import { impronta } from '../src/blocchi/impronta.mjs';
import { eventiDelRamo, recintiDelTesto, statoDeiBlocchi } from '../src/blocchi/versioni.mjs';
const TABELLA_GB3 = readFileSync(new URL('./fixtures/blocchi/01-tabella.txt', import.meta.url), 'utf8').trim();

test('G-B3 s8 an incomplete v1 source gives no history and no throw, in the host and in the journal', () => {
  const emessi = [];
  const ospite = creaOspiteDeiBlocchi({ emetti: (v) => emessi.push(v) });
  assert.doesNotThrow(() => ospite.onNomiDeiBlocchi({ nuovi: [{ nome: 'b1', sorgente: 'tipo: tabella\ncolonne: [' }] }));
  assert.deepEqual(emessi, []);
  let stato;
  assert.doesNotThrow(() => { stato = statoDeiBlocchi([{ blocco: 'b1', versione: 1, sorgente: 'tipo: tabella\ncolonne: [' }]); });
  assert.equal(stato.storici.size, 0);
  assert.equal(stato.prossimo, 2, 'the name is still counted');
});

test('G-B3 the v1 event is emitted synchronously, with the impronta of its source', () => {
  const emessi = [];
  const ospite = creaOspiteDeiBlocchi({ emetti: (v) => emessi.push(v), conversazione: 's1' });
  ospite.onNomiDeiBlocchi({ nuovi: [{ nome: 'b1', sorgente: TABELLA_GB3 }] });
  assert.equal(emessi.length, 1, 'no microtask: the registry binds and persists it before the turn can end');
  assert.equal(emessi[0].impronta, impronta(TABELLA_GB3));
  assert.equal(emessi[0].versione, 1);
});

test('G-B3 recintiDelTesto lists the talos-blocco fences of a message in order, with their body and name', () => {
  const t = `a\n\`\`\`talos-blocco\n${TABELLA_GB3}\n\`\`\`\nb\n\`\`\`js\nx\n\`\`\`\n\`\`\`talos-blocco nome=b4\n${TABELLA_GB3}\n\`\`\`\n\`\`\`talos-blocco\naperto`;
  const r = recintiDelTesto(t);
  assert.deepEqual(r.map((x) => [x.posizione, x.nome, x.sorgente === TABELLA_GB3]), [[0, null, true], [1, 'b4', true]], 'an open fence is not listed');
});

test('G-B3 a kept name with no v1 event: the v1 comes from the message text, and an update on it is not bloccoSconosciuto', async () => {
  const messaggi = [{ role: 'assistant', content: `x\n\`\`\`talos-blocco nome=b2\n${TABELLA_GB3}\n\`\`\`` }];
  const stato = statoDeiBlocchi([], messaggi);
  assert.deepEqual([...stato.storici.keys()], [], 'no event, no history');
  assert.equal(stato.primeDaiMessaggi.get('b2'), TABELLA_GB3);
  assert.equal(stato.prossimo, 3);
  const emessi = [];
  const ospite = creaOspiteDeiBlocchi({ stato, emetti: (v) => { emessi.push(v); } });
  const esito = await ospite.onAggiornaBlocco({ blocco: 'b2', sorgente: TABELLA_GB3.replace('Marzo', 'Aprile') });
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.equal(esito.versione, 2);
  const conV2 = statoDeiBlocchi(emessi, messaggi);
  assert.equal(conV2.storici.get('b2').voci.length, 2, 'on reload the v2 applies on the rebuilt v1');
  assert.equal(conV2.storici.get('b2').voci[0].sorgente, TABELLA_GB3);
});

test('G-B3 eventiDelRamo: a source counts only up to the RunStarted of the fork point; no cut, or a cut not found, keeps it all', () => {
  const v = (blocco, versione) => ({ type: 'CUSTOM', name: 'talos.blocco.versione', value: { blocco, versione } });
  const sorgente = [{ type: 'RunStarted', runId: 'r0' }, v('b1', 1), { type: 'RunStarted', runId: 'r1' }, v('b1', 2)];
  const ramo = { eventi: [v('b1', 3)], forkPrimaDelGiro: 'r1' };
  const chiavi = (l) => l.map((x) => `${x.blocco}v${x.versione}`);
  assert.deepEqual(chiavi(eventiDelRamo([ramo, { eventi: sorgente }])), ['b1v3', 'b1v1'], 'the v2 born in r1 is after the cut');
  assert.deepEqual(chiavi(eventiDelRamo([{ ...ramo, forkPrimaDelGiro: null }, { eventi: sorgente }])), ['b1v3', 'b1v1', 'b1v2']);
  assert.deepEqual(chiavi(eventiDelRamo([{ ...ramo, forkPrimaDelGiro: 'rX' }, { eventi: sorgente }])), ['b1v3', 'b1v1', 'b1v2']);
  assert.deepEqual(eventiDelRamo(null), []);
});

// ---- G-B4 (06/11/2026), UIG-1.20: one label per version, and the relabel of a local version ----
import { rinumeraCorrente } from '../src/blocchi/versioni.mjs';

test('G-B4 UIG-1.20 storicoDagliEventi: two events of one number (an older journal) give ONE entry, the first wins', () => {
  const T2 = TABELLA.replace('980.5', '990');
  const T3 = TABELLA.replace('980.5', '995');
  const eventi = [
    { blocco: 'b1', versione: 2, sorgente: T2, origine: 'vista', cosaECambiato: '' },
    { blocco: 'b1', versione: 2, sorgente: T3, origine: 'modello', cosaECambiato: '' },
    { blocco: 'b1', versione: 3, sorgente: T3, origine: 'modello', cosaECambiato: '' },
  ];
  const s = storicoDagliEventi('b1', TABELLA, eventi);
  assert.deepEqual(s.voci.map((v) => v.versione), [1, 2, 3]);
  assert.equal(s.voci[1].sorgente, T2, 'the first event of v2 wins, as in statoDeiBlocchi');
  assert.equal(s.prossima, 4);
});

test('G-B4 UIG-1.20 rinumeraCorrente: the version on screen takes the number the server gave; anything else is the same history', () => {
  let s = creaStorico(blocco(TABELLA), 'b1', { sorgente: TABELLA });
  s = aggiungiVersione(s, blocco(GRAFICO), { origine: 'vista', sorgente: GRAFICO });
  const r = rinumeraCorrente(s, 3);
  assert.deepEqual(r.voci.map((v) => v.versione), [1, 3]);
  assert.equal(r.prossima, 4);
  assert.equal(versioneCorrente(r).sorgente, GRAFICO);
  assert.equal(Object.isFrozen(r) && Object.isFrozen(r.voci) && Object.isFrozen(r.voci[1]), true);
  for (const n of [2, 1, 0, 1.5, 'x']) assert.equal(rinumeraCorrente(s, n), s, String(n));
  assert.equal(rinumeraCorrente(null, 3), null);
});
