/*
 * ⛔ Revisione avversaria del blocco 11 (27/10/2026), pezzo A — le cartelle bloccate per un dispositivo, nelle porte che il nucleo non
 *   vede: l'invio di un file al dispositivo (A-R2), il /goal guidato dal dispositivo (A-R3), le figlie che lavorano per lui (A-R4).
 *   Prove del revisore (handoff `revisione-blocco-11-prove-2026-10-27/A-bloccate-b11.test.mjs` A1-A3, `A-goal-giro-b11.test.mjs` A7),
 *   portate qui coi moduli veri e cartelle vere: rosse sul codice di prima, per il motivo giusto. Ogni regola ha il suo verso contrario.
 */
import assert from 'node:assert/strict';
import { realpathSync, writeFileSync } from 'node:fs';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaFileDeiDispositivi } from '../src/remoto/file-dispositivi.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const PAD = { id: 'padnino0001aaaa', nome: 'Pad di Nino', piattaforma: 'Android', inLinea: true, ultimaVoltaAlle: Date.UTC(2026, 9, 24, 20, 0), revocatoAlle: null };

async function banco(t, opzioni = {}) {
  const radice = realpathSync.native(await mkdtemp(join(tmpdir(), 'talos-b11-bloccate-')));
  const progetto = join(radice, 'Utenti');
  await mkdir(join(progetto, 'Documenti'), { recursive: true });
  writeFileSync(join(progetto, 'Documenti', 'segreto.txt'), 'PIN-4242 del conto');
  writeFileSync(join(progetto, 'libero.txt'), 'libero');
  const bloccata = realpathSync.native(join(progetto, 'Documenti'));
  const giri = [];
  const box = {};
  const remoto = {
    stato: async () => ({ disponibile: true, acceso: true, sceltaFatta: true, relay: { modo: 'n0' }, telefoni: [PAD] }),
    revoca: async () => { throw new Error('non si revoca'); },
    get file() { return box.file; },
  };
  const bloccateDi = async (id) => (id === PAD.id ? [bloccata] : []);
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => {
      let risolvi;
      const fine = new Promise((ok) => { risolvi = ok; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${giri.length}` });
      return fine;
    },
    modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    remotoFn: () => remoto,
    bloccateDelDispositivoFn: bloccateDi,
    ...opzioni,
  });
  /* Fine prova: ogni giro ancora aperto si chiude e il registro si spegne, poi si toglie la cartella. Senza, il processo della prova
     non usciva più (trovato correndo la suite nella forma ufficiale, senza --test-force-exit: appesa per un'ora). */
  t.after(async () => {
    for (const g of giri) {
      try { g.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'fine' }); } catch { /* già chiuso */ }
      g.risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } });
    }
    await registro.chiudi({ attesaMassimaMs: 2_000 }).catch(() => {});
    await rimuoviCartellaDiProvaAttesa(radice);
  });
  box.file = creaFileDeiDispositivi({ cartella: join(radice, 'dati', 'file-dispositivi'), sessionRegistry: registro, ...(opzioni.fileConBlocchi ? { bloccateDi } : {}) });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'Full access' });
  const chiudi = async (i) => {
    const g = giri[i];
    g.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${i + 1}` });
    g.risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } });
    await registro.attendiAssestamento?.(sessionId);
  };
  return { radice, progetto: realpathSync.native(progetto), bloccata, registro, sessionId, giri, box, chiudi };
}
const invia = async (giro, percorso, id) => {
  const anteprima = await giro.onTelefoniFn('remote_device_send_file', { path: percorso }, { fase: 'anteprima', toolCallId: id });
  return anteprima?.ok ? giro.onTelefoniFn('remote_device_send_file', { path: percorso }, { fase: 'esegui', toolCallId: id }) : anteprima;
};

/* ---------- A-R2: il file di una cartella bloccata non va al dispositivo ---------- */

