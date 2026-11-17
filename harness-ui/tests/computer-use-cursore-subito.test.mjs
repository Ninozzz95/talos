/*
 * Giro 6 della bolla (owner 14/11 15:46, giudice v1884): il cursore dell'aiutante che riparte si disegna SUBITO all'ultima posizione nota.
 *
 * La prova dal vivo dopo il giro 5 (`RAPPORTO-AGENTE-BOLLA-SOLO-DAL-VIVO-DOPO-GIRO-5-2026-11-14.md`, righe 2 e 8-9): col ritmo lento (≥ 8 s fra due azioni)
 * lo schermo è rimasto senza nessun cursore per 6,6-8,6 s in 10 corse su 10. Il segno di TALOS si spegne, l'aiutante si chiude al confine del passo e
 * riparte solo alla chiamata dopo; e anche quando riparte subito, cua disegna il suo cursore solo alla sua prima mossa (`cursor-overlay/src/lib.rs:204-210`,
 * posizione `None` finché un comando non la mette). La cura: al confine del passo, con un compito in corso, l'aiutante riparte SUBITO col suo cursore e
 * gli si manda `move_cursor` all'ultimo punto annunciato. `move_cursor` senza `scope:'desktop'` muove solo il cursore disegnato da cua, MAI il mouse vero
 * (`platform-windows/src/tools/move_cursor.rs:27`, «Does NOT move the real mouse cursor»; `:44` solo `scope:'desktop'` chiama SetCursorPos).
 * L'aiutante è finto (`fixtures/aiutante-mcp-finto.mjs`): nessuna prova tocca lo schermo né il mouse.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creaAiutanteMcp } from '../src/computer-use/aiutante-mcp.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { EVENTI } from '../src/computer-use/ciclo.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const FINTO = join(QUI, 'fixtures', 'aiutante-mcp-finto.mjs');
const IMPRONTA_FINTA = createHash('sha256').update(readFileSync(FINTO)).digest('hex');
const VARIABILE = 'TALOS_SEGNO_ACCESO';
/** Il termine del brief: il cursore dell'aiutante ripartito si disegna entro 500 ms, senza aspettare una mossa del compito. */
const ENTRO_MS = 500;

/** Un aiutante vero (`creaAiutanteMcp`) col figlio finto: ogni avvio e ogni riga scritta al figlio si contano, con l'ora. */
function banco({ segno = true } = {}) {
  const ambiente = { ...process.env, ...(segno ? { [VARIABILE]: '1' } : {}) };
  if (!segno) delete ambiente[VARIABILE];
  const avvii = []; const scritti = [];
  const avvia = (exe, args, opzioni) => {
    const f = spawn(process.execPath, [exe, ...args], opzioni);
    const n = avvii.push({ args, t: Date.now() });
    const scrivi = f.stdin.write.bind(f.stdin);
    f.stdin.write = (s, ...resto) => {
      for (const riga of String(s).split('\n')) if (riga.trim()) scritti.push({ n, t: Date.now(), m: JSON.parse(riga) });
      return scrivi(s, ...resto);
    };
    return f;
  };
  const a = creaAiutanteMcp({ exe: FINTO, improntaAttesa: IMPRONTA_FINTA, avvia, ambiente, registro: () => {} });
  const spegniSegno = () => { delete ambiente[VARIABILE]; a.segnoCambiato(); };
  const mosse = () => scritti.filter((s) => s.m.method === 'tools/call' && s.m.params?.name === 'move_cursor');
  const chiamate = () => scritti.filter((s) => s.m.method === 'tools/call').map((s) => ({ n: s.n, nome: s.m.params?.name, argomenti: s.m.params?.arguments }));
  return { a, ambiente, avvii, scritti, spegniSegno, mosse, chiamate };
}

