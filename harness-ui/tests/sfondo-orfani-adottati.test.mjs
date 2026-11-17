import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry, EVENTO_SFONDO_ADOTTATO, EVENTO_SFONDO_IMPRONTA, EVENTO_SFONDO_PERSO } from '../src/session-registry.mjs';
import { alberoDaTabella, improntaDaStat, tabellaDaRigheWindows } from '../src/impronta-processo.mjs';

/*
 * ⛔ Owner 17/10/2026 («Adottarli come Hermes, con "Ferma"») — I COMANDI IN SOTTOFONDO SOPRAVVISSUTI A UNA MORTE DI COLPO DEL SERVER.
 *   Segnalato dal Mobile sul Pad (r4 `701c6c0d2`): `sleep 600` in sottofondo, `am force-stop`, e il processo resta vivo (PPID 1) con la
 *   riga «Non più seguito» e nessun modo di fermarlo. Qui il registro con processi FINTI (`processiOspite`): nessuna prova di questo
 *   file segnala un processo vero che non ha creato. Le prove coi processi veri stanno in fondo, e toccano solo i processi che lanciano.
 */
async function preparaEsecuzioneFinta() { return { ok: true, cartella: '/tmp/x', task: { consegna: 'x' } }; }
const aspetta = (ms = 10) => new Promise((r) => setTimeout(r, ms));
/** Aspetta che la condizione diventi vera; se non succede la prova è ROSSA (un'attesa scaduta in silenzio non prova niente). */
async function finche(cond, { volte = 100, ms = 10 } = {}) { for (let i = 0; i < volte && !cond(); i += 1) await aspetta(ms); assert.ok(cond(), 'la condizione attesa non è arrivata'); return true; }

/** Un mondo di processi finto: chi è vivo, che impronta ha, e ciò che si è provato a fare. */
function mondo({ piattaforma = 'linux', pidOspite = 900, vivi = {}, gruppi = {}, impronte = {}, alberi = {}, ostinato = false } = {}) {
  const fatti = { letture: [], segnali: [], alberi: [] };
  const statoVivi = new Map(Object.entries(vivi).map(([k, v]) => [Number(k), v]));
  const statoGruppi = new Map(Object.entries(gruppi).map(([k, v]) => [Number(k), v]));
  const statoImpronte = new Map(Object.entries(impronte).map(([k, v]) => [Number(k), v]));
  return {
    fatti, statoVivi, statoGruppi, statoImpronte,
    ospite: {
      piattaforma, pidOspite, ogniMs: 20, graziaMs: 200, attendi: (ms) => aspetta(Math.min(ms, 5)),
      leggiImpronte: async (pids) => { fatti.letture.push([...pids]); return new Map(pids.map((p) => [p, statoImpronte.has(p) ? statoImpronte.get(p) : null])); },
      leggiAlbero: async (radice, { conImpronteDi = [] } = {}) => {
        fatti.letture.push([radice, ...conImpronteDi]);
        const r = statoImpronte.get(radice);
        const membri = alberi[radice] ?? (r ? [{ pid: radice, impronta: r.impronta }] : []);
        if (!membri.length) return null;
        return { membri, gruppo: r?.gruppo ?? null, altri: new Map(conImpronteDi.map((p) => [p, statoImpronte.get(p) ?? null])) };
      },
      esiste: (pid) => statoVivi.get(pid) === true,
      gruppoEsiste: (g) => statoGruppi.get(g) === true,
      segnale: (bersaglio, nome, { gruppo = false } = {}) => {
        fatti.segnali.push([gruppo ? -bersaglio : bersaglio, nome]);
        if (!ostinato || nome === 'SIGKILL') { statoGruppi.set(bersaglio, false); statoVivi.set(bersaglio, false); }
        return true;
      },
      fermaAlbero: async (pid) => { fatti.alberi.push(pid); statoVivi.set(pid, false); return true; },
    },
  };
}

