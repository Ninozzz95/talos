/*
 * The ▶ «Resume» button of the top bar (owner 04/11/2026 19:55, seen live: «it gets stuck or spins in vain»).
 *
 * Measured on a test server (port 4191, fake provider, then OpenRouter), report `RAPPORTO-RIPRENDI-BARRA-2026-11-04.md`:
 *   1. The answer of a POST /resume reaches the page BEFORE the RunStarted of the resumed turn on the stream that is still open
 *      (10 tries out of 10, by 1.5-32 ms). The page then closes that stream (`nuovaGenerazioneSessione`) and, by the HTML spec, a
 *      message queued on a closed EventSource is never dispatched: the new RunStarted only comes back inside the REPLAY of the new
 *      stream (measured: before `talos.fine-rigiocata`), where the page does not reset `chiusaDalServer` (O-48). The flag was true
 *      (the session list says «concluded» a moment after every turn), so the resumed turn ran «closed»: no Stop, no live rows,
 *      and a message written meanwhile was refused as «still running». Sending a message (`submitPrompt`) and «Send now» reset the
 *      flag themselves; the ▶ button, «Continue now with…» and the 116 resume did not.
 *      ⇒ `resumeSession` resets it where the server has said yes. Hermes does the same: the busy state is set when the turn is sent,
 *        not from the stream (`use-prompt-actions/index.ts:1206-1209`), and a stale «not running» never rewinds a live turn
 *        (`use-session-actions/resume-verdicts.ts:40-56`).
 *   2. ▶ pressed while a turn is running: the server refuses (409, «still running»), but before asking the page had relabelled the
 *      live waiting row of the turn («Running the command…» became the generic wait) and after the refusal it REMOVED it: the turn
 *      kept going with nothing moving on screen. ⇒ with a turn alive and no message, the waiting row is not touched; the refusal
 *      still says why. Hermes answers the refusals before touching anything (`gateway/slash_commands_session.py:463-467`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

/** A function of the monolith (two-space indent), from a GIVEN source (also a broken copy), run in a fake context. */
function funzioneDa(sorgente, nome, contesto) {
  const codice = sorgente.match(new RegExp(`^  (?:async )?function ${nome}\\([^]*?^  }`, 'm'))?.[0];
  assert.ok(codice, `function ${nome} missing from app.js: the cure changed shape, follow it here`);
  return vm.runInNewContext(`(${codice})`, contesto);
}

/** A bench around the REAL `resumeSession` and the REAL `runRealeAttivo`; the network and the DOM are stubs that count. */
function banco(sorgente = APP, { chiusaDalServer = true, eventoTerminaleVisto = true, rifiuto = null, attesa = null } = {}) {
  const conti = { mostra: [], nascondi: 0, toast: [], post: [], generazioni: 0, collegate: 0 };
  const state = { model: 'm', realSession: { id: 's1', taskId: 't1', generation: 4, chiusaDalServer, eventoTerminaleVisto,
    attesaBubble: attesa, followUpBubbleInAttesa: false, deferHistoricalRendering: false } };
  const contesto = {
    state, console,
    toast: (...a) => conti.toast.push(a), tr: (k) => k,
    iniziaMisuraLatenza() {}, segnaTappaLatenza() {}, dimenticaDettato() {},
    appendUserFollowUp() {}, appendStatusNote() {}, rimettiInvioFallito() {}, ripristinaImmagini() {},
    linguaDelMessaggioDettato: () => null, payloadImmagini: (x) => x, fraseDelMotivo: (e) => e?.message ?? '',
    allineaLinguaDellaSessione: async () => {},
    mostraAttesaRisposta: (...a) => { conti.mostra.push(a); if (state.realSession.attesaBubble) state.realSession.attesaBubble.dataset.activity = a[0] ?? 'attesa'; },
    nascondiAttesaRisposta: () => { conti.nascondi += 1; state.realSession.attesaBubble = null; },
    apiPost: async (url, corpo) => { conti.post.push({ url, corpo }); if (rifiuto) throw rifiuto; return { sessionId: 's1' }; },
    nuovaGenerazioneSessione: () => { conti.generazioni += 1; return 5; },
    /* the real `collegaEventiSessione` opens the new stream and says «no terminal event seen yet» (app.js, its first lines) */
    collegaEventiSessione: () => { conti.collegate += 1; state.realSession.eventoTerminaleVisto = false; },
    aggiornaElencoSessioniReali() {},
  };
  contesto.runRealeAttivo = funzioneDa(sorgente, 'runRealeAttivo', contesto);
  const resumeSession = funzioneDa(sorgente, 'resumeSession', contesto);
  return { conti, state, resumeSession, runRealeAttivo: contesto.runRealeAttivo };
}

const NON_PRONTA = Object.assign(new Error('The session is still running: wait for it to finish before resuming it'), { code: 'SESSION_NOT_READY' });

/* ─────────────── 1. the resumed turn is LIVE, even when its RunStarted only comes back in the replay ─────────────── */

