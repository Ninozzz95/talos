import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { creaPuntiDiRipristino } from '../src/punti-di-ripristino.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 18/10/2026 — R5.11 dentro il registro delle sessioni: la foto parte dal gancio che il kernel chiama prima di ogni attrezzo
 * (`hookFn`, pre_tool_call), l'impronta da quello dopo (post_tool_call). Il kernel è finto (come in session-registry.test.mjs):
 * il gancio si chiama a mano, esattamente come lo chiama `talosLavora`.
 */
function sessioneFinta() {
  let risolvi;
  let input = null;
  return {
    avviaSessioneFn: async (i) => {
      input = i;
      i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      return new Promise((ok) => { risolvi = ok; });
    },
    concludi() {
      if (!risolvi) return;
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
      risolvi({ ok: true }); risolvi = null;
    },
    get input() { return input; },
  };
}

async function banco({ conPunti = true, hookUtente = null } = {}) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-punti-reg-'));
  const progetto = join(radice, 'progetto');
  await mkdir(progetto, { recursive: true });
  await writeFile(join(progetto, 'a.txt'), 'prima\n');
  const finta = sessioneFinta();
  const punti = conPunti ? creaPuntiDiRipristino({ cartellaDelloStore: async () => join(radice, 'dati') }) : null;
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    ...(punti ? { puntiDiRipristino: punti } : {}),
    ...(hookUtente ? { caricaHooksFn: async () => ({ hooks: [{ id: 'h', eventi: ['pre_tool_call'], comando: 'x', hash: 'h' }] }), verificaTrustFn: async () => true, eseguiHookFn: hookUtente } : {}),
  });
  const { sessionId } = registro.avvia('task-vero');
  /* `concludi` anche qui: un'asserzione rossa prima della fine non deve lasciare la sessione viva (la prova non finirebbe mai) */
  return { radice, progetto, finta, punti, registro, sessionId, via: async () => { finta.concludi(); await punti?.fermo(); await rimuoviCartellaDiProvaAttesa(radice); } };
}

test('RIP-01 dal gancio del kernel: foto prima di scrivere, impronta dopo; annullare a giro in corso si rifiuta, a giro finito rimette il file', async () => {
  const b = await banco();
  try {
    const esito = await b.finta.input.hookFn({ tipo: 'pre_tool_call', azione: 'scrivi', argomenti: { percorso: 'a.txt' }, giro: 1 });
    assert.equal(esito?.consentito, true, 'il gancio risponde come prima');
    await writeFile(join(b.progetto, 'a.txt'), 'dopo\n');
    await b.finta.input.hookFn({ tipo: 'post_tool_call', azione: 'scrivi', esito: 'ok', giro: 1 });
    const el = await b.registro.puntiDiRipristinoDi(b.sessionId);
    assert.deepEqual(el.punti.map((p) => [p.turno, p.annullabile]), [[1, true]]);
    assert.ok(Number.isSafeInteger(el.punti[0].seqAvvio) && el.punti[0].seqAvvio >= 1, 'il punto sa a quale messaggio a schermo appartiene (giro:<sequenza>)');
    const occupato = await b.registro.annullaModifiche(b.sessionId, 1);
    assert.deepEqual([occupato.code, occupato.reason], ['SESSION_NOT_READY', 'undo-while-working']);
    assert.equal((await readFile(join(b.progetto, 'a.txt'), 'utf8')), 'dopo\n', 'rifiutato: niente toccato');
    b.finta.concludi();
    await b.registro.attendiAssestamento?.(b.sessionId);
    const ant = await b.registro.anteprimaAnnulla(b.sessionId, 1);
    assert.deepEqual(ant.ripristina.map((x) => x.percorso), ['a.txt']);
    const r = await b.registro.annullaModifiche(b.sessionId, 1);
    assert.deepEqual(r.ripristinati, ['a.txt']);
    assert.equal((await readFile(join(b.progetto, 'a.txt'), 'utf8')), 'prima\n');
  } finally { await b.via(); }
});

test('RIP-02 al contrario: un attrezzo che NON scrive non fa foto', async () => {
  const b = await banco();
  try {
    for (const azione of ['leggi', 'cerca', 'elenca', 'web_search']) {
      await b.finta.input.hookFn({ tipo: 'pre_tool_call', azione, argomenti: { percorso: 'a.txt' }, giro: 1 });
    }
    assert.deepEqual((await b.registro.puntiDiRipristinoDi(b.sessionId)).punti, []);
  } finally { await b.via(); }
});

test('RIP-04 al contrario: un gancio dell\'utente che RIFIUTA la scrittura non lascia nessuna foto', async () => {
  const b = await banco({ hookUtente: async () => ({ consentito: false, motivo: 'no' }) });
  try {
    const negato = await b.finta.input.hookFn({ tipo: 'pre_tool_call', azione: 'scrivi', argomenti: { percorso: 'a.txt' }, giro: 1 });
    assert.equal(negato.consentito, false);
    assert.deepEqual((await b.registro.puntiDiRipristinoDi(b.sessionId)).punti, []);
  } finally { await b.via(); }
});

