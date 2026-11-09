/*
 * R-53 (owner 01/11/2026, «Sì, entra»): il modello chiude dichiarando il lavoro incompleto, con l'ultimo comando in errore. Il kernel riapre una volta sola, sull'esito
 * vero del comando. Forma con Desktop, CLI e Mobile: `in-corso/PROPOSTA-RIAPERTURA-SU-COMANDO-ROSSO-2026-11-01.md`.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora, deveRiaprireSuComandoRosso, NOTA_RILEGGI_PRIMA_DI_CHIUDERE, PASSI_MINIMI_PER_RIAPRIRE, COMANDI_RICORDATI, registraComando, rossoRilanciato } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const rosso = `${JSON.stringify(process.execPath)} -e "process.exit(1)"`;
const verde = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
const shell = (comando, id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando }) } }] });
const scrivi = (id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: `f-${id}.txt`, contenuto: 'x' }) } }] });
const testo = (t) => ({ content: t });

/* Una risposta per richiesta, nell'ordine dato; finite quelle, una chiusura senza niente da fare. */
function rete(risposte) {
  const corpi = [];
  const fetchDiRete = async (_url, o) => {
    corpi.push(JSON.parse(o.body));
    const r = risposte[corpi.length - 1] ?? testo('Chiuso.');
    const fine = r.finish ?? (r.tool_calls ? 'tool_calls' : 'stop');
    return new Response(JSON.stringify({ choices: [{ index: 0, finish_reason: fine, ...(r.native ? { native_finish_reason: r.native } : {}), message: { role: 'assistant', content: r.content ?? null, ...(r.tool_calls ? { tool_calls: r.tool_calls } : {}) } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }), { headers: { 'content-type': 'application/json' } });
  };
  return { corpi, fetchDiRete };
}
const giro = (risposte, extra = {}) => {
  const r = rete(risposte); const eventi = [];
  const esito = talosLavora({ cartella: cartellaDiProva('talos-riapertura-'), task: { consegna: 'correggi il difetto' }, modello: 'x', chiave: 'y', permessi: 'bypass', fetchDiRete: r.fetchDiRete, onGiro: (e) => eventi.push(e), ...extra });
  return { ...r, eventi, esito };
};
const conLaNota = (corpo) => corpo.messages.some((m) => m.role === 'user' && m.content === NOTA_RILEGGI_PRIMA_DI_CHIUDERE);
const riaperture = (eventi) => eventi.filter((e) => e.tipo === 'continuazione' && e.motivo === 'comando-rosso');
const lavoro = (ultimo) => [scrivi('a'), shell(verde, 'b'), shell(verde, 'c'), ultimo];

test('RIAPERTURA-01: chiusura con l ultimo comando rosso dopo aver scritto: una richiesta in più con la nota, e l evento della continuazione', async () => {
  const g = giro([...lavoro(shell(rosso, 'd')), testo('Il lavoro non è completo: le prove sono rosse.'), testo('Ora è finito.')]);
  const e = await g.esito;
  assert.equal(g.corpi.length, 6);
  assert.equal(conLaNota(g.corpi[5]), true);
  assert.equal(riaperture(g.eventi).length, 1);
  assert.equal(e.comeFinita, 'concluso');
});

test('RIAPERTURA-02 — AL CONTRARIO: rosso poi verde: nessuna richiesta in più', async () => {
  const g = giro([...lavoro(shell(rosso, 'd')), shell(verde, 'e'), testo('Finito, prove verdi.')]);
  await g.esito;
  assert.equal(g.corpi.length, 6);
  assert.equal(riaperture(g.eventi).length, 0);
});

test('RIAPERTURA-03: due chiusure rosse: una riapertura sola', async () => {
  const g = giro([...lavoro(shell(rosso, 'd')), testo('Non è completo.'), shell(rosso, 'e'), testo('Ancora rosso, mi fermo.')]);
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 1);
  assert.equal(g.corpi.length, 7);
});

test('RIAPERTURA-04 — AL CONTRARIO: senza file modificati un comando rosso non riapre (un grep che non trova niente)', async () => {
  const g = giro([shell(verde, 'a'), shell(verde, 'b'), shell(verde, 'c'), shell(rosso, 'd'), testo('Nessun risultato: il testo cercato non c è.')]);
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 0);
  assert.equal(g.corpi.length, 5);
});

test('RIAPERTURA-05 — AL CONTRARIO: sotto i passi minimi non riapre', async () => {
  const g = giro([scrivi('a'), shell(rosso, 'b'), testo('Non è completo.')]);
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 0);
  assert.equal(g.corpi.length, 3);
});

