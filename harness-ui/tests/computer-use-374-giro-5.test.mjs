/*
 * ⛔ Decisione 374, giro 5 (decisione 396 dell'owner, 08/11/2026: «Giro 5, ultimo»): le sonde ROSSE della revisione del giro 4 diventano
 * prove. A1 (V1-V3, V7), A2 (S1-S3), B1 (scritture del portachiavi), C1 (X14, X1c/X1d), C2 (X9D, C2c), più i vivi del giro 4 (B05/B06 come
 * instradamento dell'avviso, B15, B16/B17, B22) e il basso C3 (scrivi in Accesso completo come la shell). Sulla testa 3c4d0898d sono rosse.
 * Decisione 390 («Non toccare nulla»): in Accesso completo la 374 non fa niente di suo; decisione 375: niente carte, fermate o avvisi in più.
 * Concorrenti: hermes-agent tools/approval.py:54 (`_session_yolo` è PER SESSIONE: il yolo di una sessione non approva per le altre) e
 * :1116 (`if _yolo_active(): return _approved()`, solo per la sessione corrente); codex permissions.rs:2057 (`DangerFullAccess` ⇒
 * `unrestricted()`, per il solo turno che lo ha); claude-code CHANGELOG.md:4439 (i messaggi verso una sessione coi permessi aggirati si
 * tengono per l'approvazione: il bypass di una non vale per le altre). Ricerca web 08/11/2026: la guida di sicurezza di Hermes
 * (hermes-agent.nousresearch.com/docs/user-guide/security) dice che il /yolo del gateway vale solo per la sessione attiva.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { creaImpostazioneComputerUse } from '../src/computer-use/impostazione.mjs';
import { creaRegistroLuoghi } from '../src/computer-use/luoghi-ricordati.mjs';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import * as cm from '../src/computer-use/file-approvati.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { creaCustodeFileComputerUse, EVENTO_FILE_COMPUTER_USE_RIPRISTINATI: EVENTO, SERVIZIO_IMPRONTE_COMPUTER_USE: SERVIZIO, accountDelleImpronte } = cm;
const APPROVATA = '{"schema":"talos.computer-use-settings.v1","acceso":false}\n';
const ACCESA = '{"schema":"talos.computer-use-settings.v1","acceso":true}\n';
const LUOGHI = '{"versione":1,"voci":[{"tipo":"dominio","nome":"example.com","quando":"2026-11-07T10:00:00.000Z"}]}\n';
const LUOGHI_ESTRANEI = '{"versione":1,"voci":[{"tipo":"app","nome":"cmd.exe","quando":"2026-11-08T10:00:00.000Z"}]}\n';
const IMP = '.computer-use-impostazione.json';
const LUO = '.computer-use-luoghi.json';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const muto = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };
const mutoSinc = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

/** `approva: true` ⇒ i file nascono dalla porta approvata; `false` ⇒ sono sul disco e la voce manca (aggiornamento). `scritture` conta i `set`. */
async function banco({ impostazione = APPROVATA, luoghi = LUOGHI, portachiavi, approva = true } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-374g5-'));
  const fi = join(cartella, IMP);
  const fl = join(cartella, LUO);
  const mem = creaAdattatorePortachiaviInMemoria();
  const scritture = [];
  const pk = portachiavi === undefined ? { get: (s, a) => mem.get(s, a), set: (s, a, v) => { scritture.push(v); return mem.set(s, a, v); }, remove: (s, a) => mem.remove(s, a) } : portachiavi;
  const nuovo = () => mutoSinc(() => creaCustodeFileComputerUse({ file: [fi, fl], portachiavi: pk }));
  let custode = null;
  if (approva) {
    custode = nuovo();
    await muto(async () => { if (impostazione !== null) await custode.scrivi(fi, impostazione); if (luoghi !== null) await custode.scrivi(fl, luoghi); });
  } else {
    if (impostazione !== null) writeFileSync(fi, impostazione);
    if (luoghi !== null) writeFileSync(fl, luoghi);
  }
  const copie = (nome = IMP) => readdirSync(cartella).filter((f) => f.startsWith(`${nome}.changed-`));
  const acceso = (c) => creaImpostazioneComputerUse({ file: fi, custode: c, avvisa: () => {} }).acceso();
  const app = async (c) => (await creaRegistroLuoghi({ file: fl, custode: c }).perIlCiclo()).app;
  return { cartella, fi, fl, pk, scritture, custode, nuovo, copie, acceso, app, chiudi: () => rimuoviCartellaDiProva(cartella) };
}