test('B11-BLOC-A1 un giro del dispositivo non manda al dispositivo un file DENTRO la sua cartella bloccata, nemmeno in Accesso pieno', async (t) => {
  const b = await banco(t);
  await b.chiudi(0);
  b.registro.resume(b.sessionId, 'mandami Documenti/segreto.txt', [], { dispositivoDelGiro: PAD.id });
  const giro = b.giri.at(-1).input;
  assert.equal(giro.percorsiBloccatiFn.attiva(), true, 'premessa: giro del dispositivo coi blocchi');
  const esito = await invia(giro, 'Documenti/segreto.txt', 'c1');
  await b.chiudi(1);
  assert.equal(esito?.ok, false, JSON.stringify(esito));
  assert.match(esito.messaggio, /blocked for "Pad di Nino"/u);
  assert.match(esito.messaggio, /Nothing was sent\./u);
  assert.equal(b.box.file.offerte(b.sessionId).length, 0, 'il file della cartella bloccata è stato offerto');
});

test('B11-BLOC-A1-bis anche da un giro del PC: chi RICEVE ha la cartella bloccata, e il file non parte', async (t) => {
  const b = await banco(t);
  await b.chiudi(0);
  b.registro.resume(b.sessionId, 'manda al Pad Documenti/segreto.txt', [], { dispositivoDelGiro: null });
  const giro = b.giri.at(-1).input;
  const esito = await invia(giro, 'Documenti/segreto.txt', 'c2');
  await b.chiudi(1);
  assert.equal(esito?.ok, false, JSON.stringify(esito));
  assert.equal(b.box.file.offerte(b.sessionId).length, 0);
});

test('B11-BLOC-A1-contrario un file FUORI dalla bloccata parte come prima', async (t) => {
  const b = await banco(t);
  await b.chiudi(0);
  b.registro.resume(b.sessionId, 'mandami libero.txt', [], { dispositivoDelGiro: PAD.id });
  const esito = await invia(b.giri.at(-1).input, 'libero.txt', 'c3');
  await b.chiudi(1);
  assert.equal(esito?.ok, true, JSON.stringify(esito));
  assert.deepEqual(b.box.file.offerte(b.sessionId).map((o) => o.relativo), ['libero.txt']);
});

test('B11-BLOC-A1-file il modulo dei file, da solo: per quel dispositivo il file bloccato non si offre, non si elenca, non si legge', async (t) => {
  const b = await banco(t, { fileConBlocchi: true });
  await b.chiudi(0);
  await assert.rejects(b.box.file.registraOfferta({ sessionId: b.sessionId, dispositivoId: PAD.id, percorso: 'Documenti/segreto.txt' }),
    (e) => e?.motivo === 'bloccata');
  await assert.rejects(b.box.file.esaminaOfferta({ sessionId: b.sessionId, dispositivoId: PAD.id, percorso: 'Documenti/segreto.txt' }),
    (e) => e?.motivo === 'bloccata');
  /* al contrario: un altro dispositivo, senza quel blocco, sì */
  const altro = await b.box.file.registraOfferta({ sessionId: b.sessionId, dispositivoId: 'altro0001aaaaaa', percorso: 'Documenti/segreto.txt' });
  assert.equal(altro.relativo.replaceAll('\\', '/'), 'Documenti/segreto.txt');
  const elencoAltro = await b.box.file.elenco({ dispositivoId: 'altro0001aaaaaa', sessionId: b.sessionId });
  assert.ok(elencoAltro.items.some((i) => i.nome === 'segreto.txt'), 'premessa: per l\'altro dispositivo il file c\'è');
  const elencoPad = await b.box.file.elenco({ dispositivoId: PAD.id, sessionId: b.sessionId });
  assert.ok(!elencoPad.items.some((i) => i.nome === 'segreto.txt'), 'per il dispositivo che l\'ha bloccata il file si elenca');
});

/* ---------- A-R3: il /goal ---------- */