test('RIAPERTURA-06: un messaggio della persona in coda vince e azzera il segnale', async () => {
  /* la coda parla solo da quella richiesta in poi: 5 = alla chiusura, 4 = subito dopo il comando rosso, fra un passo e l'altro */
  for (const daRichiesta of [5, 4]) {
    let g; let detto = false;
    g = giro([...lavoro(shell(rosso, 'd')), testo('Non è completo.'), testo('Va bene.')], { codaMessaggiFn: () => {
      if (detto || g.corpi.length < daRichiesta) return null;
      detto = true;
      return 'Lascia stare, grazie.';
    } });
    await g.esito;
    assert.equal(detto, true, 'premessa: la coda ha parlato');
    assert.equal(riaperture(g.eventi).length, 0, `dalla richiesta ${daRichiesta}`);
    assert.equal(g.corpi.some(conLaNota), false);
  }
});

test('RIAPERTURA-07: col rifiuto del modello dopo il testo non riapre', async () => {
  const g = giro([...lavoro(shell(rosso, 'd')), { content: 'Prima parte.', finish: 'content_filter', native: 'refusal' }]);
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 0);
  assert.equal(g.corpi.length, 5);
});

test('RIAPERTURA-10: `file_edit` conta come file modificato, da solo', async () => {
  const cartella = cartellaDiProva('talos-riapertura-');
  writeFileSync(join(cartella, 'a.txt'), 'vecchio\n');
  const leggi = { tool_calls: [{ id: 'l', type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'a.txt' }) } }] };
  const modifica = { tool_calls: [{ id: 'm', type: 'function', function: { name: 'file_edit', arguments: JSON.stringify({ percorso: 'a.txt', old_string: 'vecchio', new_string: 'nuovo' }) } }] };
  const g = giro([leggi, modifica, shell(verde, 'c'), shell(rosso, 'd'), testo('Non è completo.'), testo('Finito.')], { cartella });
  await g.esito;
  assert.equal(readFileSync(join(cartella, 'a.txt'), 'utf8'), 'nuovo\n', 'premessa: la modifica è avvenuta');
  assert.equal(riaperture(g.eventi).length, 1);
});

test('RIAPERTURA-11: anche `prova` conta: rossa riapre, e una `prova` verde dopo un comando rosso azzera il segnale', async () => {
  const prova = (id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'prova', arguments: '{}' } }] });
  const rossa = giro([scrivi('a'), shell(verde, 'b'), shell(verde, 'c'), prova('d'), testo('Non è completo.'), testo('Finito.')], { comandoProva: rosso });
  await rossa.esito;
  assert.equal(riaperture(rossa.eventi).length, 1);
  const verdeDopo = giro([scrivi('a'), shell(verde, 'b'), shell(rosso, 'c'), prova('d'), testo('Finito, prove verdi.')], { comandoProva: verde });
  await verdeDopo.esito;
  assert.equal(riaperture(verdeDopo.eventi).length, 0);
});

/* R-53 bis: `altroVerde` non è il comando rosso, come il controllo a mano della G rip 2 di `hv27` */
const altroVerde = `${JSON.stringify(process.execPath)} -e "process.exit(0)" prova`;
const seCe = (file) => `${JSON.stringify(process.execPath)} -e "process.exit(require('fs').existsSync('${file}') ? 0 : 1)"`;

test('RIAPERTURA-12: rosso due volte, poi un controllo verde diverso: riapre', async () => {
  const g = giro([scrivi('a'), shell(rosso, 'b'), shell(rosso, 'c'), shell(altroVerde, 'd'), testo('Le prove non sono verdi.'), testo('Ora è finito.')]);
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 1);
  assert.equal(conLaNota(g.corpi[5]), true);
});

test('RIAPERTURA-13 — AL CONTRARIO: rosso una volta sola, poi verde diverso: non riapre', async () => {
  const g = giro([scrivi('a'), shell(verde, 'b'), shell(rosso, 'c'), shell(altroVerde, 'd'), testo('Finito.')]);
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 0);
  assert.equal(g.corpi.length, 5);
});

test('RIAPERTURA-14 — AL CONTRARIO: lo stesso comando rosso due volte, poi verde: non riapre', async () => {
  const g = giro([shell(seCe('f-c.txt'), 'a'), shell(seCe('f-c.txt'), 'b'), scrivi('c'), shell(seCe('f-c.txt'), 'd'), testo('Finito, prove verdi.')]);
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 0);
  assert.equal(g.corpi.length, 5);
});

test('RIAPERTURA-15: lo stesso comando con spazi diversi è lo stesso comando', async () => {
  const g = giro([scrivi('a'), shell(rosso, 'b'), shell(`  ${rosso.replace(' -e ', '   -e ')}`, 'c'), shell(altroVerde, 'd'), testo('Non è completo.'), testo('Finito.')]);
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 1);
});