/** Una conversazione vera del registro, con `pre` e `post` separati (due conversazioni si intrecciano) e le carte accettate. */
function sessione(custode, permessiScelto = 'On request') {
  let input = null;
  let risolvi;
  let chiusa = false;
  const fine = new Promise((r) => { risolvi = r; });
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return fine; },
    preparaEsecuzioneFn: (taskId) => ({ cartella: tmpdir(), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    modello: 'm', chiave: 'k', caricaHooksFn: async () => ({ hooks: [] }),
    ...(custode ? { custodeFileComputerUse: custode } : {}),
    registraRigaFn: async () => true,
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto });
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  const s = {
    async pre(azione, argomenti = azione === 'shell' ? { comando: 'git status' } : {}) {
      const prima = ricevuti.length;
      const p = input.hookFn({ tipo: 'pre_tool_call', azione, argomenti, giro: 0 });
      await pausa(5);
      const carta = ricevuti.slice(prima).find((e) => e.type === 'ApprovalRequested');
      if (carta) registro.rispondiApprovazione(sessionId, carta.requestId, true);
      return p;
    },
    post: (azione = 'shell') => input.hookFn({ tipo: 'post_tool_call', azione, esito: 'ok', giro: 0 }),
    async attrezzo(azione, argomenti, durante) { const esito = await s.pre(azione, argomenti); if (esito?.consentito !== false) await durante?.(); await s.post(azione); return esito; },
    carte: () => ricevuti.filter((e) => e.type === 'ApprovalRequested').length,
    avvisi: () => ricevuti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO),
    chiudi: () => { if (chiusa) return; chiusa = true; input?.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); },
  };
  return s;
}

/* ——— A1 ALTO: in Accesso completo la fine di un comando non approva ciò che un'ALTRA conversazione fuori dall'Accesso completo scrive ——— */

async function incrocio(passi) {
  const b = await banco();
  const B = sessione(b.custode, 'On request');
  const A = sessione(b.custode, 'Full access');
  try {
    await muto(() => passi(b, A, B));
    return { A, B, copie: b.copie().length + b.copie(LUO).length, approvato: [b.custode.testo(b.fi), b.custode.testo(b.fl)], riavvio: mutoSinc(() => { const r = b.nuovo(); return [r.testo(b.fi), r.testo(b.fl)]; }), disco: [readFileSync(b.fi, 'utf8'), readFileSync(b.fl, 'utf8')] };
  } finally { A.chiudi(); B.chiudi(); b.chiudi(); }
}

test('374 g5 A1 (V1) B su richiesta scrive l impostazione, A in Accesso completo finisce prima: rimessa, 1 avviso a B, 0 ad A', { timeout: 10_000 }, async () => {
  const r = await incrocio(async (b, A, B) => { await B.pre('shell', { comando: 'node configura.mjs' }); await A.pre('shell'); writeFileSync(b.fi, ACCESA); await A.post(); await B.post(); });
  assert.deepEqual(r.approvato, [APPROVATA, LUOGHI], 'non adottato');
  assert.deepEqual(r.riavvio, [APPROVATA, LUOGHI], 'e non adottato al riavvio');
  assert.deepEqual(r.disco, [APPROVATA, LUOGHI], 'rimesso sul disco');
  assert.deepEqual([r.A.avvisi().length, r.B.avvisi().length, r.A.carte() + r.B.carte(), r.copie], [0, 1, 0, 1], 'l avviso solo a chi è fuori dall Accesso completo');
});