/** Aspetta che `cond()` sia vera, al più `ms`; torna il suo ultimo valore. */
async function finché(cond, ms) {
  const fine = Date.now() + ms;
  for (;;) {
    const v = cond();
    if (v || Date.now() >= fine) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
}

test('CSUB-01 RED: il segno si spegne a compito in corso fra due passi lenti: l\'aiutante riparte col suo cursore e lo disegna all\'ultimo punto entro 500 ms, senza aspettare una mossa', async (t) => {
  const b = banco({ segno: true });
  t.after(() => b.a.chiudiPerSempre());
  assert.deepEqual(await b.a.apri(), { ok: true });
  const fine = b.a.compito();
  t.after(fine);
  assert.deepEqual(b.avvii.map((x) => x.args), [['mcp', '--no-overlay']], 'col segno acceso parte senza il suo cursore');
  await b.a.chiama('click', { x: 10, y: 10 });
  b.a.puntoNoto({ x: 640, y: 360 });
  const t0 = Date.now();
  b.spegniSegno(); // la pagina del segno è morta: nessuna chiamata in volo, il prossimo passo arriva fra 8 s
  const mossa = await finché(() => b.mosse()[0], 2_000);
  assert.ok(mossa, `nessun move_cursor entro 2 s: ${JSON.stringify(b.chiamate())}`);
  assert.ok(mossa.t - t0 <= ENTRO_MS, `move_cursor dopo ${mossa.t - t0} ms (termine ${ENTRO_MS})`);
  assert.deepEqual(b.avvii.map((x) => x.args), [['mcp', '--no-overlay'], ['mcp']], 'riparte una volta, col suo cursore');
  assert.equal(mossa.n, 2, 'la mossa va all\'aiutante ripartito, non a quello chiuso');
  assert.deepEqual(mossa.m.params.arguments, { x: 640, y: 360 }, 'all\'ultimo punto annunciato, e mai con scope desktop (il mouse vero non si muove)');
});

test('CSUB-02 RED: un aiutante che parte col suo cursore a compito in corso (il segno era già spento) disegna subito all\'ultimo punto noto', async (t) => {
  const b = banco({ segno: true });
  t.after(() => b.a.chiudiPerSempre());
  await b.a.apri();
  const fine = b.a.compito(); t.after(fine);
  b.a.puntoNoto({ x: 100, y: 200 });
  b.a.chiudi(); // l'aiutante è andato (processo uscito): il segno intanto si è spento
  delete b.ambiente[VARIABILE];
  const r = await b.a.apri();
  assert.deepEqual(r, { ok: true });
  const mossa = await finché(() => b.mosse()[0], 1_000);
  assert.ok(mossa, 'riaperto col suo cursore e un punto noto: la mossa parte senza aspettare il passo');
  assert.deepEqual(mossa.m.params.arguments, { x: 100, y: 200 });
});

test('CSUB-03 RED: la chiamata del passo che arriva durante la ripartenza la aspetta: un solo avvio nuovo, la mossa prima del clic', async (t) => {
  const b = banco({ segno: true });
  t.after(() => b.a.chiudiPerSempre());
  await b.a.apri();
  const fine = b.a.compito(); t.after(fine);
  b.a.puntoNoto({ x: 300, y: 400 });
  b.spegniSegno();
  const r = await b.a.chiama('click', { x: 301, y: 401 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(b.avvii.length, 2, `avvii: ${JSON.stringify(b.avvii.map((x) => x.args))}`);
  const sulNuovo = b.chiamate().filter((c) => c.n === 2).map((c) => c.nome);
  assert.deepEqual(sulNuovo, ['move_cursor', 'click'], 'il cursore c\'è prima del clic');
});

test('CSUB-04: senza compito in corso l\'aiutante chiuso non riparte da solo (riparte alla chiamata dopo, come prima) e un punto di un compito finito non si ridisegna', async (t) => {
  const b = banco({ segno: true });
  t.after(() => b.a.chiudiPerSempre());
  await b.a.apri();
  const fine = b.a.compito();
  b.a.puntoNoto({ x: 50, y: 60 });
  fine(); // il compito è finito: il suo punto non vale più
  b.spegniSegno();
  await new Promise((r) => setTimeout(r, ENTRO_MS + 100));
  assert.equal(b.avvii.length, 1, 'nessun aiutante riaperto senza un compito');
  const fine2 = b.a.compito(); t.after(fine2);
  await b.a.chiama('list_windows', {});
  assert.equal(b.avvii.length, 2);
  assert.equal(b.mosse().length, 0, 'nessuna mossa al punto del compito di prima');
});

test('CSUB-11: il compito dopo, senza un annuncio suo, riparte col cursore ma non lo porta al punto del compito finito', async (t) => {
  const b = banco({ segno: true });
  t.after(() => b.a.chiudiPerSempre());
  await b.a.apri();
  const fineA = b.a.compito();
  b.a.puntoNoto({ x: 70, y: 80 });
  fineA();
  const fineB = b.a.compito(); t.after(fineB);
  b.spegniSegno();
  const riaperto = await finché(() => b.avvii.length === 2, 2_000);
  assert.ok(riaperto, 'a compito in corso riparte subito col suo cursore');
  await new Promise((r) => setTimeout(r, ENTRO_MS));
  assert.equal(b.mosse().length, 0, 'nessuna mossa: il punto era del compito finito');
});

test('CSUB-05: un punto non valido non si manda mai (NaN, testo, infinito, mancante): niente move_cursor a caso', async (t) => {
  const b = banco({ segno: true });
  t.after(() => b.a.chiudiPerSempre());
  await b.a.apri();
  const fine = b.a.compito(); t.after(fine);
  b.a.puntoNoto({ x: 10, y: 20 });
  for (const p of [{ x: Number.NaN, y: 1 }, { x: '5', y: 6 }, { x: 1, y: Infinity }, null, undefined, {}]) b.a.puntoNoto(p);
  b.spegniSegno();
  const mossa = await finché(() => b.mosse()[0], 1_000);
  assert.ok(mossa);
  assert.deepEqual(mossa.m.params.arguments, { x: 10, y: 20 }, 'resta l\'ultimo punto VALIDO');
});

test('CSUB-09: il punto si arrotonda ai pixel interi (cua li vuole interi) e un punto con una sola coordinata cattiva non cancella il buono', async (t) => {
  const b = banco({ segno: true });
  t.after(() => b.a.chiudiPerSempre());
  await b.a.apri();
  const fine = b.a.compito(); t.after(fine);
  b.a.puntoNoto({ x: 100.6, y: 200.4 });
  b.a.puntoNoto({ x: 7, y: Number.NaN });
  b.spegniSegno();
  const mossa = await finché(() => b.mosse()[0], 1_000);
  assert.ok(mossa);
  assert.deepEqual(mossa.m.params.arguments, { x: 101, y: 200 });
});

test('CSUB-06: col segno ancora acceso nessuna mossa e nessun avvio in più (il cursore dell\'aiutante resta spento: mai due cursori)', async (t) => {
  const b = banco({ segno: true });
  t.after(() => b.a.chiudiPerSempre());
  await b.a.apri();
  const fine = b.a.compito(); t.after(fine);
  b.a.puntoNoto({ x: 10, y: 20 });
  b.a.segnoCambiato(); // il guscio ridice «acceso»
  await new Promise((r) => setTimeout(r, ENTRO_MS + 100));
  assert.equal(b.avvii.length, 1);
  assert.equal(b.mosse().length, 0);
});

/* ---------- il punto arriva dall'ospite: l'annuncio del ciclo (decisione 252) dice dove va il cursore, in pixel fisici globali ---------- */
function png(w, h) {
  const x = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(x, 0);
  x.writeUInt32BE(13, 8); x.write('IHDR', 12, 'ascii'); x.writeUInt32BE(w, 16); x.writeUInt32BE(h, 20);
  return x;
}
const DESKTOP = { window_id: 65562, pid: 4321, app_name: 'explorer.exe', title: 'Program Manager', bounds: { x: 0, y: 0, width: 1600, height: 900 },
  z_index: 1, is_on_screen: true, minimized: false };

test('CSUB-07 RED: l\'ospite passa all\'aiutante il punto di ogni annuncio del cursore (lo stesso che riceve il segno di TALOS)', async () => {
  const punti = [];
  const aiutante = { async apri() { return { ok: true }; }, compito() { return () => {}; }, puntoNoto(p) { punti.push(p); },
    async chiama(nome) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [DESKTOP] }, immagine: null, errore: null };
      if (nome === 'get_window_state') {
        return { ok: true, dati: { window_id: DESKTOP.window_id, pid: DESKTOP.pid, window_title: DESKTOP.title, app_name: DESKTOP.app_name,
          window_bounds: DESKTOP.bounds, screenshot_width: 1600, screenshot_height: 900, elements: null, tree_markdown: null },
        immagine: { base64: png(1600, 900).toString('base64'), mime: 'image/png' }, errore: null };
      }
      return { ok: true, dati: {}, immagine: null, errore: null };
    } };
  const eventi = []; let n = 0;
  const risposte = [{ actions: [{ type: 'click', x: 60, y: 50 }] }, { done: { success: true, note: 'ok' } }];
  const sessione = { testoDellaPersona: 'premi',
    chiediModello: async () => { const x = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(x), usage: null }; },
    chiediDomanda: async (q) => ({ status: 'answered', answers: { [q[0].id]: q[0].options[0].label } }),
    emetti: (nome, dati) => { eventi.push({ nome, dati }); } };
  await creaOspiteComputerUse({ aiutante })(NOME_COMPUTER_USE, { task: 'press' },
    { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: 'accesso-pieno', sessione });
  const annunci = eventi.filter((e) => e.nome === EVENTI.annuncio).map((e) => e.dati.punto);
  assert.ok(annunci.length >= 1, 'il ciclo ha annunciato il cursore');
  assert.deepEqual(punti, annunci, 'ogni punto annunciato arriva all\'aiutante, nello stesso ordine');
});