const SESSIONE = 'cdcdcdcd-2222-4222-8222-cdcdcdcdcdcd';
/** Un giornale come lo lascia un server morto di colpo: un comando in sottofondo, la sua impronta, nessuna uscita. */
function giornaleOrfano(store, { impronta = 'proc:boot:777', pid = 4242, gruppo = 4242, membri = null, ospite = { pid: 111, impronta: 'proc:boot:5' }, dopo = [] } = {}) {
  let sequenza = 0;
  const evento = (type, extra = {}) => ({ type, _sequenza: ++sequenza, ...extra });
  const righe = [
    { tipo: 'intestazione', schema: 1, sessionId: SESSIONE, taskId: 'libero:orfani', cartella: store, task: { consegna: 'sfondo', consegnaCorta: 'sfondo' },
      comandoProva: null, forkDa: null, avviataAlle: '2026-10-17T10:00:00.000Z', modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium',
      mobile: false, permessi: 'Full access', permessiPerAttrezzo: null, padreId: null, profonditaDelega: 0, provider: 'cloud', runtimeId: null,
      modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true },
    evento('RunStarted', { threadId: SESSIONE, runId: 'r1' }),
    evento('ToolCallStart', { toolCallId: 'bg1', toolCallName: 'shell' }),
    evento('ToolCallArgs', { toolCallId: 'bg1', delta: JSON.stringify({ comando: 'sleep 600', background: true }) }),
    evento('ToolCallResult', { toolCallId: 'bg1', content: 'IN BACKGROUND: started in the background on request.', inSfondo: true }),
    evento('CUSTOM', { name: EVENTO_SFONDO_IMPRONTA, value: { toolCallId: 'bg1', pid, gruppo, impronta, ...(membri ? { membri } : {}), ospite } }),
    evento('RunFinished', { threadId: SESSIONE, runId: 'r1', result: { detto: 'fatto' } }),
    ...dopo.map((d) => evento(d.type, d)),
  ];
  writeFileSync(join(store, `${SESSIONE}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
}
async function riavvia(store, m) {
  const registro = createSessionRegistry({ cartellaStore: store, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', processiOspite: m.ospite });
  await registro.ripristina();
  const esito = await registro.attendiAdozioneSfondi();
  const eventi = [];
  registro.iscriviti(SESSIONE, (e) => { if (e?.type === 'CUSTOM') eventi.push(e); });
  return { registro, esito, eventi };
}
const sulDisco = (store, nome, id = SESSIONE) => readFileSync(join(store, `${id}.jsonl`), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r))
  .map((r) => r.evento ?? r).filter((e) => e?.name === nome);

test('ORF-IMPRONTA: la riga di /proc si legge dopo l\'ultima «)» (un nome con spazi e parentesi non sposta i campi); Windows: «pid tick»', () => {
  const campi = ['S', '1', '4242', '4242', ...Array.from({ length: 15 }, (_, i) => String(i)), '987654', '0', '0'];
  assert.deepEqual(improntaDaStat(`4242 (my (odd) prog) ${campi.join(' ')}`, 'b'), { impronta: 'proc:b:987654', gruppo: 4242 });
  assert.equal(improntaDaStat('senza parentesi'), null);
  // Windows: la tabella «pid ppid tick» e l'albero della shell; un «figlio» nato PRIMA del padre è un PID riusato e non entra
  const tabella = tabellaDaRigheWindows('100 4 134367249379172770\r\nrumore\r\n200 100 134367249379172771\r\n300 100 134367249379000000\r\n400 7 134367249379172779\r\n201 200 134367249379172790\r\n');
  assert.deepEqual(alberoDaTabella(tabella, 100), [
    { pid: 100, impronta: 'win:134367249379172770' }, { pid: 200, impronta: 'win:134367249379172771' }, { pid: 201, impronta: 'win:134367249379172790' }]);
  assert.deepEqual(alberoDaTabella(tabella, 999), []);
});

test('ORF-01: un comando messo in sottofondo lascia sul giornale PID, gruppo, impronta e chi lo segue; senza PID niente', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-01-'));
  const m = mondo({ pidOspite: 900, impronte: { 4242: { impronta: 'proc:b:777', gruppo: 4242 }, 5151: { impronta: 'proc:b:778', gruppo: 77 }, 6000: { impronta: 'proc:b:779', gruppo: 6000 }, 900: { impronta: 'proc:b:5', gruppo: 900 } } });
  let input = null;
  const registro = createSessionRegistry({
    cartellaStore: store, guardaWorkspaceFn: () => () => {}, processiOspite: m.ospite,
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); },
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
  });
  const { sessionId } = registro.avvia('task-vero');
  await finche(() => input);
  const visti = [];
  registro.iscriviti(sessionId, (e) => { if (e?.name === EVENTO_SFONDO_IMPRONTA) visti.push(e.value); });
  input.registraComandoFermabile({ toolCallId: 'bg1', ferma: () => {}, pid: () => 4242 });
  input.registraComandoFermabile({ toolCallId: 'bg2', ferma: () => {}, pid: () => 5151 }); // rimasto nel gruppo dell'host
  input.registraComandoFermabile({ toolCallId: 'wsl', ferma: () => {}, pid: () => null }); // WSL: un marcatore, non un PID
  const sgancia = input.registraComandoFermabile({ toolCallId: 'breve', ferma: () => {}, pid: () => 6000 });
  for (const id of ['bg1', 'bg2', 'wsl', 'breve']) input.onEvento({ type: 'ToolCallResult', toolCallId: id, inSfondo: true });
  sgancia(); // uscito prima che l'impronta arrivasse: non c'è niente da riprendere
  input.onEvento({ type: 'ToolCallResult', toolCallId: 'primo-piano' });
  await finche(() => visti.length >= 2);
  await aspetta(30);
  assert.deepEqual(visti.map((v) => [v.toolCallId, v.pid, v.gruppo, v.impronta]).sort(), [['bg1', 4242, 4242, 'proc:b:777'], ['bg2', 5151, null, 'proc:b:778']],
    'il gruppo si ricorda solo se il comando lo guida (un gruppo che non è suo non si colpisce dopo)');
  assert.deepEqual(visti[0].ospite, { pid: 900, impronta: 'proc:b:5' });
  await finche(() => { try { return sulDisco(store, EVENTO_SFONDO_IMPRONTA, sessionId).length === 2; } catch { return false; } }, { volte: 200 });
  assert.equal(sulDisco(store, EVENTO_SFONDO_IMPRONTA, sessionId).length, 2, 'durevole: sta nel giornale');
});

test('ORF-02: al riavvio un orfano vivo e ancora suo è ADOTTATO; «Ferma» manda SIGTERM al GRUPPO e la riga si chiude «fermato da te»', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-02-'));
  giornaleOrfano(store);
  const m = mondo({ vivi: { 4242: true }, gruppi: { 4242: true }, impronte: { 4242: { impronta: 'proc:boot:777', gruppo: 4242 }, 900: { impronta: 'proc:boot:9', gruppo: 900 } } });
  const { registro, esito, eventi } = await riavvia(store, m);
  assert.deepEqual(esito, { adottati: 1, usciti: 0, riusati: 0, intatti: 0 });
  await finche(() => sulDisco(store, EVENTO_SFONDO_ADOTTATO).length === 1, { volte: 200 });
  const adozione = sulDisco(store, EVENTO_SFONDO_ADOTTATO)[0];
  assert.deepEqual([adozione.value.toolCallId, adozione.value.pid, adozione.value.ospite], ['bg1', 4242, { pid: 900, impronta: 'proc:boot:9' }]);
  assert.deepEqual(registro.pidDeiComandi(SESSIONE), [{ toolCallId: 'bg1', pid: 4242, wsl: null }], 'CPU e memoria della riga: il PID ripreso');
  assert.equal(registro.togliProcesso(SESSIONE, 'bg1'), 'in-corso', 'vivo: non si toglie, si ferma');
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => eventi.some((e) => e.name === 'talos.processo-sfondo'));
  assert.deepEqual(m.fatti.segnali, [[-4242, 'SIGTERM']], 'al gruppo, e basta: è uscito nella grazia');
  const uscita = eventi.find((e) => e.name === 'talos.processo-sfondo').value;
  assert.equal(uscita.fermatoDallaPersona, true);
  assert.equal(uscita.comando, 'sleep 600', 'la nota «fermato da te» nomina il comando, ricostruito dagli argomenti sul giornale');
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'non-in-corso', 'chiusa: non è più fermabile');
  assert.ok(m.fatti.letture.length >= 2, 'l\'identità si riprova subito prima del colpo');
});

test('ORF-03: PID vivo ma impronta DIVERSA (numero riusato da un altro processo) ⇒ non adottato, nessun segnale, fuori dal registro', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-03-'));
  giornaleOrfano(store);
  const m = mondo({ vivi: { 4242: true }, gruppi: { 4242: true }, impronte: { 4242: { impronta: 'proc:boot:31337', gruppo: 4242 } } });
  const { registro, esito } = await riavvia(store, m);
  assert.deepEqual(esito, { adottati: 0, usciti: 0, riusati: 1, intatti: 0 });
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'non-in-corso');
  assert.deepEqual(m.fatti.segnali, []);
  await finche(() => sulDisco(store, EVENTO_SFONDO_PERSO).length === 1, { volte: 200 });
  assert.equal(sulDisco(store, EVENTO_SFONDO_PERSO)[0].value.motivo, 'riusato');
  assert.equal(sulDisco(store, EVENTO_SFONDO_ADOTTATO).length, 0);
  // e al riavvio dopo non si rilegge più niente: la riga è uscita dal registro
  const m2 = mondo({ vivi: { 4242: true }, impronte: { 4242: { impronta: 'proc:boot:31337', gruppo: 4242 } } });
  const secondo = await riavvia(store, m2);
  assert.deepEqual(secondo.esito, { adottati: 0, usciti: 0, riusati: 0, intatti: 0 });
  assert.deepEqual(m2.fatti.letture, []);
});

test('ORF-04: PID vivo ma l\'impronta NON si legge ⇒ non si tocca, e la riga resta com\'era (nessuna chiusura)', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-04-'));
  giornaleOrfano(store);
  const m = mondo({ vivi: { 4242: true }, gruppi: { 4242: true }, impronte: {} });
  const { registro, esito } = await riavvia(store, m);
  assert.deepEqual(esito, { adottati: 0, usciti: 0, riusati: 0, intatti: 1 });
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'non-in-corso');
  assert.deepEqual(m.fatti.segnali, []);
  await aspetta(50);
  assert.equal(sulDisco(store, EVENTO_SFONDO_PERSO).length, 0);
  assert.equal(sulDisco(store, EVENTO_SFONDO_ADOTTATO).length, 0);
});

test('ORF-05: PID morto ⇒ fuori dal registro SENZA nessuna lettura d\'impronta (su Windows niente PowerShell)', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-05-'));
  giornaleOrfano(store);
  const m = mondo({ piattaforma: 'win32', vivi: {}, impronte: { 4242: { impronta: 'proc:boot:777' } } });
  const { esito } = await riavvia(store, m);
  assert.deepEqual(esito, { adottati: 0, usciti: 1, riusati: 0, intatti: 0 });
  assert.deepEqual(m.fatti.letture, [], 'nessuna lettura');
  await finche(() => sulDisco(store, EVENTO_SFONDO_PERSO).length === 1, { volte: 200 });
  assert.equal(sulDisco(store, EVENTO_SFONDO_PERSO)[0].value.motivo, 'uscito');
});

test('ORF-06: una riga chiusa normalmente (uscita sul giornale) è fuori dal registro: nessuna lettura, nessun evento', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-06-'));
  giornaleOrfano(store, { dopo: [{ type: 'CUSTOM', name: 'talos.processo-sfondo', value: { toolCallId: 'bg1', esito: 'riuscito', codice: 0 } }] });
  const m = mondo({ vivi: { 4242: true }, gruppi: { 4242: true }, impronte: { 4242: { impronta: 'proc:boot:777', gruppo: 4242 } } });
  const { esito } = await riavvia(store, m);
  assert.deepEqual(esito, { adottati: 0, usciti: 0, riusati: 0, intatti: 0 });
  assert.deepEqual(m.fatti.letture, []);
  assert.deepEqual(m.fatti.segnali, []);
});

test('ORF-07: chi lo segue (un altro server) è ancora vivo con la sua impronta ⇒ nessuno lo adotta (archivio condiviso col 4174)', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-07-'));
  giornaleOrfano(store, { ospite: { pid: 111, impronta: 'proc:boot:5' } });
  const m = mondo({ vivi: { 4242: true, 111: true }, gruppi: { 4242: true }, impronte: { 4242: { impronta: 'proc:boot:777', gruppo: 4242 }, 111: { impronta: 'proc:boot:5', gruppo: 111 } } });
  const { esito } = await riavvia(store, m);
  assert.deepEqual(esito, { adottati: 0, usciti: 0, riusati: 0, intatti: 1 });
  // AL CONTRARIO: lo stesso numero 111 ma un altro processo (impronta diversa) ⇒ chi lo seguiva è morto, si adotta
  const store2 = mkdtempSync(join(tmpdir(), 'orf-07b-'));
  giornaleOrfano(store2, { ospite: { pid: 111, impronta: 'proc:boot:5' } });
  const m2 = mondo({ vivi: { 4242: true, 111: true }, gruppi: { 4242: true }, impronte: { 4242: { impronta: 'proc:boot:777', gruppo: 4242 }, 111: { impronta: 'proc:boot:6', gruppo: 111 } } });
  const secondo = await riavvia(store2, m2);
  assert.deepEqual(secondo.esito, { adottati: 1, usciti: 0, riusati: 0, intatti: 0 });
});

test('ORF-08: un ripreso che ignora SIGTERM riceve SIGKILL dopo la grazia', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-08-'));
  giornaleOrfano(store);
  const m = mondo({ ostinato: true, vivi: { 4242: true }, gruppi: { 4242: true }, impronte: { 4242: { impronta: 'proc:boot:777', gruppo: 4242 } } });
  const { registro, eventi } = await riavvia(store, m);
  registro.fermaComando(SESSIONE, 'bg1');
  await finche(() => eventi.some((e) => e.name === 'talos.processo-sfondo'), { volte: 300 });
  assert.deepEqual(m.fatti.segnali, [[-4242, 'SIGTERM'], [-4242, 'SIGKILL']]);
  assert.equal(eventi.find((e) => e.name === 'talos.processo-sfondo').value.segnale, 'SIGKILL');
});

test('ORF-09: un ripreso che finisce DA SOLO chiude la riga «esito non noto», senza svegliare la chat', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-09-'));
  giornaleOrfano(store);
  const m = mondo({ vivi: { 4242: true }, gruppi: { 4242: true }, impronte: { 4242: { impronta: 'proc:boot:777', gruppo: 4242 } } });
  const { registro, eventi } = await riavvia(store, m);
  m.statoGruppi.set(4242, false); m.statoVivi.set(4242, false);
  await finche(() => eventi.some((e) => e.name === 'talos.processo-sfondo'), { volte: 200 });
  const uscita = eventi.find((e) => e.name === 'talos.processo-sfondo').value;
  assert.deepEqual([uscita.esito, uscita.codice, uscita.esitoIgnoto, uscita.fermatoDallaPersona], ['terminato', null, true, undefined]);
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'non-in-corso');
  assert.deepEqual(registro.statoCoda(SESSIONE).voci.filter((v) => v.toolCallId === 'bg1'), [], 'nessun risveglio del modello: niente in coda per lui');
});

test('ORF-10: Windows — «Ferma» è taskkill dell\'albero sul PID ripreso (nessun segnale POSIX)', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-10-'));
  // misurato il 17/10: morto il server, la SHELL (4242) muore con lui e il comando (5353, il ping) resta vivo col padre morto
  giornaleOrfano(store, { impronta: 'win:100', gruppo: null, membri: [{ pid: 4242, impronta: 'win:100' }, { pid: 5353, impronta: 'win:101' }, { pid: 5454, impronta: 'win:102' }] });
  const m = mondo({ piattaforma: 'win32', vivi: { 5353: true, 5454: true }, impronte: { 5353: { impronta: 'win:101', gruppo: null }, 5454: { impronta: 'win:102', gruppo: null } } });
  const { registro, esito, eventi } = await riavvia(store, m);
  assert.deepEqual(esito, { adottati: 1, usciti: 0, riusati: 0, intatti: 0 }, "adottato per i membri vivi, anche se la shell non c'è più");
  assert.deepEqual(registro.pidDeiComandi(SESSIONE), [{ toolCallId: 'bg1', pid: 5353, wsl: null }]);
  m.statoImpronte.set(5454, { impronta: 'win:999', gruppo: null }); // fra l'adozione e «Ferma» il 5454 è uscito e il numero è passato ad altri
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => eventi.some((e) => e.name === 'talos.processo-sfondo'));
  assert.deepEqual(m.fatti.alberi, [5353], "taskkill dell'albero sul membro vivo e ancora suo: mai sulla shell morta, mai sul numero riusato");
  assert.deepEqual(m.fatti.segnali, []);
});

test('ORF-11: fra l\'adozione e «Ferma» il numero è passato a un altro processo ⇒ nessun colpo, e la riga si chiude', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-11-'));
  giornaleOrfano(store);
  const m = mondo({ vivi: { 4242: true }, gruppi: { 4242: true }, impronte: { 4242: { impronta: 'proc:boot:777', gruppo: 4242 } } });
  const { registro, eventi } = await riavvia(store, m);
  m.statoImpronte.set(4242, { impronta: 'proc:boot:999', gruppo: 4242 });
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => eventi.some((e) => e.name === 'talos.processo-sfondo'));
  assert.deepEqual(m.fatti.segnali, [], 'un estraneo non si colpisce');
  assert.equal(eventi.find((e) => e.name === 'talos.processo-sfondo').value.esitoIgnoto, true);
});

/*
 * ⛔ Giudice v1763 (13/11/2026), misura chiesta sul lanciatore: `fermaAdottato` dopo un riavvio. La fotografia di un comando partito
 *   col lanciatore ha in testa il PID del LANCIATORE (6100), poi la shell (6101) e i suoi figli. Il lanciatore muore con TALOS (libuv
 *   lo mette nel Job del node, controllore del 13/11: vivo dopo 0 volte su 10), quindi al riavvio non è fra i vivi e non si colpisce.
 *   Il colpo che poteva cadere su un estraneo era un altro: `taskkill /T` sulla shell chiude anche il figlio, e il giro dopo colpiva il
 *   numero del figlio appena liberato (Windows lo può ridare). Ora l'identità si riprova prima di ogni colpo, come Hermes
 *   (`process_registry_termination.py:45-49`).
 */
test('ORF-15: Windows — dopo il taskkill dell albero il numero di un membro appena chiuso non si colpisce più (passato a un altro: impronta diversa); il lanciatore morto mai', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-15-'));
  const membri = [{ pid: 6100, impronta: 'win:300' }, { pid: 6101, impronta: 'win:301' }, { pid: 6102, impronta: 'win:302' }];
  giornaleOrfano(store, { pid: 6100, impronta: 'win:300', gruppo: null, membri });
  const m = mondo({ piattaforma: 'win32', vivi: { 6101: true, 6102: true }, impronte: { 6101: { impronta: 'win:301', gruppo: null }, 6102: { impronta: 'win:302', gruppo: null } } });
  // taskkill /T sulla shell chiude anche il figlio; il numero del figlio passa subito a un estraneo (vivo, impronta diversa)
  m.ospite.fermaAlbero = async (pid) => {
    m.fatti.alberi.push(pid); m.statoVivi.set(pid, false);
    if (pid === 6101) m.statoImpronte.set(6102, { impronta: 'win:999', gruppo: null });
    return true;
  };
  const { registro, eventi } = await riavvia(store, m);
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => m.fatti.alberi.length >= 1);
  await aspetta(100);
  assert.deepEqual(m.fatti.alberi, [6101], 'un colpo solo, sulla shell ancora sua: mai sul lanciatore morto, mai sul numero passato ad altri');
  // cura dei gialli (13/11, mutante S6): l'estraneo vivo col numero del figlio non tiene aperta la riga, che si chiude
  await finche(() => eventi.some((e) => e.name === 'talos.processo-sfondo'));
  // al contrario: un membro che dopo il colpo è ancora vivo e ancora suo (un figlio rimasto senza padre) si colpisce
  const store2 = mkdtempSync(join(tmpdir(), 'orf-15b-'));
  giornaleOrfano(store2, { pid: 6100, impronta: 'win:300', gruppo: null, membri });
  const m2 = mondo({ piattaforma: 'win32', vivi: { 6101: true, 6102: true }, impronte: { 6101: { impronta: 'win:301', gruppo: null }, 6102: { impronta: 'win:302', gruppo: null } } });
  const r2 = await riavvia(store2, m2);
  assert.equal(r2.registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => r2.eventi.some((e) => e.name === 'talos.processo-sfondo'));
  assert.deepEqual(m2.fatti.alberi, [6101, 6102], 'il figlio ancora suo si ferma anche lui');
});

/*
 * Unione vera (agente d unione, 14/11/2026, revisore lanc9 punto 5): il mutante K3 (nessun nuovo controllo d identità fra un colpo e
 *   l altro, `restano = ancoraVivi`) lo uccideva solo ORF-15. Seconda prova con un altra forma: tre membri vivi, il numero che passa a
 *   un estraneo è quello dell ULTIMO, non del primo figlio, e si guarda anche CHE COSA si rilegge fra un colpo e l altro (solo i vivi).
 */
test('ORF-15c: Windows — tre membri: dopo ogni colpo si rilegge l identità dei soli membri ancora vivi, e il numero dell ultimo passato a un estraneo non si colpisce (K3, seconda prova)', async () => {
  const store = mkdtempSync(join(tmpdir(), 'orf-15c-'));
  const membri = [{ pid: 6500, impronta: 'win:700' }, { pid: 6501, impronta: 'win:701' }, { pid: 6502, impronta: 'win:702' }, { pid: 6503, impronta: 'win:703' }];
  giornaleOrfano(store, { pid: 6500, impronta: 'win:700', gruppo: null, membri });
  const m = mondo({ piattaforma: 'win32', vivi: { 6501: true, 6502: true, 6503: true }, impronte: { 6501: { impronta: 'win:701', gruppo: null }, 6502: { impronta: 'win:702', gruppo: null }, 6503: { impronta: 'win:703', gruppo: null } } });
  // il primo colpo chiude solo il 6501; il numero del 6503 (uscito nel frattempo) passa subito a un estraneo vivo
  m.ospite.fermaAlbero = async (pid) => {
    m.fatti.alberi.push(pid); m.statoVivi.set(pid, false);
    if (pid === 6501) m.statoImpronte.set(6503, { impronta: 'win:999', gruppo: null });
    return true;
  };
  const { registro, eventi } = await riavvia(store, m);
  const lettureAllaStop = m.fatti.letture.length;
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => eventi.some((e) => e.name === 'talos.processo-sfondo'), { volte: 200 });
  assert.deepEqual(m.fatti.alberi, [6501, 6502], 'colpiti i due ancora suoi, mai il numero passato all estraneo');
  assert.equal(m.statoVivi.get(6503), true, 'l estraneo resta vivo');
  const dopo = m.fatti.letture.slice(lettureAllaStop);
  // la lettura dello Stop (i tre membri vivi), poi UNA rilettura dei due ancora vivi dopo il primo colpo: l estraneo ne esce lì, e dopo
  // il secondo colpo non resta nessuno da rileggere né da colpire
  assert.deepEqual(dopo, [[6501, 6502, 6503], [6502, 6503]], 'letture fra un colpo e l altro');
});

/*
 * Cura unica dei gialli del lanciatore (13/11/2026). Revisore C, mutante J4 (togliere `colpiti.push`): nessuna prova vedeva la riga di un
 *   ripreso chiusa SUBITO dopo lo Stop coi suoi programmi ancora vivi (un `taskkill` non chiude all istante). Revisore A, nota (i):
 *   il numero di un membro GIÀ colpito che Windows ridà a un altro processo teneva la riga «in corso» finché l altro viveva (3 su 3,
 *   45-51 s): nata ROSSA sulla testa `689e60b68`. Ora i membri colpiti ancora «vivi» si riprovano per ora di partenza (Hermes
 *   `process_registry_termination.py:45-48`: «start-time mismatch — PID was recycled onto an unrelated process»).
 */
function mondoLento(membri) {
  const vivi = Object.fromEntries(membri.map((m) => [m.pid, true]));
  const impronte = Object.fromEntries(membri.map((m) => [m.pid, { impronta: m.impronta, gruppo: null }]));
  const m = mondo({ piattaforma: 'win32', vivi, impronte });
  m.ospite.fermaAlbero = async (pid) => { m.fatti.alberi.push(pid); return true; }; // il colpo parte, il processo esce DOPO
  return m;
}
const chiusa = (eventi) => eventi.some((e) => e.name === 'talos.processo-sfondo');

test('ORF-16: Windows — dopo lo Stop la riga resta «in corso» finché un membro colpito è ancora vivo, e si chiude alla sua uscita (J4)', async () => {
  const membri = [{ pid: 6201, impronta: 'win:401' }];
  const store = mkdtempSync(join(tmpdir(), 'orf-16-'));
  giornaleOrfano(store, { pid: 6201, impronta: 'win:401', gruppo: null, membri });
  const m = mondoLento(membri);
  const { registro, eventi } = await riavvia(store, m);
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => m.fatti.alberi.length === 1);
  await aspetta(80);
  assert.equal(chiusa(eventi), false, 'il membro colpito è ancora vivo (ed è ancora lui): la riga non si chiude');
  assert.equal(registro.togliProcesso(SESSIONE, 'bg1'), 'in-corso');
  m.statoVivi.set(6201, false);
  await finche(() => chiusa(eventi), { volte: 200 });
  assert.equal(eventi.find((e) => e.name === 'talos.processo-sfondo').value.fermatoDallaPersona, true);
});

test('ORF-16b: Windows — due membri, colpiti uno dopo l altro e lenti a uscire: la riga aspetta l ultimo (J4, seconda prova)', async () => {
  const membri = [{ pid: 6301, impronta: 'win:501' }, { pid: 6302, impronta: 'win:502' }];
  const store = mkdtempSync(join(tmpdir(), 'orf-16b-'));
  giornaleOrfano(store, { pid: 6301, impronta: 'win:501', gruppo: null, membri });
  const m = mondoLento(membri);
  const { registro, eventi } = await riavvia(store, m);
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => m.fatti.alberi.length === 2);
  assert.deepEqual(m.fatti.alberi, [6301, 6302]);
  m.statoVivi.set(6301, false);
  await aspetta(80);
  assert.equal(chiusa(eventi), false, 'il secondo è ancora vivo: la riga resta');
  m.statoVivi.set(6302, false);
  await finche(() => chiusa(eventi), { volte: 200 });
});

test('ORF-17: Windows — il numero di un membro GIÀ colpito passa a un altro processo: la riga si chiude lo stesso, senza un secondo colpo (nata ROSSA)', async () => {
  const membri = [{ pid: 6401, impronta: 'win:601' }];
  const store = mkdtempSync(join(tmpdir(), 'orf-17-'));
  giornaleOrfano(store, { pid: 6401, impronta: 'win:601', gruppo: null, membri });
  const m = mondoLento(membri);
  m.ospite.fermaAlbero = async (pid) => { m.fatti.alberi.push(pid); m.statoImpronte.set(pid, { impronta: 'win:999', gruppo: null }); return true; }; // uscito, e il numero è subito di un altro
  m.ospite.ogniMs = 10_000; // la sorveglianza non passa durante la prova: la riga la chiude lo Stop stesso, dopo la sua attesa
  const { registro, eventi } = await riavvia(store, m);
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => chiusa(eventi), { volte: 200 });
  assert.deepEqual(m.fatti.alberi, [6401], 'un colpo solo: mai sull altro processo');
});

test('ORF-17c: Windows — due membri colpiti, e i numeri di tutti e due passano subito ad altri: lo Stop stesso chiude la riga dopo la sua attesa (seconda prova)', async () => {
  const membri = [{ pid: 6601, impronta: 'win:801' }, { pid: 6602, impronta: 'win:802' }];
  const store = mkdtempSync(join(tmpdir(), 'orf-17c-'));
  giornaleOrfano(store, { pid: 6601, impronta: 'win:801', gruppo: null, membri });
  const m = mondoLento(membri);
  m.ospite.fermaAlbero = async (pid) => { m.fatti.alberi.push(pid); m.statoImpronte.set(pid, { impronta: `win:9${pid}`, gruppo: null }); return true; };
  m.ospite.ogniMs = 10_000;
  const { registro, eventi } = await riavvia(store, m);
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => chiusa(eventi), { volte: 200 });
  assert.deepEqual(m.fatti.alberi, [6601, 6602], 'un colpo per membro, nessun secondo colpo');
  assert.equal(eventi.find((e) => e.name === 'talos.processo-sfondo').value.fermatoDallaPersona, true);
});

test('ORF-17d: Windows — due membri lenti: dopo l attesa uno esce, l altro non si legge (la riga resta), poi il suo numero passa a un altro: la sorveglianza chiude la riga', async () => {
  const membri = [{ pid: 6701, impronta: 'win:901' }, { pid: 6702, impronta: 'win:902' }];
  const store = mkdtempSync(join(tmpdir(), 'orf-17d-'));
  giornaleOrfano(store, { pid: 6701, impronta: 'win:901', gruppo: null, membri });
  const m = mondoLento(membri);
  const { registro, eventi } = await riavvia(store, m);
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => m.fatti.alberi.length === 2);
  await aspetta(600);
  assert.equal(chiusa(eventi), false, 'premessa: tutti e due ancora suoi');
  m.statoVivi.set(6701, false);
  m.statoImpronte.delete(6702);
  await aspetta(150);
  assert.equal(chiusa(eventi), false, 'il secondo non si legge: la riga resta');
  assert.equal(registro.togliProcesso(SESSIONE, 'bg1'), 'in-corso');
  m.statoImpronte.set(6702, { impronta: 'win:777', gruppo: null });
  await finche(() => chiusa(eventi), { volte: 200 });
  assert.deepEqual(m.fatti.alberi, [6701, 6702], 'nessun secondo colpo');
});

test('ORF-17b: Windows — il numero passa a un altro processo DOPO l attesa dello Stop: la sorveglianza lo vede e chiude la riga; finché l impronta non si legge, la riga resta', async () => {
  const membri = [{ pid: 6501, impronta: 'win:701' }];
  const store = mkdtempSync(join(tmpdir(), 'orf-17b-'));
  giornaleOrfano(store, { pid: 6501, impronta: 'win:701', gruppo: null, membri });
  const m = mondoLento(membri);
  const { registro, eventi } = await riavvia(store, m);
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => m.fatti.alberi.length === 1);
  await aspetta(600); // oltre l attesa dello Stop (50 giri), il membro è ancora vivo ed è ancora lui
  assert.equal(chiusa(eventi), false, 'premessa: ancora suo, la riga resta');
  m.statoImpronte.delete(6501); // l impronta non si legge: non si decide niente
  await aspetta(150);
  assert.equal(chiusa(eventi), false, 'impronta illeggibile: la riga resta');
  m.statoImpronte.set(6501, { impronta: 'win:999', gruppo: null });
  await finche(() => chiusa(eventi), { volte: 200 });
  assert.deepEqual(m.fatti.alberi, [6501], 'nessun secondo colpo');
});

/*
 * ⛔ Quinto giro sul lanciatore (13/11/2026, revisore dopo la cura unica).
 *   - RL7-04: un secondo Stop dato MENTRE la sorveglianza rilegge le impronte di una riga già colpita e ancora viva era ignorato 6 volte su
 *     6 (la sorveglianza teneva `a.fermando`), e `fermaComando` rispondeva lo stesso «fermato». Qui la lettura è trattenuta da un
 *     cancello: il secondo Stop la aspetta e poi colpisce, e le letture della stessa riga non si sovrappongono mai.
 *   - J-j: prima di uno Stop la sorveglianza non legge niente (una lettura su Windows è PowerShell, 1,7-3,2 s).
 *   - Il costo: dopo lo Stop, con un membro colpito vivo e ancora suo, la sorveglianza rileggeva a OGNI giro (ogni 5 s). Ora a passi che
 *     raddoppiano (1, 2, 4, 8 giri) fino a un tetto di 12 giri (60 s), e mai due letture insieme.
 */
/** Lo Stop ha colpito ed è FINITO (la sua attesa e la sua rilettura): la sorveglianza ha già letto almeno una volta dopo di lui. */
async function finitoLoStop(m) {
  await finche(() => m.fatti.alberi.length >= 1);
  const n0 = m.fatti.letture.length;
  await finche(() => m.fatti.letture.length >= n0 + 2, { volte: 500 });
}
function mondoCancello(membri) {
  const m = mondoLento(membri);
  const vera = m.ospite.leggiImpronte;
  m.cancello = null; m.rotta = false; m.inLettura = 0; m.massimo = 0;
  // ⛔ il registro copia le funzioni dell'ospite alla creazione: il rimando va messo PRIMA di `riavvia`
  m.ospite.leggiImpronte = async (pids) => {
    m.inLettura += 1; m.massimo = Math.max(m.massimo, m.inLettura);
    try { if (m.cancello) await m.cancello.promessa; if (m.rotta) throw new Error('lettura rotta'); return await vera(pids); } finally { m.inLettura -= 1; }
  };
  m.chiudiCancello = () => { let apri; m.cancello = { promessa: new Promise((r) => { apri = r; }) }; m.cancello.apri = () => { m.cancello = null; apri(); }; return m.cancello; };
  return m;
}
for (const [id, rotta] of [['18', false], ['18b', true]]) {
  test(`ORF-${id}: Windows — un secondo Stop dato MENTRE la sorveglianza rilegge le impronte (${rotta ? 'una lettura che fallisce' : 'una lettura lenta'}) aspetta la lettura e poi colpisce; mai due letture insieme (RL7-04, nata ROSSA)`, async () => {
    const membri = [{ pid: 6801, impronta: 'win:1001' }];
    const store = mkdtempSync(join(tmpdir(), `orf-${id}-`));
    giornaleOrfano(store, { pid: 6801, impronta: 'win:1001', gruppo: null, membri });
    const m = mondoCancello(membri);
    const { registro, eventi } = await riavvia(store, m);
    assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
    await finitoLoStop(m);
    const cancello = m.chiudiCancello();
    m.rotta = rotta;
    await finche(() => m.inLettura > 0, { volte: 300 }); // la sorveglianza sta leggendo, trattenuta
    await aspetta(600); // più del tetto dei passi: anche da sola, la sorveglianza non apre una seconda lettura sopra la prima
    assert.equal(m.massimo, 1, 'premessa: una lettura alla volta anche senza Stop');
    assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
    await aspetta(150);
    assert.equal(m.fatti.alberi.length, 1, 'premessa: mentre la lettura è trattenuta nessun colpo');
    m.rotta = false;
    cancello.apri();
    await finche(() => m.fatti.alberi.length === 2, { volte: 200 });
    assert.deepEqual(m.fatti.alberi, [6801, 6801], 'il secondo Stop ha colpito il membro ancora suo');
    assert.equal(m.massimo, 1, 'mai due letture delle impronte insieme');
    assert.equal(chiusa(eventi), false, 'ancora vivo: la riga resta');
    m.statoVivi.set(6801, false);
    await finche(() => chiusa(eventi), { volte: 200 });
  });
}

/** Una seconda riga in sottofondo nello stesso giornale (bg2), mai fermata. */
const secondaRiga = (pid, impronta) => [
  { type: 'ToolCallStart', toolCallId: 'bg2', toolCallName: 'shell' },
  { type: 'ToolCallResult', toolCallId: 'bg2', content: 'IN BACKGROUND', inSfondo: true },
  { type: 'CUSTOM', name: EVENTO_SFONDO_IMPRONTA, value: { toolCallId: 'bg2', pid, gruppo: null, impronta, membri: [{ pid, impronta }], ospite: { pid: 111, impronta: 'proc:boot:5' } } },
];
test('ORF-19: Windows — un ripreso vivo e MAI fermato: la sorveglianza non legge nessuna impronta (il costo c è solo dopo lo Stop) (J-j)', async () => {
  const membri = [{ pid: 6901, impronta: 'win:1101' }];
  const store = mkdtempSync(join(tmpdir(), 'orf-19-'));
  giornaleOrfano(store, { pid: 6901, impronta: 'win:1101', gruppo: null, membri });
  const m = mondoLento(membri);
  const { esito } = await riavvia(store, m);
  assert.equal(esito.adottati, 1, 'premessa: adottato');
  const prima = m.fatti.letture.length;
  await aspetta(600); // circa 30 giri della sorveglianza
  assert.equal(m.fatti.letture.length - prima, 0, 'nessuna lettura prima dello Stop');
  m.statoVivi.set(6901, false);
});
test('ORF-19b: Windows — due ripresi, fermato solo il primo: la sorveglianza rilegge solo i membri del primo, mai quelli del secondo (J-j, seconda prova)', async () => {
  const membri = [{ pid: 6911, impronta: 'win:1111' }];
  const store = mkdtempSync(join(tmpdir(), 'orf-19b-'));
  giornaleOrfano(store, { pid: 6911, impronta: 'win:1111', gruppo: null, membri, dopo: secondaRiga(6912, 'win:1112') });
  const m = mondoLento([...membri, { pid: 6912, impronta: 'win:1112' }]);
  const { registro, esito } = await riavvia(store, m);
  assert.equal(esito.adottati, 2, 'premessa: due adottati');
  const prima = m.fatti.letture.length;
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finitoLoStop(m);
  await aspetta(300);
  const lette = m.fatti.letture.slice(prima).flat();
  assert.ok(lette.includes(6911), 'premessa: il primo, fermato e ancora suo, si rilegge');
  assert.equal(lette.includes(6912), false, `il secondo, mai fermato, non si legge (${JSON.stringify(m.fatti.letture.slice(prima))})`);
  m.statoVivi.set(6911, false); m.statoVivi.set(6912, false);
});

test('ORF-20: Windows — dopo lo Stop, un membro colpito vivo e ancora suo si rilegge a passi che raddoppiano fino al tetto, non a ogni giro (costo della sorveglianza, nata ROSSA)', async () => {
  const membri = [{ pid: 7001, impronta: 'win:1201' }];
  const store = mkdtempSync(join(tmpdir(), 'orf-20-'));
  giornaleOrfano(store, { pid: 7001, impronta: 'win:1201', gruppo: null, membri });
  const m = mondoLento(membri);
  const { registro, eventi } = await riavvia(store, m);
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finitoLoStop(m);
  const prima = m.fatti.letture.length;
  const t0 = Date.now();
  await aspetta(3_000);
  const giri = (Date.now() - t0) / m.ospite.ogniMs;
  const letture = m.fatti.letture.length - prima;
  // con passi 1, 2, 4, 8 e poi 12 giri: 12-15 letture in 100-150 giri; a ogni giro sarebbero 100-150; senza tetto 7-8
  assert.ok(letture >= 9 && letture <= 30, `${letture} letture in circa ${Math.round(giri)} giri della sorveglianza`);
  assert.equal(chiusa(eventi), false, 'ancora suo: la riga resta');
  m.statoVivi.set(7001, false);
  await finche(() => chiusa(eventi), { volte: 200 });
});
test('ORF-20b: Windows — col passo già al tetto, un numero passato a un altro processo si vede entro il tetto (12 giri), e la riga si chiude senza un secondo colpo (costo della sorveglianza, seconda prova)', async () => {
  const membri = [{ pid: 7011, impronta: 'win:1211' }];
  const store = mkdtempSync(join(tmpdir(), 'orf-20b-'));
  giornaleOrfano(store, { pid: 7011, impronta: 'win:1211', gruppo: null, membri });
  const m = mondoLento(membri);
  const { registro, eventi } = await riavvia(store, m);
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finitoLoStop(m);
  const prima = m.fatti.letture.length;
  await aspetta(3_000); // il passo è arrivato al tetto
  const letture = m.fatti.letture.length - prima;
  assert.ok(letture <= 30, `in 3 s ${letture} letture, non una a ogni giro`);
  m.statoImpronte.set(7011, { impronta: 'win:7777', gruppo: null });
  const t0 = Date.now();
  await finche(() => chiusa(eventi), { volte: 150, ms: 10 });
  const ms = Date.now() - t0;
  assert.ok(ms <= 12 * m.ospite.ogniMs * 4, `visto in ${ms} ms (tetto: 12 giri da ${m.ospite.ogniMs} ms, con margine per i timer)`);
  assert.deepEqual(m.fatti.alberi, [7011], 'nessun secondo colpo');
});

/*
 * ⛔ COI PROCESSI VERI (brief del 17/10: «Su Windows con un processo vero. Su POSIX in WSL»). Un «server» finto (un Node figlio di questa
 *   prova) lancia il comando con le opzioni del kernel (`shell: true`, e su POSIX il gruppo suo come `opzioniGruppoDelComando`), poi
 *   muore DI COLPO (su Windows `TerminateProcess`, cioè `taskkill /F`; su POSIX SIGKILL). Si tocca solo ciò che questa prova ha lanciato.
 */
import { spawn as spawnVero, spawnSync } from 'node:child_process';

/*
 * 18/10/2026 — ORF-13/14 rosse sul runner Windows della CI pubblica (push in main dopo la #69 e la PR #70), verdi sul Pad e qui, e
 *   verdi sulla #69 col codice identico. La prova lanciava l'ALTRO processo e non guardava mai il suo esito: se in quell'istante il
 *   registro si era ripreso l'affitto della sessione (il comando vivo in sottofondo scrive), il figlio veniva rifiutato ed usciva senza
 *   scrivere, e la premessa «la sessione è stata ricaricata» cadeva senza dire perché. Qui il figlio deve dire `FATTO`; se no si rilascia
 *   l'affitto e si riprova, e dopo 20 volte la prova dice che cosa ha risposto il figlio.
 */
async function scriviDaUnAltroProcesso(t, store, righe, FIGLIO) {
  const { attivaAffittiArchivio } = await import('../src/session-store.mjs');
  let ultimo = '';
  for (let tentativo = 1; tentativo <= 20; tentativo += 1) {
    attivaAffittiArchivio(store).rilascia?.(SESSIONE);
    const figlio = spawnVero(process.execPath, [FIGLIO, store, SESSIONE, 'scrivi-ed-esci', JSON.stringify(righe)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let uscita = '';
    figlio.stdout.on('data', (d) => { uscita += d; }); figlio.stderr.on('data', (d) => { uscita += d; });
    const codice = await new Promise((ok) => figlio.on('exit', ok));
    if (codice === 0 && uscita.includes('FATTO')) {
      if (tentativo > 1) t.diagnostic(`the other process wrote at attempt ${tentativo} (before: ${ultimo})`);
      return tentativo;
    }
    ultimo = `exit ${codice}: ${uscita.replace(/\s+/gu, ' ').slice(0, 300)}`;
    await new Promise((ok) => setTimeout(ok, 50));
  }
  throw new Error(`the other process never wrote the session: ${ultimo}`);
}
import { esisteProcesso, leggiAlbero } from '../src/impronta-processo.mjs';

const REALE = process.platform === 'win32' || process.platform === 'linux';
const COMANDO_LUNGO = process.platform === 'win32' ? 'ping -n 120 127.0.0.1' : 'sleep 120';


/** Il server che muore di colpo: lancia il comando, dice il suo PID, poi aspetta di essere ucciso. Si fotografa come fa il registro. */
async function serverCheMuore() {
  const copione = `const { spawn } = require('node:child_process');
const p = spawn(${JSON.stringify(COMANDO_LUNGO)}, { shell: true, windowsHide: true, stdio: 'ignore', ...(process.platform === 'win32' ? {} : { detached: true }) });
process.stdout.write(String(p.pid) + String.fromCharCode(10));
setInterval(() => {}, 1e6);`;
  const host = spawnVero(process.execPath, ['-e', copione], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  const pid = await new Promise((ok, ko) => { let t = ''; host.stdout.on('data', (d) => { t += d; if (t.includes('\n')) ok(Number(t.trim())); }); host.on('error', ko); });
  await aspetta(500);
  const albero = await leggiAlbero(pid, { conImpronteDi: [host.pid] });
  return { host, pid, albero, improntaHost: albero?.altri.get(host.pid)?.impronta ?? null };
}
async function uccidiDiColpo(host) {
  process.platform === 'win32' ? host.kill() : host.kill('SIGKILL'); // Windows: TerminateProcess, come `taskkill /F` senza /T
  await new Promise((ok) => (host.exitCode !== null || host.signalCode !== null ? ok() : host.once('exit', ok)));
}
function pulisci(membri) { // solo ciò che questa prova ha lanciato (e che ha riconosciuto per impronta)
  for (const { pid } of membri) {
    if (!esisteProcesso(pid)) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* già uscito */ } } }
  }
}
const riga = (host, pid, albero, improntaHost, { impronta = null, membri = null } = {}) => ({
  pid, gruppo: process.platform === 'win32' ? null : (albero.gruppo === pid ? pid : null),
  impronta: impronta ?? albero.membri[0].impronta,
  ...(process.platform === 'win32' ? { membri: membri ?? albero.membri } : {}),
  ospite: { pid: host.pid, impronta: improntaHost }, // chi lo seguiva: il server morto
});

test('ORF-REALE-01: un server ucciso di colpo lascia vivo il suo comando in sottofondo; al riavvio è ADOTTATO e «Ferma» lo ferma davvero', { skip: !REALE }, async (t) => {
  const { host, pid, albero, improntaHost } = await serverCheMuore();
  assert.ok(albero?.membri.length, 'premessa: il comando si fotografa');
  t.after(() => pulisci(albero.membri));
  await uccidiDiColpo(host);
  await aspetta(500);
  const viviDopo = albero.membri.filter((m) => esisteProcesso(m.pid));
  t.diagnostic(`membri ${JSON.stringify(albero.membri.map((m) => m.pid))}, vivi dopo la morte del server ${JSON.stringify(viviDopo.map((m) => m.pid))}, shell ${pid} ${esisteProcesso(pid) ? 'viva' : 'morta'}`);
  assert.ok(viviDopo.length > 0, 'IL DIFETTO: morto il server, il comando in sottofondo è ancora vivo');
  const store = mkdtempSync(join(tmpdir(), 'orf-reale-'));
  giornaleOrfano(store, riga(host, pid, albero, improntaHost));
  const registro = createSessionRegistry({ cartellaStore: store, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  await registro.ripristina();
  const esito = await registro.attendiAdozioneSfondi();
  assert.deepEqual(esito, { adottati: 1, usciti: 0, riusati: 0, intatti: 0 });
  const eventi = [];
  registro.iscriviti(SESSIONE, (e) => { if (e?.name === 'talos.processo-sfondo') eventi.push(e.value); });
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  assert.equal(await finche(() => eventi.length > 0, { volte: 300, ms: 50 }), true, 'la riga si chiude');
  assert.equal(eventi[0].fermatoDallaPersona, true);
  for (const m of albero.membri) assert.equal(esisteProcesso(m.pid), false, `il processo ${m.pid} è fermato davvero`);
  await registro.chiudi();
});

test('ORF-REALE-02: AL CONTRARIO — un\'impronta che non coincide lascia il processo VIVO (non si tocca) e la riga esce dal registro', { skip: !REALE }, async (t) => {
  const { host, pid, albero, improntaHost } = await serverCheMuore();
  t.after(() => pulisci(albero.membri));
  await uccidiDiColpo(host);
  await aspetta(500);
  const falsa = process.platform === 'win32' ? 'win:1' : 'proc:-:1';
  const store = mkdtempSync(join(tmpdir(), 'orf-reale-2-'));
  giornaleOrfano(store, riga(host, pid, albero, improntaHost, { impronta: falsa, membri: albero.membri.map((m) => ({ pid: m.pid, impronta: falsa })) }));
  const vivi = albero.membri.filter((m) => esisteProcesso(m.pid));
  assert.ok(vivi.length > 0, 'premessa: qualcosa è vivo');
  const registro = createSessionRegistry({ cartellaStore: store, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  await registro.ripristina();
  assert.deepEqual(await registro.attendiAdozioneSfondi(), { adottati: 0, usciti: 0, riusati: 1, intatti: 0 });
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'non-in-corso');
  await aspetta(500);
  for (const m of vivi) assert.equal(esisteProcesso(m.pid), true, `il processo ${m.pid}, che non si riconosce, non si ferma`);
  await registro.chiudi();
});

/* POSIX: una shell che NON si sostituisce al comando (due comandi in fila) resta viva col suo figlio dopo la morte del server; «Ferma»
   colpisce il GRUPPO e ferma anche il figlio, che il registro non ha mai visto per PID. */
test('ORF-REALE-03: POSIX — `sleep 120; echo fine`: ripreso per la shell, «Ferma» ferma anche il figlio (il gruppo intero)', { skip: process.platform !== 'linux' }, async (t) => {
  const { readdirSync, readFileSync: leggi } = await import('node:fs');
  const delGruppo = (g) => readdirSync('/proc').filter((n) => /^[0-9]+$/u.test(n)).map(Number).filter((p) => {
    try { const s = leggi(`/proc/${p}/stat`, 'utf8'); return Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[2]) === g; } catch { return false; }
  });
  const copione = `const { spawn } = require('node:child_process');
const p = spawn('sleep 120; echo fine', { shell: true, stdio: 'ignore', detached: true });
process.stdout.write(String(p.pid) + String.fromCharCode(10));
setInterval(() => {}, 1e6);`;
  const host = spawnVero(process.execPath, ['-e', copione], { stdio: ['ignore', 'pipe', 'ignore'] });
  const pid = await new Promise((ok) => { let s = ''; host.stdout.on('data', (d) => { s += d; if (s.includes(String.fromCharCode(10))) ok(Number(s.trim())); }); });
  await aspetta(300);
  const albero = await leggiAlbero(pid, { conImpronteDi: [host.pid] });
  t.after(() => { try { process.kill(-pid, 'SIGKILL'); } catch { /* già vuoto */ } });
  await uccidiDiColpo(host);
  await aspetta(300);
  const membri = delGruppo(pid);
  t.diagnostic(`gruppo ${pid} dopo la morte del server: ${JSON.stringify(membri)}`);
  assert.ok(membri.length >= 2, 'premessa: la shell e il suo sleep, vivi');
  const store = mkdtempSync(join(tmpdir(), 'orf-reale-3-'));
  giornaleOrfano(store, riga(host, pid, albero, albero.altri.get(host.pid)?.impronta ?? null));
  const registro = createSessionRegistry({ cartellaStore: store, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  await registro.ripristina();
  assert.equal((await registro.attendiAdozioneSfondi()).adottati, 1);
  const eventi = [];
  registro.iscriviti(SESSIONE, (e) => { if (e?.name === 'talos.processo-sfondo') eventi.push(e.value); });
  registro.fermaComando(SESSIONE, 'bg1');
  assert.equal(await finche(() => eventi.length > 0, { volte: 300, ms: 50 }), true);
  assert.deepEqual(delGruppo(pid), [], 'il gruppo intero è fermato');
  await registro.chiudi();
});

/* Il filo dal kernel: il comando che il modello manda in sottofondo si registra fermabile col PID della sua shell (`onAvvio`, C1), e
   da quel PID si fotografa il comando vero (su Windows l'albero: la shell e il `PING.EXE`). È ciò che `registraImprontaSfondo` legge. */
test('ORF-KERNEL-01: dal kernel — lo sfondato registra il PID della shell, e il suo albero contiene il comando vero', { skip: !REALE }, async (t) => {
  const { talosLavora } = await import('../src/kernel/talosHarness.mjs');
  const cartella = mkdtempSync(join(tmpdir(), 'orf-kernel-'));
  const registrati = new Map();
  let n = 0;
  const fetchDiRete = async () => {
    n += 1;
    const message = n === 1
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'bg1', type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando: process.platform === 'win32' ? 'ping -n 30 127.0.0.1' : 'sleep 30', background: true }) } }] }
      : { role: 'assistant', content: 'fatto' };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  await talosLavora({
    cartella, task: { consegna: 'lancia' }, modello: 'f', chiave: 'k', giriMassimi: 3, livelloAccesso: 'accesso-pieno', fetchDiRete,
    chiediApprovazioneFn: async () => true, ...(process.platform === 'win32' ? { ambienteComandiFn: () => ({ dove: 'windows', revisione: 0 }) } : {}),
    registraComandoFermabile: (voce) => { registrati.set(voce.toolCallId, voce); return () => registrati.delete(voce.toolCallId); },
    segnalaUscitaSfondo: () => {},
  });
  const voce = registrati.get('bg1');
  assert.ok(voce, 'premessa: lo sfondato è registrato fermabile');
  t.after(() => { try { voce.ferma(); } catch { /* già uscito */ } });
  const pid = voce.pid();
  assert.ok(Number.isSafeInteger(pid) && pid > 0, 'il PID della shell è noto');
  await aspetta(500);
  const albero = await leggiAlbero(pid);
  t.diagnostic(`shell ${pid}, membri ${JSON.stringify(albero?.membri.map((m) => m.pid))}, gruppo ${albero?.gruppo}`);
  assert.ok(albero?.membri.length >= (process.platform === 'win32' ? 2 : 1), 'il comando vero è nella fotografia');
  if (process.platform !== 'win32') assert.equal(albero.gruppo, pid, 'POSIX: guida il suo gruppo (`setsid` alla partenza)');
  voce.ferma();
  assert.equal(await finche(() => albero.membri.every((m) => !esisteProcesso(m.pid)), { volte: 100, ms: 50 }), true, 'pulizia: il kernel lo ferma');
});

/* L'archivio è condiviso fra due processi (4174 e app, affitto del 09/10): quando l'altro scrive la sessione, qui la si RICARICA. Il
   ripreso è di questo processo (come la casa Linux): deve passare alla voce nuova, o «Ferma» risponderebbe «non in corso». */
test('ORF-12: una ricarica dall\'archivio (l\'altro processo ha scritto) non perde il ripreso: «Ferma» funziona ancora', async (t) => {
  const { attivaAffittiArchivio, disattivaAffittiArchivio } = await import('../src/session-store.mjs');
  const { fileURLToPath } = await import('node:url');
  const store = mkdtempSync(join(tmpdir(), 'orf-12-'));
  t.after(() => disattivaAffittiArchivio(store));
  giornaleOrfano(store);
  const m = mondo({ vivi: { 4242: true }, gruppi: { 4242: true }, impronte: { 4242: { impronta: 'proc:boot:777', gruppo: 4242 } } });
  const registro = createSessionRegistry({ cartellaStore: store, affittoFraProcessi: { etichetta: 'orf-12' }, processiOspite: m.ospite,
    avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  await registro.ripristina();
  assert.equal((await registro.attendiAdozioneSfondi()).adottati, 1);
  await finche(() => sulDisco(store, EVENTO_SFONDO_ADOTTATO).length === 1, { volte: 200 });
  attivaAffittiArchivio(store).rilascia?.(SESSIONE);
  // l'ALTRO processo (vero) continua la conversazione e se ne va
  const FIGLIO = fileURLToPath(new URL('./fixtures/affitto-processo-figlio.mjs', import.meta.url));
  const righe = [{ type: 'RunStarted', threadId: SESSIONE, runId: 'r9', _sequenza: 50 }, { type: 'RunFinished', threadId: SESSIONE, runId: 'r9', result: { detto: 'x' }, _sequenza: 51 }];
  await scriviDaUnAltroProcesso(t, store, righe, FIGLIO);
  assert.equal((await registro.allineaSessione(SESSIONE, { scrivere: false })).ricaricata, true, 'premessa: la sessione è stata ricaricata');
  assert.deepEqual(registro.pidDeiComandi(SESSIONE), [{ toolCallId: 'bg1', pid: 4242, wsl: null }], 'il ripreso è passato alla voce nuova');
  assert.equal(registro.fermaComando(SESSIONE, 'bg1'), 'fermato');
  await finche(() => m.fatti.segnali.length > 0);
  assert.deepEqual(m.fatti.segnali[0], [-4242, 'SIGTERM']);
});

/*
 * ⛔ Owner 17/10/2026 sera («Sì, nello stesso ramo») — IL DIFETTO DI PRIMA, trovato per strada: la ricarica dall'archivio condiviso
 *   (l'altro processo ha scritto la sessione) creava una voce NUOVA senza i comandi fermabili VIVI di questo processo. Uno sfondato
 *   vivo non si fermava più dalla sua riga («non in corso»), e la sua uscita finiva sulla voce VECCHIA: nessun ascoltatore la vedeva,
 *   e sul giornale prendeva un numero di sequenza della voce vecchia.
 */
test('ORF-13: dopo una ricarica dall\'archivio uno sfondato VIVO si ferma ancora dalla sua riga, e la sua uscita finisce sulla sessione ricaricata', async (t) => {
  const { attivaAffittiArchivio, disattivaAffittiArchivio } = await import('../src/session-store.mjs');
  const { fileURLToPath } = await import('node:url');
  const store = mkdtempSync(join(tmpdir(), 'orf-13-'));
  t.after(() => disattivaAffittiArchivio(store));
  giornaleOrfano(store, { dopo: [{ type: 'CUSTOM', name: 'talos.processo-sfondo', value: { toolCallId: 'bg1', esito: 'riuscito', codice: 0 } }] }); // una sessione qualunque, ferma
  const fermati = [];
  let diretto = null;
  const registro = createSessionRegistry({ cartellaStore: store, affittoFraProcessi: { etichetta: 'orf-13' }, processiOspite: mondo().ospite,
    avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
    // il `!` della persona, mandato in sottofondo: resta vivo in QUESTO processo
    eseguiComandoDirettoFn: (d) => {
      diretto = d;
      d.registraComandoFermabile({ toolCallId: 'vivo1', ferma: () => fermati.push('vivo1'), pid: () => null });
      d.onEvento({ type: 'ToolCallStart', toolCallId: 'vivo1', toolCallName: 'shell' });
      d.onEvento({ type: 'ToolCallResult', toolCallId: 'vivo1', content: 'IN BACKGROUND', inSfondo: true });
      return Promise.resolve({});
    },
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  await registro.ripristina();
  assert.deepEqual(registro.shell(SESSIONE, 'npm run dev'), { ok: true });
  await finche(() => diretto !== null);
  await aspetta(50);
  attivaAffittiArchivio(store).rilascia?.(SESSIONE);
  const FIGLIO = fileURLToPath(new URL('./fixtures/affitto-processo-figlio.mjs', import.meta.url));
  const righe = [{ type: 'RunStarted', threadId: SESSIONE, runId: 'r9', _sequenza: 500 }, { type: 'RunFinished', threadId: SESSIONE, runId: 'r9', result: { detto: 'x' }, _sequenza: 501 }];
  await scriviDaUnAltroProcesso(t, store, righe, FIGLIO);
  assert.equal((await registro.allineaSessione(SESSIONE, { scrivere: false })).ricaricata, true, 'premessa: la sessione è stata ricaricata');
  const visti = [];
  registro.iscriviti(SESSIONE, (e) => { if (e?.name === 'talos.processo-sfondo' && e.value?.toolCallId === 'vivo1') visti.push(e); });
  assert.equal(registro.fermaComando(SESSIONE, 'vivo1'), 'fermato', 'lo sfondato vivo si ferma ancora dalla sua riga');
  assert.deepEqual(fermati, ['vivo1']);
  diretto.segnalaUscitaSfondo({ toolCallId: 'vivo1', codice: null, segnale: 'SIGTERM', comando: 'npm run dev' }); // la sua uscita vera, dopo il «Ferma»
  await finche(() => visti.length === 1);
  assert.equal(visti[0].value.fermatoDallaPersona, true, '«fermato da te»: il segno messo dal «Ferma» sulla sessione ricaricata');
  assert.ok(visti[0]._sequenza > 501, `la sequenza segue il giornale ricaricato (${visti[0]._sequenza})`);
  await finche(() => sulDisco(store, 'talos.processo-sfondo').some((e) => e.value?.toolCallId === 'vivo1'), { volte: 200 });
  const sequenze = readFileSync(join(store, `${SESSIONE}.jsonl`), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r)).map((r) => (r.evento ?? r)._sequenza).filter(Number.isFinite);
  assert.equal(new Set(sequenze).size, sequenze.length, 'nessun numero di sequenza doppio sul giornale');
  assert.equal(registro.fermaComando(SESSIONE, 'vivo1'), 'fermato', 'finché il processo non esce davvero resta fermabile');
});

test('ORF-14: «Ferma» premuto PRIMA della ricarica, uscita DOPO: resta «fermato da te» sulla sessione ricaricata', async (t) => {
  const { attivaAffittiArchivio, disattivaAffittiArchivio } = await import('../src/session-store.mjs');
  const { fileURLToPath } = await import('node:url');
  const store = mkdtempSync(join(tmpdir(), 'orf-14-'));
  t.after(() => disattivaAffittiArchivio(store));
  giornaleOrfano(store, { dopo: [{ type: 'CUSTOM', name: 'talos.processo-sfondo', value: { toolCallId: 'bg1', esito: 'riuscito', codice: 0 } }] });
  const fermati = [];
  let diretto = null;
  const registro = createSessionRegistry({ cartellaStore: store, affittoFraProcessi: { etichetta: 'orf-14' }, processiOspite: mondo().ospite,
    avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
    eseguiComandoDirettoFn: (d) => {
      diretto = d;
      d.registraComandoFermabile({ toolCallId: 'vivo1', ferma: () => fermati.push('vivo1'), pid: () => null });
      d.onEvento({ type: 'ToolCallStart', toolCallId: 'vivo1', toolCallName: 'shell' });
      d.onEvento({ type: 'ToolCallResult', toolCallId: 'vivo1', content: 'IN BACKGROUND', inSfondo: true });
      return Promise.resolve({});
    },
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  await registro.ripristina();
  assert.deepEqual(registro.shell(SESSIONE, 'npm run dev'), { ok: true });
  await finche(() => diretto !== null);
  await aspetta(50);
  assert.equal(registro.fermaComando(SESSIONE, 'vivo1'), 'fermato', "il «Ferma» della persona, prima che l'altro processo scriva");
  attivaAffittiArchivio(store).rilascia?.(SESSIONE);
  const FIGLIO = fileURLToPath(new URL('./fixtures/affitto-processo-figlio.mjs', import.meta.url));
  const righe = [{ type: 'RunStarted', threadId: SESSIONE, runId: 'r9', _sequenza: 500 }, { type: 'RunFinished', threadId: SESSIONE, runId: 'r9', result: { detto: 'x' }, _sequenza: 501 }];
  await scriviDaUnAltroProcesso(t, store, righe, FIGLIO);
  assert.equal((await registro.allineaSessione(SESSIONE, { scrivere: false })).ricaricata, true, 'premessa: la sessione è stata ricaricata');
  const visti = [];
  registro.iscriviti(SESSIONE, (e) => { if (e?.name === 'talos.processo-sfondo' && e.value?.toolCallId === 'vivo1') visti.push(e); });
  diretto.segnalaUscitaSfondo({ toolCallId: 'vivo1', codice: null, segnale: 'SIGTERM', comando: 'npm run dev' });
  await finche(() => visti.length === 1);
  assert.equal(visti[0].value.fermatoDallaPersona, true, 'il segno del «Ferma» è passato alla sessione ricaricata');
  assert.deepEqual(fermati, ['vivo1']);
});