test('374 g5 A1 (V2) B su richiesta scrive i luoghi, A in Accesso completo con `prova` finisce prima: rimessi, cmd.exe non entra', { timeout: 10_000 }, async () => {
  const r = await incrocio(async (b, A, B) => { await B.pre('shell', { comando: 'node configura.mjs' }); await A.pre('prova'); writeFileSync(b.fl, LUOGHI_ESTRANEI); await A.post('prova'); await B.post(); });
  assert.deepEqual(r.approvato, [APPROVATA, LUOGHI]);
  assert.deepEqual(r.riavvio, [APPROVATA, LUOGHI]);
  assert.deepEqual([r.A.avvisi().length, r.B.avvisi().length], [0, 1]);
});

test('374 g5 A1 (V3) B riscrive in ciclo; il prima di A rimette, il dopo di A non adotta: l avviso va a B, uno', { timeout: 10_000 }, async () => {
  const r = await incrocio(async (b, A, B) => {
    await B.pre('shell', { comando: 'node ciclo.mjs' });
    writeFileSync(b.fi, ACCESA); await A.pre('shell');
    writeFileSync(b.fi, ACCESA); await A.post(); await B.post();
  });
  assert.deepEqual(r.approvato, [APPROVATA, LUOGHI]);
  assert.deepEqual(r.riavvio, [APPROVATA, LUOGHI]);
  assert.deepEqual([r.A.avvisi().length, r.B.avvisi().length], [0, 1]);
});

test('374 g5 A1 (V7, decisione 390) A da sola in Accesso completo scrive: adottato, 0 avvisi, 0 copie', { timeout: 10_000 }, async () => {
  const r = await incrocio(async (b, A) => { await A.pre('shell', { comando: 'node configura.mjs' }); writeFileSync(b.fi, ACCESA); await A.post(); });
  assert.deepEqual(r.approvato, [ACCESA, LUOGHI]);
  assert.deepEqual(r.riavvio, [ACCESA, LUOGHI]);
  assert.deepEqual([r.A.avvisi().length, r.B.avvisi().length, r.copie], [0, 0, 0]);
});

test('374 g5 A1 un altra conversazione in Accesso completo non conta come «altra»: due in Accesso completo, una scrive, adottato', { timeout: 10_000 }, async () => {
  const b = await banco();
  const A = sessione(b.custode, 'Full access');
  const C = sessione(b.custode, 'Full access');
  try {
    await muto(async () => { await C.pre('shell', { comando: 'npm run dev' }); await A.pre('shell', { comando: 'node configura.mjs' }); writeFileSync(b.fi, ACCESA); await A.post(); await C.post(); });
    assert.equal(b.custode.testo(b.fi), ACCESA);
    assert.deepEqual([A.avvisi().length, C.avvisi().length, b.copie().length], [0, 0, 0]);
  } finally { A.chiudi(); C.chiudi(); b.chiudi(); }
});

/* ——— A2 MEDIO: uno stato chiuso non si riapre al primo comando in Accesso completo ——— */

const voceStorta = async (b) => { b.pk.set(SERVIZIO, accountDelleImpronte([b.fi, b.fl]), 'v1:zz'); const cu = b.nuovo(); await muto(() => cu.avvia()); return cu; };
const AGGIORNAMENTO = { impostazione: ACCESA, luoghi: LUOGHI_ESTRANEI, approva: false };

test('374 g5 A2 (S1) voce del portachiavi storta: `git status` e `prova` in Accesso completo non la riaprono, neanche al riavvio', { timeout: 10_000 }, async () => {
  for (const [azione, permessi] of [['shell', 'Full access'], ['prova', 'Full access'], ['shell', 'On request']]) {
    const b = await banco(AGGIORNAMENTO);
    try {
      const cu = await voceStorta(b);
      assert.deepEqual([b.acceso(cu), await b.app(cu)], [false, []], 'chiuso prima');
      const A = sessione(cu, permessi);
      await muto(() => A.attrezzo(azione, azione === 'shell' ? { comando: 'git status' } : {}));
      A.chiudi();
      assert.deepEqual([b.acceso(cu), await b.app(cu)], [false, []], `${azione} in ${permessi}: resta spento`);
      const r = b.nuovo(); await muto(() => r.avvia());
      assert.deepEqual([b.acceso(r), await b.app(r)], [false, []], `${azione} in ${permessi}: spento anche al riavvio`);
    } finally { b.chiudi(); }
  }
});