test('RIP-03 senza il servizio (le prove, la CLI): nessun git, e annullare dice che qui non c\'è', async () => {
  const b = await banco({ conPunti: false });
  try {
    const esito = await b.finta.input.hookFn({ tipo: 'pre_tool_call', azione: 'scrivi', argomenti: { percorso: 'a.txt' }, giro: 1 });
    assert.equal(esito.consentito, true);
    assert.deepEqual(await b.registro.puntiDiRipristinoDi(b.sessionId), { ok: true, disponibile: false, punti: [] });
    b.finta.concludi();
    const r = await b.registro.anteprimaAnnulla(b.sessionId, 1);
    assert.deepEqual([r.code, r.reason], ['SESSION_NOT_READY', 'undo-off']);
    assert.equal((await b.registro.annullaModifiche('inesistente', 1)).code, 'NOT_FOUND');
  } finally { await b.via(); }
});

/*
 * R5.11, seconda porta — l'ospite di `file_changes_undo` dentro il registro: due giri della stessa conversazione (il primo scrive, il
 * secondo è quello in cui la persona chiede di annullare). Più giri ⇒ una sessione finta che ne regge più d'uno.
 */
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
    concludi(k) {
      const g = giri[k];
      if (!g?.risolvi) return;
      g.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${k + 1}` });
      g.risolvi({ ok: true });
      g.risolvi = null;
    },
    giro: (k) => giri[k],
    chiudiTutti() { giri.forEach((_, k) => this.concludi(k)); },
  };
}
async function bancoDueGiri({ senzaInterfaccia = false } = {}) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-punti-att-'));
  const progetto = join(radice, 'progetto');
  await mkdir(progetto, { recursive: true });
  await writeFile(join(progetto, 'a.txt'), 'prima\n');
  const finta = giriFinti();
  const punti = creaPuntiDiRipristino({ cartellaDelloStore: async () => join(radice, 'dati') });
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, modello: 'm', chiave: 'k', puntiDiRipristino: punti,
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
  });
  const { sessionId } = registro.avvia('task-vero', senzaInterfaccia ? { senzaInterfaccia: true } : {});
  return { radice, progetto, finta, punti, registro, sessionId, via: async () => { finta.chiudiTutti(); await punti.fermo(); await rimuoviCartellaDiProvaAttesa(radice); } };
}
async function primoGiroCheScrive(b) {
  const hook = b.finta.giro(0).input.hookFn;
  await hook({ tipo: 'pre_tool_call', azione: 'scrivi', argomenti: { percorso: 'a.txt' }, giro: 1 });
  await writeFile(join(b.progetto, 'a.txt'), 'dopo\n');
  await hook({ tipo: 'post_tool_call', azione: 'scrivi', esito: 'ok', giro: 1 });
  b.finta.concludi(0);
  await b.registro.attendiAssestamento?.(b.sessionId);
}

test('RIP-05 dalla chat: nel giro dopo, l\'ospite prepara la carta coi file e, approvata, rimette il file e lo dice al modello', async () => {
  const b = await bancoDueGiri();
  try {
    await primoGiroCheScrive(b);
    assert.equal(b.registro.resume(b.sessionId, 'annulla quello che hai fatto').erroreAvvio, undefined);
    const ospite = b.finta.giro(1).input.onAnnullaFileFn;
    assert.equal(typeof ospite, 'function', 'la conversazione principale con qualcuno davanti ha la seconda porta');
    const anteprima = await ospite('file_changes_undo', {}, { fase: 'anteprima', toolCallId: 'c1' });
    assert.deepEqual([anteprima.ok, anteprima.carta, anteprima.azione.tipo, anteprima.azione.ripristina.map((x) => x.percorso)], [true, true, 'file_changes_undo', ['a.txt']]);
    assert.equal(await readFile(join(b.progetto, 'a.txt'), 'utf8'), 'dopo\n', 'l\'anteprima non tocca niente');
    const fatto = await ospite('file_changes_undo', {}, { fase: 'esegui', toolCallId: 'c1' });
    assert.match(fatto.testo, /^Put back as they were before that message: a\.txt\./u);
    assert.equal(await readFile(join(b.progetto, 'a.txt'), 'utf8'), 'prima\n');
  } finally { await b.via(); }
});

test('RIP-06 al contrario: senza nessuno davanti (richiesta CLI 18/10) l\'attrezzo non c\'è; e senza turni prima che abbiano scritto, rifiuta col motivo', async () => {
  const s = await bancoDueGiri({ senzaInterfaccia: true });
  try {
    assert.equal(s.finta.giro(0).input.onAnnullaFileFn, undefined);
  } finally { await s.via(); }
  const b = await bancoDueGiri();
  try {
    const r = await b.finta.giro(0).input.onAnnullaFileFn('file_changes_undo', {}, { fase: 'anteprima' });
    assert.equal(r.ok, false);
    assert.match(r.messaggio, /did not change any file in the earlier messages/u);
    const storto = await b.finta.giro(0).input.onAnnullaFileFn('file_changes_undo', { turns_back: 0 }, { fase: 'anteprima' });
    assert.match(storto.messaggio, /"turns_back" must be a whole number from 1 to 20/u);
  } finally { await b.via(); }
});

test('RIP-07 al contrario: un\'ALTRA conversazione che lavora nella stessa cartella ferma l\'annullamento dalla chat; la propria no', async () => {
  const b = await bancoDueGiri();
  try {
    await primoGiroCheScrive(b);
    assert.equal(b.registro.resume(b.sessionId, 'annulla').erroreAvvio, undefined);
    const ospite = b.finta.giro(1).input.onAnnullaFileFn;
    assert.equal((await ospite('file_changes_undo', {}, { fase: 'anteprima' })).ok, true, 'la conversazione che chiama sta lavorando: non conta');
    b.registro.avvia('task-vero'); // un'altra conversazione, stessa cartella, giro aperto
    const r = await ospite('file_changes_undo', {}, { fase: 'anteprima' });
    assert.deepEqual([r.ok, /Another conversation is working in this folder/u.test(r.messaggio)], [false, true]);
  } finally { await b.via(); }
});

test('RIP-08 il turno della richiesta non conta: anche se il modello vi ha già scritto, «turns_back: 1» torna al turno PRIMA', async () => {
  const b = await bancoDueGiri();
  try {
    await primoGiroCheScrive(b);
    assert.equal(b.registro.resume(b.sessionId, 'annulla').erroreAvvio, undefined);
    const giro = b.finta.giro(1).input;
    await giro.hookFn({ tipo: 'pre_tool_call', azione: 'scrivi', argomenti: { percorso: 'b.txt' }, giro: 1 });
    await writeFile(join(b.progetto, 'b.txt'), 'scritto in questo turno\n');
    await giro.hookFn({ tipo: 'post_tool_call', azione: 'scrivi', esito: 'ok', giro: 1 });
    const anteprima = await giro.onAnnullaFileFn('file_changes_undo', {}, { fase: 'anteprima' });
    assert.deepEqual(anteprima.azione.ripristina.map((x) => x.percorso).sort(), ['a.txt', 'b.txt'], 'dal punto del turno 1: tutto ciò che è venuto dopo');
  } finally { await b.via(); }
});

test('RIP-09 (dal Mobile, 19/10) senza git l\'attrezzo non si offre; con git sì — e prima della misura non si nega a vuoto', async () => {
  const conGit = async (presente) => {
    const radice = await mkdtemp(join(tmpdir(), 'talos-punti-git-'));
    const progetto = join(radice, 'progetto');
    await mkdir(progetto, { recursive: true });
    const finta = giriFinti();
    const punti = creaPuntiDiRipristino({
      cartellaDelloStore: async () => join(radice, 'dati'),
      eseguiGitFn: async ({ argomenti }) => (argomenti[0] === '--version' && !presente
        ? { codice: -1, stdout: Buffer.alloc(0), stderr: '', assente: true }
        : { codice: 0, stdout: Buffer.from('git version 2.47.1'), stderr: '', assente: false }),
    });
    assert.equal(punti.gitPresente(), null, 'prima della misura non si sa');
    await punti.misuraGit(progetto);
    const registro = createSessionRegistry({
      avviaSessioneFn: finta.avviaSessioneFn, modello: 'm', chiave: 'k', puntiDiRipristino: punti,
      preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    });
    registro.avvia('task-vero');
    const porta = typeof finta.giro(0).input.onAnnullaFileFn;
    finta.chiudiTutti(); await punti.fermo(); await rimuoviCartellaDiProvaAttesa(radice);
    return [punti.gitPresente(), porta];
  };
  assert.deepEqual(await conGit(false), [false, 'undefined']);
  assert.deepEqual(await conGit(true), [true, 'function']);
  /* al contrario: un errore passeggero (git c'è, ma `--version` esce male una volta) non si ricorda — la porta resta, e si riprova */
  let volte = 0;
  const radice = await mkdtemp(join(tmpdir(), 'talos-punti-git-'));
  const punti = creaPuntiDiRipristino({
    cartellaDelloStore: async () => join(radice, 'dati'),
    eseguiGitFn: async () => { volte += 1; return volte === 1 ? { codice: 1, stdout: Buffer.alloc(0), stderr: 'timeout', assente: false } : { codice: 0, stdout: Buffer.from('git version 2.47.1'), stderr: '', assente: false }; },
  });
  assert.equal((await punti.misuraGit(radice)).ok, false);
  assert.equal(punti.gitPresente(), null, 'un errore che non è l\'assenza non spegne la porta');
  assert.equal((await punti.misuraGit(radice)).ok, true);
  assert.equal(punti.gitPresente(), true);
  await punti.fermo(); await rimuoviCartellaDiProvaAttesa(radice);
});