test('RIAPERTURA-16: anche `prova` rilanciata conta, senza mescolarsi con gli altri comandi', async () => {
  const prova = (id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'prova', arguments: '{}' } }] });
  const g = giro([scrivi('a'), prova('b'), prova('c'), shell(altroVerde, 'd'), testo('Non è completo.'), testo('Finito.')], { comandoProva: rosso });
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 1);
});

test('RIAPERTURA-17: la persona azzera anche i comandi ricordati, alla chiusura e fra i passi', async () => {
  for (const daRichiesta of [5, 4]) {
    let g; let detto = false;
    g = giro([scrivi('a'), shell(rosso, 'b'), shell(rosso, 'c'), shell(altroVerde, 'd'), testo('Non è completo.'), testo('Va bene.')], { codaMessaggiFn: () => {
      if (detto || g.corpi.length < daRichiesta) return null;
      detto = true;
      return 'Lascia stare, grazie.';
    } });
    await g.esito;
    assert.equal(detto, true, 'premessa: la coda ha parlato');
    assert.equal(riaperture(g.eventi).length, 0, `dalla richiesta ${daRichiesta}`);
  }
});

test('RIAPERTURA-18: la memoria dei comandi ha un tetto, esce il più vecchio, e ignora un comando senza testo', () => {
  const comandi = new Map();
  const c = (comando) => ({ comando, cwd: 'A' });
  registraComando(comandi, undefined, true);
  registraComando(comandi, {}, true);
  registraComando(comandi, c('   '), true);
  assert.equal(comandi.size, 0);
  registraComando(comandi, c('primo'), true);
  registraComando(comandi, c('primo'), true);
  assert.equal(rossoRilanciato(comandi), true);
  for (let i = 0; i < COMANDI_RICORDATI; i++) registraComando(comandi, c(`c${i}`), false);
  assert.equal(comandi.size, COMANDI_RICORDATI);
  assert.equal(rossoRilanciato(comandi), false, 'il più vecchio è uscito');
  registraComando(comandi, c('c1'), true);
  registraComando(comandi, c('c1'), true);
  assert.equal(rossoRilanciato(comandi), true);
  assert.equal(comandi.size, COMANDI_RICORDATI);
  registraComando(comandi, c('c2'), false); // c1 è in coda: resta anche se ne entrano altri
  for (let i = 0; i < COMANDI_RICORDATI - 3; i++) registraComando(comandi, c(`d${i}`), false);
  assert.equal(rossoRilanciato(comandi), true, 'esce il meno recente, non il primo inserito');
});

test('RIAPERTURA-19: lo stesso comando in un altra cartella è un altro comando', () => {
  const comandi = new Map();
  registraComando(comandi, { comando: 'npm test', cwd: 'A' }, true);
  registraComando(comandi, { comando: 'npm test', cwd: 'A' }, true);
  registraComando(comandi, { comando: 'npm test', cwd: 'B' }, false);
  assert.equal(rossoRilanciato(comandi), true, 'il verde in B non azzera il rosso in A');
  const separati = new Map();
  registraComando(separati, { comando: 'npm test', cwd: 'A' }, true);
  registraComando(separati, { comando: 'npm test', cwd: 'B' }, true);
  assert.equal(rossoRilanciato(separati), false, 'una volta per cartella non è un rilancio');
});

test('RIAPERTURA-23: due errori di fila (owner): un verde azzera, quindi verde e rosso, o rosso, verde, rosso, non bastano', () => {
  const comandi = new Map();
  const c = { comando: 'npm test', cwd: 'A' };
  registraComando(comandi, c, false);
  registraComando(comandi, c, true);
  assert.equal(rossoRilanciato(comandi), false, 'verde poi rosso: il `grep` di verifica che non trova più niente');
  registraComando(comandi, c, false);
  registraComando(comandi, c, true);
  assert.equal(rossoRilanciato(comandi), false, 'rosso, verde, rosso');
  registraComando(comandi, c, true);
  assert.equal(rossoRilanciato(comandi), true, 'due di fila');
});

test('RIAPERTURA-25 — AL CONTRARIO: verifica per assenza: verde prima della cura, rosso dopo, poi un controllo verde: non riapre', async () => {
  const sparito = `${JSON.stringify(process.execPath)} -e "process.exit(require('fs').existsSync('f-c.txt') ? 1 : 0)"`;
  const g = giro([shell(sparito, 'a'), scrivi('c'), shell(sparito, 'b'), shell(altroVerde, 'd'), testo('Fatto: la riga non c è più.')]);
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 0);
  assert.equal(g.corpi.length, 5);
});