test('CSUB-10: due clic in due punti: all\'aiutante arrivano solo i punti degli annunci, l\'ultimo per ultimo', async () => {
  const punti = [];
  const aiutante = { async apri() { return { ok: true }; }, compito() { return () => {}; }, puntoNoto(p) { punti.push(p); },
    async chiama(nome) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [DESKTOP] }, immagine: null, errore: null };
      if (nome === 'get_window_state') {
        return { ok: true, dati: { window_id: DESKTOP.window_id, pid: DESKTOP.pid, window_title: DESKTOP.title, app_name: DESKTOP.app_name,
          window_bounds: DESKTOP.bounds, screenshot_width: 1600, screenshot_height: 900, elements: null, tree_markdown: null },
        immagine: { base64: png(1600, 900).toString('base64'), mime: 'image/png' }, errore: null };
      }
      return { ok: true, dati: {}, immagine: null, errore: null };
    } };
  const eventi = []; let n = 0;
  const risposte = [{ actions: [{ type: 'click', x: 60, y: 50 }] }, { actions: [{ type: 'click', x: 400, y: 300 }] }, { done: { success: true, note: 'ok' } }];
  const sessione = { testoDellaPersona: 'premi due volte',
    chiediModello: async () => { const x = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(x), usage: null }; },
    chiediDomanda: async (q) => ({ status: 'answered', answers: { [q[0].id]: q[0].options[0].label } }),
    emetti: (nome, dati) => { eventi.push({ nome, dati }); } };
  await creaOspiteComputerUse({ aiutante })(NOME_COMPUTER_USE, { task: 'press twice' },
    { fase: 'esegui', toolCallId: 'c2', segnale: new AbortController().signal, livelloAccesso: 'accesso-pieno', sessione });
  const annunci = eventi.filter((e) => e.nome === EVENTI.annuncio).map((e) => e.dati.punto);
  assert.ok(annunci.length >= 2, `due annunci, uno per clic (${annunci.length})`);
  assert.equal(punti.length, annunci.length, 'nessun punto da altri eventi');
  assert.deepEqual(punti.at(-1), annunci.at(-1));
  assert.notDeepEqual(punti[0], punti.at(-1), 'due punti diversi');
});