test('374 g5 A2 (S2) portachiavi che non si legge, file cambiati a TALOS chiuso: un comando in Accesso completo non li adotta', { timeout: 10_000 }, async () => {
  const mem = creaAdattatorePortachiaviInMemoria();
  let rotto = false;
  const err = () => Object.assign(new Error('rotto'), { code: 'GenericFailure' });
  const pk = { get: (s, a) => { if (rotto) throw err(); return mem.get(s, a); }, set: (s, a, v) => { if (rotto) throw err(); mem.set(s, a, v); }, remove: (s, a) => mem.remove(s, a) };
  const b = await banco({ portachiavi: pk });
  try {
    writeFileSync(b.fi, ACCESA); writeFileSync(b.fl, LUOGHI_ESTRANEI);
    rotto = true;
    const cu = b.nuovo(); await muto(() => cu.avvia());
    assert.equal(b.acceso(cu), false);
    const A = sessione(cu, 'Full access');
    await muto(() => A.attrezzo('shell', { comando: 'git status' }));
    A.chiudi();
    assert.deepEqual([b.acceso(cu), await b.app(cu)], [false, []], 'resta spento, cmd.exe non entra');
  } finally { b.chiudi(); }
});

test('374 g5 A2 (S3) senza portachiavi coi file presenti: un comando in Accesso completo non li riapre', { timeout: 10_000 }, async () => {
  const b = await banco({ ...AGGIORNAMENTO, portachiavi: null });
  try {
    const cu = b.nuovo(); await muto(() => cu.avvia());
    assert.deepEqual([b.acceso(cu), await b.app(cu)], [false, []], 'chiuso prima');
    const A = sessione(cu, 'Full access');
    await muto(() => A.attrezzo('shell', { comando: 'git status' }));
    A.chiudi();
    assert.deepEqual([b.acceso(cu), await b.app(cu)], [false, []]);
  } finally { b.chiudi(); }
});

test('374 g5 A2 una scrittura esplicita (`scrivi`) in Accesso completo su un file chiuso lo adotta ancora; l altro resta chiuso', { timeout: 10_000 }, async () => {
  const b = await banco(AGGIORNAMENTO);
  try {
    const cu = await voceStorta(b);
    const A = sessione(cu, 'Full access');
    await muto(() => A.attrezzo('scrivi', { percorso: b.fi }, () => writeFileSync(b.fi, ACCESA)));
    A.chiudi();
    assert.equal(b.acceso(cu), true, 'il file scritto per percorso diventa l approvato');
    assert.deepEqual(await b.app(cu), [], 'l altro file, chiuso, resta chiuso');
  } finally { b.chiudi(); }
});

/* ——— B1 MEDIO: il portachiavi si scrive solo quando l'impronta cambia ——— */

test('374 g5 B1 venti comandi in Accesso completo senza cambi: 0 scritture nel portachiavi (shell e prova); un cambio vero: 1', { timeout: 20_000 }, async () => {
  for (const [azione, cambiaAl, attese] of [['shell', -1, 0], ['prova', -1, 0], ['shell', 5, 1]]) {
    const b = await banco({ impostazione: ACCESA });
    const A = sessione(b.custode, 'Full access');
    try {
      const prima = b.scritture.length;
      for (let i = 0; i < 20; i += 1) await muto(() => A.attrezzo(azione, azione === 'shell' ? { comando: 'git status' } : {}, i === cambiaAl ? () => writeFileSync(b.fl, LUOGHI_ESTRANEI) : undefined));
      assert.equal(b.scritture.length - prima, attese, `${azione}, cambio al giro ${cambiaAl}`);
      assert.equal(A.avvisi().length, 0);
    } finally { A.chiudi(); b.chiudi(); }
  }
});