test('B11-BLOC-A2 una prova del contratto in una conversazione del dispositivo non legge il file bloccato (niente oracolo)', async (t) => {
  const b = await banco(t, { obiettiviNellaChat: true });
  await b.chiudi(0);
  b.registro.resume(b.sessionId, 'dal tablet', [], { dispositivoDelGiro: PAD.id });
  await b.chiudi(1);
  const criteri = [
    { testo: 'il segreto contiene PIN-4242', verifica: { tipo: 'file', percorso: 'Documenti/segreto.txt', fatto: 'contiene', testo: 'PIN-4242' } },
    { testo: 'il segreto contiene PIN-0000', verifica: { tipo: 'file', percorso: 'Documenti/segreto.txt', fatto: 'contiene', testo: 'PIN-0000' } },
    { testo: 'il libero contiene libero', verifica: { tipo: 'file', percorso: 'libero.txt', fatto: 'contiene', testo: 'libero' } },
  ];
  const posto = await b.registro.impostaObiettivo(b.sessionId, 'indovina', { criteri });
  assert.equal(posto?.erroreAvvio, undefined, JSON.stringify(posto));
  const v = await b.registro.verificaObiettivo(b.sessionId);
  assert.equal(v?.erroreAvvio, undefined, JSON.stringify(v));
  const esiti = (v.verifica?.verdetti ?? []).map((c) => ({ esito: c.esito, motivo: c.motivo?.tipo ?? null }));
  t.diagnostic(JSON.stringify(esiti));
  assert.deepEqual(esiti.slice(0, 2), [{ esito: 'non-verificabile', motivo: 'folder-blocked' }, { esito: 'non-verificabile', motivo: 'folder-blocked' }]);
  assert.equal(esiti[2].esito, 'verde', 'al contrario: un file fuori dalla bloccata si controlla come prima');
});

test('B11-BLOC-A2-comando un comando del contratto che NOMINA la bloccata non gira', async (t) => {
  const b = await banco(t, { obiettiviNellaChat: true, eseguiComandoDellaProvaFn: async () => { throw new Error('non doveva girare'); } });
  await b.chiudi(0);
  b.registro.resume(b.sessionId, 'dal tablet', [], { dispositivoDelGiro: PAD.id });
  await b.chiudi(1);
  const criteri = [{ testo: 'nel segreto', verifica: { tipo: 'comando', comando: 'type Documenti\\segreto.txt', uscita: 0 } }];
  const posto = await b.registro.impostaObiettivo(b.sessionId, 'leggi', { criteri });
  assert.equal(posto?.erroreAvvio, undefined, JSON.stringify(posto));
  const v = await b.registro.verificaObiettivo(b.sessionId);
  const esiti = (v.verifica?.verdetti ?? []).map((c) => ({ esito: c.esito, motivo: c.motivo?.tipo ?? null }));
  assert.deepEqual(esiti, [{ esito: 'non-verificabile', motivo: 'folder-blocked' }]);
});