test('RIAPERTURA-24: una risposta vera a una domanda azzera tutto; annullata, saltata o scaduta no', async () => {
  const chiedi = (id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ id: 'scelta', question: 'Le prove restano rosse: mi fermo?', why: 'Decide se continuare.' }] }) } }] });
  const corsa = async (ultimo, risposta) => {
    const domande = [];
    const g = giro([scrivi('a'), shell(rosso, 'b'), shell(rosso, 'c'), ...ultimo, chiedi('e'), testo('Chiudo qui.'), testo('Chiuso.')], {
      chiediDomandaFn: async (q) => { domande.push(q); return risposta; } });
    await g.esito;
    assert.equal(domande.length, 1, 'premessa: la domanda è arrivata');
    return riaperture(g.eventi).length;
  };
  const risposta = { status: 'answered', answers: { scelta: 'Lascia stare, va bene così.' } };
  assert.equal(await corsa([shell(altroVerde, 'd')], risposta), 0, 'azzera la memoria dei comandi');
  assert.equal(await corsa([], risposta), 0, 'azzera anche l ultimo comando rosso');
  for (const status of ['cancelled', 'skipped', 'expired']) assert.equal(await corsa([shell(altroVerde, 'd')], { status }), 1, status);
});

test('RIAPERTURA-20: un comando rifiutato dalla persona non entra in memoria e non riapre', async () => {
  const domande = [];
  const g = giro([scrivi('a'), shell(rosso, 'b'), shell(rosso, 'c'), shell(altroVerde, 'd'), testo('Non è completo.'), testo('Va bene.')], {
    permessiPerAttrezzo: { shell: 'chiedi' }, chiediApprovazioneFn: async (azione) => { domande.push(azione); return !String(azione.comando ?? '').includes('process.exit(1)'); } });
  await g.esito;
  assert.equal(domande.length >= 2, true, 'premessa: la persona è stata interpellata');
  assert.equal(riaperture(g.eventi).length, 0);
});

test('RIAPERTURA-21: un comando passato in sottofondo non entra in memoria', async () => {
  const sfondo = (id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando: rosso, background: true }) } }] });
  const g = giro([scrivi('a'), sfondo('b'), sfondo('c'), shell(altroVerde, 'd'), testo('Finito.')]);
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 0);
});

test('RIAPERTURA-22: una `prova` senza test eseguiti (codice nullo) resta rossa, anche in memoria', async () => {
  const senzaTest = `${JSON.stringify(process.execPath)} -e "console.log('no tests found')"`;
  const prova = (id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'prova', arguments: '{}' } }] });
  const g = giro([scrivi('a'), prova('b'), prova('c'), shell(altroVerde, 'd'), testo('Non è completo.'), testo('Finito.')], { comandoProva: senzaTest });
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 1);
});

test('RIAPERTURA-08: motori locali fuori: `local`, `locale-ospite`, `ollama`, `lmstudio`', () => {
  const base = { comandoRosso: true, fileModificati: true, giaRiaperto: false, giro: PASSI_MINIMI_PER_RIAPRIRE, giriMassimi: Infinity, finishReason: 'stop', testo: 'fine', fermato: false, rifiutata: false, tagliata: null };
  assert.equal(deveRiaprireSuComandoRosso({ ...base, motoreLocale: false }), true);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, motoreLocale: true }), false);
});

test('RIAPERTURA-09: la regola, voce per voce: stop, tetti, risposta tagliata, testo vuoto', () => {
  const base = { comandoRosso: true, fileModificati: true, giaRiaperto: false, giro: 5, giriMassimi: 24, finishReason: 'stop', motoreLocale: false, testo: 'fine', fermato: false, rifiutata: false, tagliata: null };
  assert.equal(deveRiaprireSuComandoRosso(base), true);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, finishReason: null }), true);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, comandoRosso: false }), false);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, fileModificati: false }), false);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, giaRiaperto: true }), false);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, fermato: true }), false);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, rifiutata: true }), false);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, tagliata: { volte: 4 } }), false);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, finishReason: 'length' }), false);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, testo: '   ' }), false);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, giro: PASSI_MINIMI_PER_RIAPRIRE - 1 }), false);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, giro: PASSI_MINIMI_PER_RIAPRIRE }), true);
  assert.equal(deveRiaprireSuComandoRosso({ ...base, giro: 23 }), false, 'ultimo passo: una fine pulita non diventa un errore di tetto');
  assert.equal(deveRiaprireSuComandoRosso({ ...base, giro: 22 }), true);
});