test('374 g5 B1 `adotta` sullo stesso contenuto non riscrive la voce; su un contenuto nuovo sì', async () => {
  const b = await banco();
  try {
    const prima = b.scritture.length;
    await muto(() => b.custode.adotta([b.fi, b.fl]));
    await muto(() => b.custode.adotta(null));
    assert.equal(b.scritture.length, prima);
    writeFileSync(b.fi, ACCESA);
    await muto(() => b.custode.adotta([b.fi]));
    assert.equal(b.scritture.length, prima + 1);
  } finally { b.chiudi(); }
});

/* ——— C1 MEDIO: in Accesso completo la conversazione non conta come «comando in corso» ——— */

test('374 g5 C1 (X14) A in Accesso completo con un comando lungo, cambio a mano, B su richiesta lancia un comando: l avviso a B, 0 ad A', { timeout: 10_000 }, async () => {
  const b = await banco();
  const A = sessione(b.custode, 'Full access');
  const B = sessione(b.custode, 'On request');
  try {
    await muto(async () => {
      await A.pre('shell', { comando: 'npm run dev' });
      writeFileSync(b.fl, LUOGHI_ESTRANEI);
      await B.attrezzo('shell', { comando: 'git status' });
    });
    assert.deepEqual([B.avvisi().length, A.avvisi().length, b.copie(LUO).length], [1, 0, 1], 'B vede la riga subito');
    assert.equal(readFileSync(b.fl, 'utf8'), LUOGHI, 'rimessi');
    await muto(() => A.post());
    assert.equal(A.avvisi().length, 0, 'e niente alla fine del comando di A');
  } finally { A.chiudi(); B.chiudi(); b.chiudi(); }
});

test('374 g5 C1 (X1c, X1d: limite X1) A in Accesso completo cambia, B fa un comando intero durante: avviso a B, 0 ad A, la copia resta', { timeout: 10_000 }, async () => {
  const b = await banco();
  const A = sessione(b.custode, 'Full access');
  const B = sessione(b.custode, 'On request');
  try {
    await muto(() => A.attrezzo('shell', { comando: 'node scripts/abilita.mjs' }, async () => { writeFileSync(b.fi, ACCESA); await B.attrezzo('shell', { comando: 'npm test' }); }));
    assert.deepEqual([A.avvisi().length, B.avvisi().length], [0, 1]);
    assert.equal(b.acceso(b.custode), false, 'limite X1: il cambio di A torna indietro');
    assert.equal(b.copie().length, 1, 'ma è tenuto accanto');
    assert.equal(readFileSync(join(b.cartella, b.copie()[0]), 'utf8'), ACCESA);
  } finally { A.chiudi(); B.chiudi(); b.chiudi(); }
});

/* ——— i vivi del giro 4: B05/B06 (a chi va e quando esce l'avviso), B15, B16/B17, B22 ——— */

test('374 g5 (B05 B06) il controllo di C trova un cambio mentre B ha un comando: l avviso va a B, e solo alla fine del suo comando', { timeout: 10_000 }, async () => {
  const b = await banco();
  const B = sessione(b.custode, 'On request');
  const C = sessione(b.custode, 'On request');
  try {
    await muto(async () => {
      await B.pre('shell', { comando: 'node lungo.mjs' });
      writeFileSync(b.fl, LUOGHI_ESTRANEI);
      await C.pre('shell');
      assert.deepEqual([B.avvisi().length, C.avvisi().length], [0, 0], 'tenuto finché il comando di B non finisce');
      await B.post();
      assert.deepEqual([B.avvisi().length, C.avvisi().length], [1, 0], 'esce in B');
      await C.post();
    });
    assert.equal(C.avvisi().length, 0);
  } finally { B.chiudi(); C.chiudi(); b.chiudi(); }
});