test('B11-BLOC-A7 il /goal impostato e ripreso DAL DISPOSITIVO (rotta vera): i giri del ciclo hanno i blocchi, anche se l\'ultimo messaggio era del PC', async (t) => {
  const b = await banco(t, { obiettiviNellaChat: true });
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry: b.registro });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  await b.chiudi(0); // l'ultimo messaggio della persona è del PC
  const dalPad = { tipo: 'telefono', nome: 'Pad', dispositivoId: PAD.id };
  const criteri = [{ testo: 'riassunto scritto', verifica: { tipo: 'file', percorso: 'riassunto.txt', fatto: 'esiste' } }];
  const posto = await chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/goal`, corpo: { testo: 'Leggi Documenti/segreto.txt e scrivilo in riassunto.txt', criteri }, origineRemota: dalPad });
  assert.equal(posto.stato, 200, JSON.stringify(posto.dati ?? posto));
  await chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/goal/pausa`, corpo: {}, origineRemota: dalPad });
  const ripreso = await chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/goal/riprendi`, corpo: {}, origineRemota: dalPad });
  assert.equal(ripreso.stato, 200, JSON.stringify(ripreso.dati ?? ripreso));
  for (let i = 0; i < 200 && b.giri.length < 2; i += 1) await new Promise((r) => setTimeout(r, 25));
  assert.ok(b.giri.length >= 2, 'premessa: il ciclo del /goal ha fatto partire un giro');
  const giro = b.giri.at(-1).input;
  const attiva = giro.percorsiBloccatiFn?.attiva?.() ?? false;
  await b.chiudi(b.giri.length - 1).catch(() => {});
  assert.equal(attiva, true, 'il giro del /goal guidato dal dispositivo gira senza i suoi blocchi');
});

test('B11-BLOC-A7-contrario il /goal impostato e ripreso DAL PC in una conversazione del PC: nessun blocco', async (t) => {
  const b = await banco(t, { obiettiviNellaChat: true });
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry: b.registro });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  await b.chiudi(0);
  const criteri = [{ testo: 'riassunto scritto', verifica: { tipo: 'file', percorso: 'riassunto.txt', fatto: 'esiste' } }];
  await chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/goal`, corpo: { testo: 'Scrivi riassunto.txt', criteri } });
  await chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/goal/pausa`, corpo: {} });
  await chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/goal/riprendi`, corpo: {} });
  for (let i = 0; i < 200 && b.giri.length < 2; i += 1) await new Promise((r) => setTimeout(r, 25));
  assert.ok(b.giri.length >= 2, 'premessa: il ciclo ha fatto partire un giro');
  const attiva = b.giri.at(-1).input.percorsiBloccatiFn?.attiva?.() ?? false;
  await b.chiudi(b.giri.length - 1).catch(() => {});
  assert.equal(attiva, false);
});

/* ---------- A-R4: la figlia tiene i blocchi del giro che l'ha fatta nascere ---------- */

test('B11-BLOC-A3 la figlia di un giro del dispositivo, ancora viva: la persona al PC scrive al padre, e la figlia tiene i blocchi', async (t) => {
  const b = await banco(t);
  await b.chiudi(0);
  b.registro.resume(b.sessionId, 'dal tablet: delega', [], { dispositivoDelGiro: PAD.id });
  const delega = await b.giri[1].input.onDelega('figlia: leggi i file', b.progetto);
  const figliaId = delega?.childId ?? b.registro.elenca().find((x) => x.padreId === b.sessionId)?.sessionId;
  assert.ok(figliaId, `premessa: la figlia c'è (${JSON.stringify(delega)})`);
  const figlia = b.giri.at(-1).input;
  assert.equal(figlia.percorsiBloccatiFn.attiva(), true, 'premessa: alla nascita la figlia ha i blocchi');
  await b.chiudi(1);
  const r = b.registro.resume(b.sessionId, 'dal PC: intanto un\'altra cosa', [], { dispositivoDelGiro: null });
  assert.equal(r?.erroreAvvio, undefined, JSON.stringify(r));
  assert.equal(figlia.percorsiBloccatiFn.attiva(), true, 'la figlia nata nel giro del dispositivo ha perso i blocchi mentre lavora');
  assert.deepEqual(await figlia.percorsiBloccatiFn(), [b.bloccata]);
});

test('B11-BLOC-A3-contrario la figlia di un giro del PC resta del PC anche se poi scrive il dispositivo', async (t) => {
  const b = await banco(t);
  await b.chiudi(0);
  b.registro.resume(b.sessionId, 'dal PC: delega', [], { dispositivoDelGiro: null });
  await b.giri[1].input.onDelega('figlia: leggi i file', b.progetto);
  const figlia = b.giri.at(-1).input;
  assert.equal(figlia.percorsiBloccatiFn.attiva(), false, 'premessa: figlia del PC, nessun blocco');
  await b.chiudi(1);
  b.registro.resume(b.sessionId, 'dal tablet: e intanto', [], { dispositivoDelGiro: PAD.id });
  assert.equal(figlia.percorsiBloccatiFn.attiva(), false, 'la figlia del PC ha cambiato padrone');
});
