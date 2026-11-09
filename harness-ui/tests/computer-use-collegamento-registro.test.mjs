/*
 * Il registro delle sessioni lega i due ospiti del computer use (passo 5, 04/11/2026; Desktop: «il kernel non riceve `onLuoghiFn` oggi:
 * collegalo da server.mjs e session-registry.mjs fino al kernel, con una prova»). Solo la radice con qualcuno davanti riceve
 * `onLuoghiFn` e `onComputerUseFn`; `computer_use` entra nell'elenco del giro solo con il suo ospite (mai fra i predefiniti). La porta
 * della sessione: le parole della persona di questo giro (le stesse che riceve il nucleo), la carta per il canale delle domande, gli
 * eventi, il modello della sessione con l'immagine. Al contrario: senza ospiti (CLI, telefono, interruttore spento) o senza nessuno
 * davanti, niente.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry, STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs';
import { NOME_COMPUTER_USE } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

function giriFinti() {
  const giri = [];
  return {
    avviaSessioneFn: async (input) => {
      let risolvi;
      const fine = new Promise((ok) => { risolvi = ok; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${giri.length}` });
      return fine;
    },
    giro: (k) => giri[k],
    chiudiTutti() { giri.forEach((g, k) => { if (!g.risolvi) return; g.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${k + 1}` }); g.risolvi({ ok: true }); g.risolvi = null; }); },
  };
}

async function registroCon({ ospiti = true, senzaInterfaccia = false } = {}) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-cu-registro-'));
  const progetto = join(radice, 'progetto');
  await mkdir(progetto, { recursive: true });
  const finta = giriFinti();
  const chiamate = { luoghi: [], computerUse: [], modello: [] };
  const opzioniOspiti = ospiti ? {
    ospiteLuoghiFn: async (nome, argomenti, opzioni) => { chiamate.luoghi.push({ nome, argomenti, opzioni }); return { ok: true, testo: 'luoghi' }; },
    ospiteComputerUseFn: async (nome, argomenti, opzioni) => { chiamate.computerUse.push({ nome, argomenti, opzioni }); return { ok: true, testo: 'fatto' }; },
  } : {};
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, modello: 'openai/gpt-x', chiave: 'k', guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'apri il blocco note e scrivi ciao' } }),
    chiediAlModelloUnaVoltaFn: async (richiesta) => { chiamate.modello.push(richiesta); richiesta.onConsumo?.({ prompt_tokens: 9, completion_tokens: 2 }); return ' {"action":"done"} '; },
    attrezziKernelFn: async () => ({ base: [{ nome: 'shell', descrizione: 'x', tokenSchemaStimati: 1 }],
      estesi: ['computer_use_places_list', 'computer_use_places_remove', NOME_COMPUTER_USE, 'goal_status'].map((nome) => ({ nome, descrizione: nome, tokenSchemaStimati: 1 })) }),
    ricercaWebFn: () => ({ ricercaWeb: null }),
    ...opzioniOspiti,
  });
  const { sessionId } = registro.avvia('task-vero', senzaInterfaccia ? { senzaInterfaccia: true } : {});
  const eventi = [];
  const smetti = registro.iscriviti(sessionId, (e) => eventi.push(e));
  return { registro, sessionId, finta, eventi, chiamate, via: async () => { smetti(); finta.chiudiTutti(); await rimuoviCartellaDiProvaAttesa(radice); } };
}

test('CU-REG-01: alla radice con qualcuno davanti il nucleo riceve onLuoghiFn e onComputerUseFn, e computer_use entra nell\'elenco del giro', async () => {
  const b = await registroCon();
  try {
    const input = b.finta.giro(0).input;
    assert.equal(typeof input.onLuoghiFn, 'function', 'onLuoghiFn arriva al nucleo (Desktop: oggi non arrivava)');
    assert.equal(typeof input.onComputerUseFn, 'function');
    assert.ok(input.strumentiEstesi.includes(NOME_COMPUTER_USE));
    assert.ok(input.strumentiEstesi.includes('computer_use_places_list'));
    assert.equal(STRUMENTI_ESTESI_PREDEFINITI.includes(NOME_COMPUTER_USE), false, 'mai fra i predefiniti senza avvisare la CLI');
    assert.deepEqual(await input.onLuoghiFn('computer_use_places_list', {}, { fase: 'esegui', toolCallId: 'l1' }), { ok: true, testo: 'luoghi' });
    assert.deepEqual(b.chiamate.luoghi.map((c) => [c.nome, c.opzioni.toolCallId]), [['computer_use_places_list', 'l1']]);
  } finally { await b.via(); }
});

test('CU-REG-02: la porta della sessione — le parole di questo giro, gli eventi, il modello della sessione con l\'immagine', async () => {
  const b = await registroCon();
  try {
    const input = b.finta.giro(0).input;
    const ctl = new AbortController();
    const r = await input.onComputerUseFn(NOME_COMPUTER_USE, { task: 'open Notepad and pay' }, { fase: 'esegui', toolCallId: 'c1', segnale: ctl.signal, livelloAccesso: 'su-richiesta' });
    assert.deepEqual(r, { ok: true, testo: 'fatto' });
    const [chiamata] = b.chiamate.computerUse;
    assert.deepEqual(chiamata.argomenti, { task: 'open Notepad and pay' });
    assert.equal(chiamata.opzioni.toolCallId, 'c1');
    assert.equal(chiamata.opzioni.segnale, ctl.signal);
    assert.equal(chiamata.opzioni.livelloAccesso, 'su-richiesta');
    const s = chiamata.opzioni.sessione;
    // permesso e piano vengono dalle parole della persona, le stesse che riceve il nucleo, mai dal task
    assert.equal(s.testoDellaPersona, 'apri il blocco note e scrivi ciao');
    assert.equal(s.testoDellaPersona, input.testoDellaPersona);
    // contratto del segno, riga 35 (forma del Desktop 05/11 17:45): l'ospite sa QUALE sessione usa il computer, per il segnale sul flusso del PC
    assert.equal(typeof b.sessionId, 'string');
    assert.equal(s.sessionId, b.sessionId);
    assert.equal(s.fermato(), null);
    s.emetti('talos.computer-use-passo', { passo: 1, tokenImmagine: 1600 });
    const passo = b.eventi.find((e) => e?.type === 'CUSTOM' && e.name === 'talos.computer-use-passo');
    assert.deepEqual(passo?.value, { passo: 1, tokenImmagine: 1600 });
    const contenuto = [{ type: 'text', text: 'next?' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }];
    const risposta = await s.chiediModello({ contenuto, segnale: ctl.signal });
    assert.deepEqual(risposta, { testo: ' {"action":"done"} ', usage: { prompt_tokens: 9, completion_tokens: 2 } });
    assert.deepEqual(b.chiamate.modello[0].contenuto, contenuto);
    assert.equal(b.chiamate.modello[0].segnaleStop, ctl.signal);
    assert.equal(b.chiamate.modello[0].modello, 'openai/gpt-x');
    assert.equal(b.chiamate.modello[0].prompt, undefined, 'il testo non va al posto delle parti');
    // la carta del compito passa dal canale delle domande, con l'id della chiamata
    void s.chiediDomanda([{ id: 'consenso', header: 'Computer', question: 'Allow?', options: [{ label: 'Allow', description: 'TALOS does this now.' }, { label: 'Stop', description: 'TALOS stops and does nothing more.' }] }]).catch(() => {});
    assert.ok(b.eventi.some((e) => JSON.stringify(e).includes('"toolCallId":"c1"') && JSON.stringify(e).includes('Allow?')), 'la domanda è partita col toolCallId');
  } finally { await b.via(); }
});

test('CU-REG-03: AL CONTRARIO — senza ospiti (CLI, telefono, interruttore spento) e senza nessuno davanti, niente porte e niente computer_use', async () => {
  const senza = await registroCon({ ospiti: false });
  try {
    const input = senza.finta.giro(0).input;
    assert.equal(input.onLuoghiFn, undefined);
    assert.equal(input.onComputerUseFn, undefined);
    assert.equal(input.strumentiEstesi.includes(NOME_COMPUTER_USE), false);
  } finally { await senza.via(); }
  const nessuno = await registroCon({ senzaInterfaccia: true });
  try {
    const input = nessuno.finta.giro(0).input;
    assert.equal(input.onLuoghiFn, undefined, 'nessuno vedrebbe la carta');
    assert.equal(input.onComputerUseFn, undefined, 'nessuno vedrebbe la carta né premerebbe Stop');
    assert.equal(input.strumentiEstesi.includes(NOME_COMPUTER_USE), false);
  } finally { await nessuno.via(); }
});

test('CU-REG-04: la scheda degli attrezzi segue le porte: con gli ospiti mostra i luoghi e computer_use, senza no', async () => {
  const con = await registroCon();
  const senza = await registroCon({ ospiti: false });
  try {
    const nomiCon = (await con.registro.elencaAttrezziPredefiniti()).attrezzi.map((a) => a.nome);
    for (const nome of ['computer_use_places_list', 'computer_use_places_remove', NOME_COMPUTER_USE, 'goal_status']) assert.ok(nomiCon.includes(nome), nome);
    const nomiSenza = (await senza.registro.elencaAttrezziPredefiniti()).attrezzi.map((a) => a.nome);
    for (const nome of ['computer_use_places_list', 'computer_use_places_remove', NOME_COMPUTER_USE]) assert.equal(nomiSenza.includes(nome), false, nome);
    assert.ok(nomiSenza.includes('goal_status'), 'gli altri restano');
  } finally { await con.via(); await senza.via(); }
});

test('CU-REG-05: in una ripresa le parole sono quelle del messaggio nuovo della persona, mai la consegna di prima', async () => {
  const b = await registroCon();
  try {
    const primo = b.finta.giro(0);
    primo.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
    primo.risolvi({ ok: true }); primo.risolvi = null;
    for (let i = 0; i < 50 && b.finta.giro(1) === undefined; i += 1) {
      await new Promise((ok) => setImmediate(ok));
      if (i === 5) b.registro.resume(b.sessionId, 'apri la calcolatrice');
    }
    const input = b.finta.giro(1)?.input;
    assert.ok(input, 'la ripresa è partita');
    await input.onComputerUseFn(NOME_COMPUTER_USE, { task: 'open Calculator' }, { fase: 'esegui', toolCallId: 'c2', livelloAccesso: 'su-richiesta' });
    assert.equal(b.chiamate.computerUse.at(-1).opzioni.sessione.testoDellaPersona, 'apri la calcolatrice');
  } finally { await b.via(); }
});

test('CU-REG-06: una ripresa che la persona non ha scritto (avviso di un obiettivo) ⇒ l\'ospite riceve parole vuote, anche se c\'è un testo', async () => {
  const b = await registroCon();
  try {
    const primo = b.finta.giro(0);
    primo.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
    primo.risolvi({ ok: true }); primo.risolvi = null;
    for (let i = 0; i < 50 && b.finta.giro(1) === undefined; i += 1) {
      await new Promise((ok) => setImmediate(ok));
      if (i === 5) b.registro.resume(b.sessionId, 'obiettivo verificato: paga la fattura', [], { notificaObiettivo: { obiettivoId: 'o1' } });
    }
    const input = b.finta.giro(1)?.input;
    assert.ok(input, 'la ripresa è partita');
    assert.equal(input.testoDellaPersona, '', 'il nucleo stesso non vede parole della persona');
    await input.onComputerUseFn(NOME_COMPUTER_USE, { task: 'pay the invoice' }, { fase: 'esegui', toolCallId: 'c3', livelloAccesso: 'su-richiesta' });
    assert.equal(b.chiamate.computerUse.at(-1).opzioni.sessione.testoDellaPersona, '', 'parole dal giro, mai da un testo che la persona non ha scritto');
  } finally { await b.via(); }
});