test('374 g5 (B15) carta 373 accettata per un file, l altro cambia durante: rimesso con la copia E con l avviso', { timeout: 10_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, 'On request');
  try {
    await muto(() => s.attrezzo('shell', { comando: `type ${b.fi}` }, () => writeFileSync(b.fl, LUOGHI_ESTRANEI)));
    assert.equal(s.carte(), 1);
    assert.deepEqual([b.copie(LUO).length, s.avvisi().length], [1, 1]);
    assert.equal(s.avvisi()[0].value.testoChiave, 'server.computerUseFiles.putBackKept');
  } finally { s.chiudi(); b.chiudi(); }
});

test('374 g5 (B16 B17) le frasi inglesi del server, parola per parola: rimesso con copia, e rimesso senza copia', { timeout: 10_000 }, async () => {
  const b = await banco();
  const s = sessione(b.custode, 'On request');
  const t = sessione(b.custode, 'On request');
  try {
    await muto(() => s.attrezzo('shell', { comando: 'node a.mjs' }, () => writeFileSync(b.fi, ACCESA)));
    const [conCopia] = s.avvisi();
    assert.equal(conCopia.value.testoChiave, 'server.computerUseFiles.putBackKept');
    assert.equal(conCopia.value.testo, `TALOS put back the computer use settings (${IMP}) because they no longer matched the approved version. The changed version is kept next to it (${conCopia.value.copie[0]}): if you changed it yourself, it is there.`);
    await muto(() => t.attrezzo('shell', { comando: 'node b.mjs' }, () => unlinkSync(b.fl)));
    const [senzaCopia] = t.avvisi();
    assert.equal(senzaCopia.value.testoChiave, 'server.computerUseFiles.putBack');
    assert.equal(senzaCopia.value.testo, `TALOS put back the computer use settings (${LUO}) because they no longer matched the approved version.`);
  } finally { s.chiudi(); t.chiudi(); b.chiudi(); }
});

test('374 g5 (B22) senza custode un comando di shell o una prova non lancia, in ogni modo', { timeout: 10_000 }, async () => {
  for (const permessi of ['On request', 'Full access']) {
    const s = sessione(null, permessi);
    try {
      for (const azione of ['shell', 'prova']) {
        const esito = await s.pre(azione);
        assert.notEqual(esito?.consentito, false, `${azione} in ${permessi}`);
        await s.post(azione);
      }
      assert.equal(s.avvisi().length, 0);
    } finally { s.chiudi(); }
  }
});

/* ——— C3 (basso): in Accesso completo `scrivi` fa come la shell (decisione 390) ——— */

test('374 g5 C3 `scrivi` in Accesso completo, l altro file cambia durante: adottato come la shell, 0 avvisi, 0 copie', { timeout: 10_000 }, async () => {
  const b = await banco();
  const A = sessione(b.custode, 'Full access');
  try {
    await muto(() => A.attrezzo('scrivi', { percorso: b.fi }, () => { writeFileSync(b.fi, ACCESA); writeFileSync(b.fl, LUOGHI_ESTRANEI); }));
    assert.deepEqual([b.custode.testo(b.fi), b.custode.testo(b.fl)], [ACCESA, LUOGHI_ESTRANEI]);
    assert.deepEqual([A.avvisi().length, b.copie(LUO).length], [0, 0]);
  } finally { A.chiudi(); b.chiudi(); }
});

test('374 g5 C3 `scrivi` in Accesso completo con B su richiesta in corso: il file scritto si adotta, l altro torna e l avviso va a B', { timeout: 10_000 }, async () => {
  const b = await banco();
  const A = sessione(b.custode, 'Full access');
  const B = sessione(b.custode, 'On request');
  try {
    await muto(async () => {
      await B.pre('shell', { comando: 'node configura.mjs' });
      await A.attrezzo('scrivi', { percorso: b.fi }, () => { writeFileSync(b.fi, ACCESA); writeFileSync(b.fl, LUOGHI_ESTRANEI); });
      await B.post();
    });
    assert.deepEqual([b.custode.testo(b.fi), b.custode.testo(b.fl)], [ACCESA, LUOGHI]);
    assert.deepEqual([A.avvisi().length, B.avvisi().length], [0, 1]);
  } finally { A.chiudi(); B.chiudi(); b.chiudi(); }
});