test('RB-01 — ▶ after a finished answer: once the server says yes, the turn is live (Stop on, live rows on)', async () => {
  const b = banco(APP, { chiusaDalServer: true });
  assert.equal(b.runRealeAttivo(), false, 'before: the session is concluded');
  assert.equal(await b.resumeSession(), true);
  assert.equal(JSON.stringify(b.conti.post.map((p) => [p.url, p.corpo])), '[["/api/v1/sessions/s1/resume",{}]]', 'the same body as always: {}');
  assert.equal(b.state.realSession.chiusaDalServer, false, 'the stale «closed by the server» flag does not outlive the yes');
  assert.equal(b.runRealeAttivo(), true, 'the composer offers Stop for the resumed turn');
});

test('RB-02 — the same for every caller without a message: «Continue now with…» and the 116 resume (`ripresaDopo`)', async () => {
  for (const argomenti of [[], ['', [], { ripresaDopo: 'rete-tornata' }]]) {
    const b = banco(APP, { chiusaDalServer: true });
    assert.equal(await b.resumeSession(...argomenti), true);
    assert.equal(b.runRealeAttivo(), true, JSON.stringify(argomenti));
  }
});

test('RB-03 AL CONTRARIO — a refused resume leaves a concluded session concluded (no Stop for a turn that never started)', async () => {
  const b = banco(APP, { chiusaDalServer: true, rifiuto: Object.assign(new Error('no'), { code: 'SESSION_NOT_READY' }) });
  assert.equal(await b.resumeSession(), false);
  assert.equal(b.state.realSession.chiusaDalServer, true);
  assert.equal(b.runRealeAttivo(), false);
  assert.equal(b.conti.generazioni, 0, 'no new stream for a refused resume');
});

/* ─────────────── 2. ▶ during a running turn does not take away the turn's own waiting row ─────────────── */

test('RB-04 — ▶ while a command runs: the refusal is said, the live row stays as it was', async () => {
  const riga = { dataset: { activity: 'comando', toolCallId: 'call_7' } };
  const b = banco(APP, { chiusaDalServer: false, eventoTerminaleVisto: false, rifiuto: NON_PRONTA, attesa: riga });
  assert.equal(b.runRealeAttivo(), true, 'a turn is running');
  assert.equal(await b.resumeSession(), false);
  assert.equal(b.state.realSession.attesaBubble, riga, 'the waiting row of the running turn is still there');
  assert.equal(riga.dataset.activity, 'comando', 'and still says what it is doing');
  assert.equal(b.conti.nascondi, 0);
  assert.deepEqual(b.conti.mostra, []);
  assert.equal(b.conti.toast.length, 1, 'the person still learns why nothing restarted');
  assert.equal(b.conti.toast[0][0], 'app.run.resumeFailed');
});

test('RB-05 AL CONTRARIO — with nothing running the wait is armed before the request and taken down after a refusal; a message always arms it', async () => {
  const fermo = banco(APP, { chiusaDalServer: true, rifiuto: new Error('down') });
  await fermo.resumeSession();
  assert.equal(fermo.conti.mostra.length, 1, 'armed before the request (the press is answered at once)');
  assert.equal(fermo.conti.nascondi, 1, 'and taken down after the refusal');
  const conMessaggio = banco(APP, { chiusaDalServer: false, eventoTerminaleVisto: false, rifiuto: NON_PRONTA });
  await conMessaggio.resumeSession('ciao');
  assert.equal(conMessaggio.conti.mostra.length, 1, 'a message (the queue fallback) still arms its wait');
  const riuscito = banco(APP, { chiusaDalServer: true });
  await riuscito.resumeSession();
  assert.equal(riuscito.conti.mostra.length, 2, 'success: armed before, re-armed after the new generation (02/9)');
});

/* ─────────────── every key check also runs on a BROKEN copy: there it must fail, or it is not looking at anything ─────────────── */

test('RB-06 AL CONTRARIO — the bench catches the broken copies', async () => {
  const guasta = (da, a) => { assert.ok(APP.includes(da), `the cured source no longer holds: ${da}`); return APP.replace(da, () => a); };
  const SEGNO_RESET = 'state.realSession.chiusaDalServer = false; // ▶';
  const SEGNO_VIVO = 'const giroGiaVivo = !messaggioFollowUp && !viaCodaId && runRealeAttivo();';
  // without the reset the resumed turn runs «closed» again
  const senzaReset = banco(guasta(SEGNO_RESET, ';'), { chiusaDalServer: true });
  await senzaReset.resumeSession();
  assert.equal(senzaReset.runRealeAttivo(), false);
  // without the guard the live row is relabelled and removed again
  const riga = { dataset: { activity: 'comando' } };
  const senzaGuardia = banco(guasta(SEGNO_VIVO, 'const giroGiaVivo = false;'), { chiusaDalServer: false, eventoTerminaleVisto: false, rifiuto: NON_PRONTA, attesa: riga });
  await senzaGuardia.resumeSession();
  assert.equal(senzaGuardia.state.realSession.attesaBubble, null);
});