test('CSUB-08: un aiutante senza `puntoNoto` (la CLI, un aiutante finto vecchio) non rompe il compito', async () => {
  const aiutante = { async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(nome) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [DESKTOP] }, immagine: null, errore: null };
      if (nome === 'get_window_state') {
        return { ok: true, dati: { window_id: DESKTOP.window_id, pid: DESKTOP.pid, window_title: DESKTOP.title, app_name: DESKTOP.app_name,
          window_bounds: DESKTOP.bounds, screenshot_width: 1600, screenshot_height: 900, elements: null, tree_markdown: null },
        immagine: { base64: png(1600, 900).toString('base64'), mime: 'image/png' }, errore: null };
      }
      return { ok: true, dati: {}, immagine: null, errore: null };
    } };
  let n = 0;
  const risposte = [{ actions: [{ type: 'click', x: 60, y: 50 }] }, { done: { success: true, note: 'ok' } }];
  const sessione = { testoDellaPersona: 'premi',
    chiediModello: async () => { const x = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(x), usage: null }; },
    chiediDomanda: async (q) => ({ status: 'answered', answers: { [q[0].id]: q[0].options[0].label } }), emetti: () => {} };
  const esito = await creaOspiteComputerUse({ aiutante })(NOME_COMPUTER_USE, { task: 'press' },
    { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: 'accesso-pieno', sessione });
  assert.equal(esito.ok, true, JSON.stringify(esito));
});