/* ——— C2 MEDIO: «stays off» solo se l'impostazione è stata messa da parte E il computer use è ancora spento ——— */

const chiaviDi = (avvisi) => [...new Set(avvisi.flatMap((e) => (e.value.altreChiavi ?? []).map((a) => a.chiave.split('.').pop())))];

test('374 g5 C2 (X9D) aggiornamento, la persona riaccende prima del primo comando: la riga non dice «stays off»; senza riaccendere sì', { timeout: 10_000 }, async () => {
  for (const [riaccende, chiave, spento] of [[true, 'movedAsideAtStart', false], [false, 'setAsideAtStart', true]]) {
    for (const permessi of ['On request', 'Full access']) {
      const b = await banco(AGGIORNAMENTO);
      try {
        const cu = b.nuovo(); await muto(() => cu.avvia());
        if (riaccende) await muto(() => creaImpostazioneComputerUse({ file: b.fi, custode: cu, avvisa: () => {} }).scrivi({ acceso: true }));
        const A = sessione(cu, permessi);
        await muto(() => A.attrezzo('shell', { comando: 'npm test' }));
        A.chiudi();
        const av = A.avvisi();
        assert.equal(av.length, 1, `${permessi} riaccende=${riaccende}`);
        assert.deepEqual(chiaviDi(av), [chiave]);
        assert.equal(/stays off/u.test(av[0].value.testo), spento, `«stays off» ${spento ? 'detto' : 'non detto'}`);
        assert.equal(b.acceso(cu), riaccende);
      } finally { b.chiudi(); }
    }
  }
});

test('374 g5 C2 (C2c) acceso, solo i luoghi cambiati a TALOS chiuso: al riavvio la riga non dice «stays off»', { timeout: 10_000 }, async () => {
  for (const permessi of ['On request', 'Full access']) {
    const b = await banco({ impostazione: ACCESA });
    try {
      writeFileSync(b.fl, LUOGHI_ESTRANEI);
      const cu = b.nuovo(); await muto(() => cu.avvia());
      assert.equal(b.acceso(cu), true);
      const A = sessione(cu, permessi);
      await muto(() => A.attrezzo('shell', { comando: 'npm test' }));
      A.chiudi();
      const av = A.avvisi();
      assert.equal(av.length, 1);
      assert.deepEqual(chiaviDi(av), ['movedAsideAtStart']);
      const { copies } = av[0].value.altreChiavi[0].params;
      assert.equal(av[0].value.testo, `When TALOS started, the computer use settings (${LUO}) did not match the approved version: the changed version was moved aside (${copies}).`);
      assert.equal(b.acceso(cu), true);
    } finally { b.chiudi(); }
  }
});

test('374 g5 C2 le chiavi nuove esistono in inglese e in italiano, nel server e nella chat, senza «stays off»', () => {
  const server = readFileSync(new URL('../frontend/src/i18n/testi/server.js', import.meta.url), 'utf8');
  const chat = readFileSync(new URL('../frontend/src/i18n/testi/chat.js', import.meta.url), 'utf8');
  const righe = (testo, chiave) => testo.split('\n').filter((r) => r.includes(`'${chiave}'`));
  assert.equal(righe(server, 'computerUseFiles.movedAsideAtStart').length, 2);
  assert.equal(righe(chat, 'computerUseFiles.detailsMovedAtStart').length, 2);
  for (const r of [...righe(server, 'computerUseFiles.movedAsideAtStart'), ...righe(chat, 'computerUseFiles.detailsMovedAtStart')]) assert.doesNotMatch(r, /stays off|resta spento/u);
});

/* Giro 5 (mutanti G20, G21): se fra l'adozione rifiutata e il controllo l'altra conversazione ha finito il suo comando, l'avviso va
   a lei (la «riserva» presa dall'adozione), mai alla conversazione in Accesso completo. Il custode vero, con chiHaUnComando vuoto e
   adotta che risponde «c'era un altro comando» (la finestra fra le due code, forzata). */
test('374 g5 A1 riserva: l altra conversazione ha appena finito, l avviso va a lei e non ad A in Accesso completo', { timeout: 10_000 }, async () => {
  const b = await banco();
  const riserva = [];
  const altra = (esito) => riserva.push(esito);
  const finto = { ...b.custode, chiHaUnComando: () => [], adotta: (soli, opzioni) => (opzioni?.seNessunAltro ? Promise.resolve({ errori: [], inVolo: [altra] }) : b.custode.adotta(soli, opzioni)) };
  const A = sessione(finto, 'Full access');
  try {
    await muto(() => A.attrezzo('shell', { comando: 'git status' }, () => writeFileSync(b.fi, ACCESA)));
    assert.equal(A.avvisi().length, 0, 'mai ad A');
    assert.equal(riserva.filter((e) => e?.file?.length > 0 || e?.rimessi?.length > 0 || JSON.stringify(e).includes(IMP)).length, 1, 'una volta all altra conversazione');
    assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA, 'rimessa');
    assert.equal(b.copie().length, 1);
  } finally { A.chiudi(); b.chiudi(); }
});

/* Giro 5 (mutanti G03, G19): quando l'adozione in Accesso completo è rifiutata perché B ha un comando in corso, il controllo si fa
   SUBITO alla fine del comando di A, non alla fine di quello di B: se B ha una carta 373 per lo stesso file, alla sua fine
   adotterebbe il cambio di A (che così entrerebbe dalla porta di B). */
test('374 g5 A1 il cambio di A torna alla fine del comando di A, non di B: la carta 373 di B non lo adotta', { timeout: 10_000 }, async () => {
  const b = await banco();
  const B = sessione(b.custode, 'On request');
  const A = sessione(b.custode, 'Full access');
  try {
    await muto(async () => {
      await B.pre('shell', { comando: `node configura.mjs ${IMP}` });
      assert.equal(B.carte(), 1, 'la carta 373 di B, accettata');
      await A.pre('shell', { comando: 'node altro.mjs' });
      writeFileSync(b.fi, ACCESA);
      await A.post();
      assert.equal(readFileSync(b.fi, 'utf8'), APPROVATA, 'rimessa alla fine del comando di A');
      assert.equal(b.copie().length, 1);
      assert.equal(B.avvisi().length, 0, 'tenuto fino alla fine del comando di B');
      await B.post();
    });
    assert.equal(b.custode.testo(b.fi), APPROVATA, 'la fine di B non adotta il cambio di A');
    assert.deepEqual([A.avvisi().length, B.avvisi().length, A.carte()], [0, 1, 0]);
  } finally { A.chiudi(); B.chiudi(); b.chiudi(); }
});

/* Giro 5 (mutante G24): «stays off» solo se a essere messa da parte è l'impostazione. Spento dalla persona, e cambiati a TALOS chiuso
   solo i luoghi: la riga dice che i luoghi sono stati messi da parte, non che il computer use «resta spento» per colpa loro. */
test('374 g5 C2 (C2d) spento dalla persona, solo i luoghi cambiati a TALOS chiuso: al riavvio la riga non dice «stays off»', { timeout: 10_000 }, async () => {
  const b = await banco({ impostazione: APPROVATA });
  try {
    writeFileSync(b.fl, LUOGHI_ESTRANEI);
    const cu = b.nuovo(); await muto(() => cu.avvia());
    assert.equal(b.acceso(cu), false);
    const A = sessione(cu, 'On request');
    await muto(() => A.attrezzo('shell', { comando: 'npm test' }));
    A.chiudi();
    const av = A.avvisi();
    assert.equal(av.length, 1);
    assert.deepEqual(chiaviDi(av), ['movedAsideAtStart']);
    assert.equal(av[0].value.testo.includes('stays off'), false);
  } finally { b.chiudi(); }
});
