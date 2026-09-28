#!/usr/bin/env node
/*
 * 24/09/2026 — F2, corsia STORE: il BANCO DEI 1.000 TURNI (J4). Non è un test: non entra in `node --test`.
 * 24/09/2026 — F2-bis, corsia A: il SECONDO FORMATO (`--formato delta`) e il replay A STREAM, stessi tre giri,
 * stessa tabella (con le colonne del secondo formato in più).
 *
 * Genera in TEMP un journal SINTETICO in uno dei due formati:
 *   · `oggi`  — per ogni turno gli eventi AG-UI del giro più i due record che riscrivono la storia INTERA
 *               (`messaggi-finali`, `session-registry.mjs`, e `checkpoint-ripresa`) più `tempi-giro`. È QUADRATICO:
 *               100 turni = 108 MiB, 300 = 963 MiB, 1.000 ≈ 11 GiB (misurato il 24/09/2026, RAPPORTO-F2-STORE §2.7).
 *   · `delta` — per ogni turno gli eventi, UN `messaggi-delta { versioneGiro, da, messaggi }` con i SOLI messaggi
 *               nuovi del giro, `tempi-giro`, e un `checkpoint { versioneGiro, storia, recordCompattazione }` ogni
 *               `--checkpoint-ogni` giri (default 20; 0 = mai) o — `--regola-dimensione 1` (default) — quando la
 *               somma dei byte dei delta dal checkpoint supera la taglia del checkpoint (brief F2-bis, decisione 9:
 *               «delta per turno + checkpoint ogni N turni»). ⛔ La politica vera la decide la corsia B nel
 *               registro: qui è un PARAMETRO, non una decisione, e la tabella dice quanti checkpoint ha scritto.
 * La storia cresce di ~11 KB a turno (il ritmo misurato sul journal reale: 9,37 MB per 14 turni).
 *
 * Misura, per 100 / 300 / 1.000 turni, tre giri ciascuno in un PROCESSO FIGLIO fresco (memoria pulita):
 *   · byte del file e ms di generazione;
 *   · ms del REPLAY A STREAM (`leggiRegistroAStream` + un consumatore che tiene solo l'ultimo checkpoint e i
 *     delta dopo — o, nel formato di oggi, solo l'ultimo `messaggi-finali`) e quanti messaggi ha ricostruito, con
 *     la coerenza dei `da` (ogni delta deve partire dove finiva la storia);
 *   · ms di `leggiRegistro` (l'array intero: il contratto vecchio, per confronto) — SALTATA sopra `--tetto-array-mb`
 *     (default 600) perché un array di record da un file di quella taglia vuole più heap di quanto un banco condiviso
 *     possa permettersi (il PC è crashato due volte il 23/09): lo dice, non lo nasconde;
 *   · picco di `process.memoryUsage().rss` per fase.
 * Stampa la mediana in tabella e scrive il JSON completo.
 *
 * ⛔ Per non riempire il disco c'è un tetto in byte (`--tetto-mb`, default 2048): la generazione si ferma lì e il
 *   banco DICE a quale turno si è fermata, invece di fingere di aver fatto 1.000. Anche la lettura ha i suoi muri, e
 *   si vedono: `fs.readFile` rifiuta oltre 2 GiB (`ERR_FS_FILE_TOO_LARGE`) e una stringa V8 non supera 2^29-24
 *   caratteri (`ERR_STRING_TOO_LONG`, ~512 MiB): il banco cattura l'errore e lo riporta per nome.
 *
 * Uso: `node tests/bench/sessione-lunga-journal.mjs [--formato delta|oggi] [--turni 100,300,1000] [--giri 3]
 *       [--kb-per-turno 11] [--checkpoint-ogni 20] [--regola-dimensione 1] [--tetto-mb 2048] [--tetto-array-mb 600]
 *       [--out <file.json>]`  (TEMP/TMP privata consigliata; lucchetto RAM se il PC è condiviso)
 */
import { spawn } from 'node:child_process';
import { createWriteStream, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leggiRegistro, leggiRegistroAStream } from '../../src/session-store.mjs';
import { rimuoviCartellaDiProvaAttesa } from '../aiuto/rimuovi-cartella-di-prova.mjs';

const QUI = fileURLToPath(import.meta.url);

function argomenti(argv) {
  const opzioni = { formato: 'delta', turni: [100, 300, 1000], giri: 3, kbPerTurno: 11, checkpointOgni: 20, regolaDimensione: true, tettoMb: 2048, tettoArrayMb: 600, out: null, figlio: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--formato') { opzioni.formato = v; i++; }
    else if (a === '--turni') { opzioni.turni = v.split(',').map((n) => Number(n)); i++; }
    else if (a === '--giri') { opzioni.giri = Number(v); i++; }
    else if (a === '--kb-per-turno') { opzioni.kbPerTurno = Number(v); i++; }
    else if (a === '--checkpoint-ogni') { opzioni.checkpointOgni = Number(v); i++; }
    else if (a === '--regola-dimensione') { opzioni.regolaDimensione = v !== '0' && v !== 'false'; i++; }
    else if (a === '--tetto-mb') { opzioni.tettoMb = Number(v); i++; }
    else if (a === '--tetto-array-mb') { opzioni.tettoArrayMb = Number(v); i++; }
    else if (a === '--out') { opzioni.out = v; i++; }
    else if (a === '--figlio') opzioni.figlio = true;
  }
  if (!['oggi', 'delta'].includes(opzioni.formato)) throw new Error(`--formato ${opzioni.formato}: ammessi oggi, delta`);
  return opzioni;
}

// ───────────────────────────── generatore ─────────────────────────────

function testoDi(byte, seme) {
  // Testo «vero» quanto basta: parole diverse a ogni turno, niente compressione facile.
  const parole = ['il', 'motore', 'legge', 'la', 'cartella', 'e', 'scrive', 'un', 'record', 'per', 'turno', 'senza', 'riscrivere', 'niente'];
  let s = '';
  let i = seme;
  while (s.length < byte) { s += `${parole[i % parole.length]} ${i} `; i += 7; }
  return s.slice(0, byte);
}

function messaggiDelTurno(turno, kbPerTurno) {
  const byte = kbPerTurno * 1024;
  // ~1 KB persona, ~4 KB assistente (con tool_call), ~6 KB risultato dell'attrezzo: ~11 KB in tutto.
  const quotaPersona = Math.round(byte * 0.09);
  const quotaAssistente = Math.round(byte * 0.36);
  const quotaAttrezzo = byte - quotaPersona - quotaAssistente - 400;
  return [
    { role: 'user', content: `Turno ${turno}: ${testoDi(quotaPersona, turno)}` },
    { role: 'assistant', content: testoDi(quotaAssistente, turno * 3), tool_calls: [{ id: `call_${turno}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `src/file-${turno}.mjs` }) } }] },
    { role: 'tool', tool_call_id: `call_${turno}`, content: testoDi(quotaAttrezzo, turno * 5) },
    { role: 'assistant', content: `Fatto al turno ${turno}.` },
  ];
}

function eventiDelTurno(turno, sequenza) {
  const t = `2026-09-24T06:${String(turno % 60).padStart(2, '0')}:00.000Z`;
  const eventi = [
    { type: 'RunStarted', threadId: 'sintetica', runId: `run-${turno}`, timestamp: t },
    { type: 'TextMessageStart', messageId: `m-${turno}`, role: 'assistant', timestamp: t },
    { type: 'TextMessageContent', messageId: `m-${turno}`, delta: testoDi(600, turno * 11), timestamp: t },
    { type: 'ToolCallStart', toolCallId: `call_${turno}`, toolCallName: 'leggi', timestamp: t },
    { type: 'ToolCallResult', toolCallId: `call_${turno}`, content: testoDi(900, turno * 13), timestamp: t },
    { type: 'TextMessageEnd', messageId: `m-${turno}`, timestamp: t },
    { type: 'RunFinished', threadId: 'sintetica', runId: `run-${turno}`, timestamp: t },
  ];
  return eventi.map((e, i) => ({ ...e, _sequenza: sequenza + i }));
}

async function scriviRiga(stream, testo) {
  if (!stream.write(testo)) await new Promise((r) => stream.once('drain', r));
}

/** Genera il journal; ritorna { turniRaggiunti, byte, fermatoPer, msGenerazione, checkpointScritti, messaggiAttesi }. */
async function generaJournal(percorso, { formato, turni, kbPerTurno, tettoByte, checkpointOgni, regolaDimensione }) {
  const inizio = performance.now();
  const stream = createWriteStream(percorso, { encoding: 'utf8' });
  const storiaSerializzata = []; // i messaggi già serializzati: la storia si riscrive come stringa, non si ri-serializza
  let byte = 0;
  let sequenza = 1;
  let turniRaggiunti = 0;
  let fermatoPer = null;
  let checkpointScritti = 0;
  let byteUltimoCheckpoint = 0;
  let byteDeltaDalCheckpoint = 0;
  const riga = async (testo) => { byte += Buffer.byteLength(testo); await scriviRiga(stream, testo); };
  await riga(`${JSON.stringify({ tipo: 'intestazione', schema: 1, sessionId: 'sintetica', taskId: 'bench', cartella: 'C:/progetto', task: 'sessione sintetica', avviataAlle: '2026-09-24T06:00:00.000Z', modello: 'bench/finto', permessi: 'chiedi' })}\n`);
  for (let turno = 1; turno <= turni; turno++) {
    for (const evento of eventiDelTurno(turno, sequenza)) await riga(`${JSON.stringify(evento)}\n`);
    sequenza += 7;
    const nuovi = messaggiDelTurno(turno, kbPerTurno).map((m) => JSON.stringify(m));
    const da = storiaSerializzata.length;
    storiaSerializzata.push(...nuovi);
    const tempi = `${JSON.stringify({ tipo: 'tempi-giro', versioneGiro: turno, modello: 'bench/finto', primoTokenMs: 420 + turno, primoVisibileMs: 500 + turno, tipoPrimoToken: 'testo', giriDelGiro: 2, tokenDentro: 3000 + turno * 2800, tokenFuori: 900, tokenDaCache: null })}\n`;
    const righeDelTurno = [];
    if (formato === 'oggi') {
      const storia = `[${storiaSerializzata.join(',')}]`;
      righeDelTurno.push(`{"tipo":"messaggi-finali","versioneGiro":${turno},"messaggiFinali":${storia}}\n`, tempi, `{"tipo":"checkpoint-ripresa","versioneGiro":${turno},"messaggi":${storia}}\n`);
    } else {
      const delta = `{"tipo":"messaggi-delta","versioneGiro":${turno},"da":${da},"messaggi":[${nuovi.join(',')}]}\n`;
      righeDelTurno.push(delta, tempi);
      byteDeltaDalCheckpoint += Buffer.byteLength(delta);
      const perGiri = checkpointOgni > 0 && turno % checkpointOgni === 0;
      const perDimensione = regolaDimensione && byteDeltaDalCheckpoint > byteUltimoCheckpoint;
      if (perGiri || perDimensione) {
        const checkpoint = `{"tipo":"checkpoint","versioneGiro":${turno},"storia":[${storiaSerializzata.join(',')}],"recordCompattazione":null}\n`;
        righeDelTurno.push(checkpoint);
        byteUltimoCheckpoint = Buffer.byteLength(checkpoint);
        byteDeltaDalCheckpoint = 0;
        checkpointScritti += 1;
      }
    }
    const byteDelTurno = righeDelTurno.reduce((s, r) => s + Buffer.byteLength(r), 0);
    if (byte + byteDelTurno > tettoByte) { fermatoPer = `tetto-byte (${tettoByte} B) prima del turno ${turno}`; if (formato === 'delta' && righeDelTurno.length === 3) checkpointScritti -= 1; break; }
    for (const r of righeDelTurno) await riga(r);
    turniRaggiunti = turno;
  }
  await new Promise((r, j) => stream.end((e) => (e ? j(e) : r())));
  return { turniRaggiunti, byte: statSync(percorso).size, fermatoPer, msGenerazione: Math.round(performance.now() - inizio), checkpointScritti, messaggiAttesi: turniRaggiunti * 4 };
}

// ───────────────────────────── replay a stream (consumatore) ─────────────────────────────

/**
 * Il consumatore che la corsia B scriverà nel registro, in piccolo: tiene SOLO l'ultimo checkpoint e i delta
 * venuti dopo (formato delta), oppure solo l'ultimo `messaggi-finali` (formato oggi). Ogni altro record passa
 * e viene lasciato andare. Ritorna la storia ricostruita e quante incoerenze di `da` ha visto.
 */
function consumatoreDiReplay() {
  let checkpoint = null;
  let delta = [];
  let ultimiFinali = null;
  let record = 0;
  return {
    perRiga(r) {
      record += 1;
      if (r.tipo === 'checkpoint') { checkpoint = r; delta = []; }
      else if (r.tipo === 'messaggi-delta') delta.push(r);
      else if (r.tipo === 'messaggi-finali') ultimiFinali = r.messaggiFinali;
    },
    ricostruisci() {
      if (ultimiFinali) return { storia: ultimiFinali, incoerenze: 0, record, checkpointVisto: null, deltaDopo: 0 };
      const storia = checkpoint ? [...checkpoint.storia] : [];
      let incoerenze = 0;
      for (const d of delta) {
        if (d.da !== storia.length) incoerenze += 1;
        storia.push(...d.messaggi);
      }
      return { storia, incoerenze, record, checkpointVisto: checkpoint?.versioneGiro ?? null, deltaDopo: delta.length };
    },
  };
}

// ───────────────────────────── figlio: una misura ─────────────────────────────

async function misuraFiglio(opzioni) {
  const turni = opzioni.turni[0];
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-bench-journal-'));
  const sessionId = 'sintetica';
  const esito = { formato: opzioni.formato, turniRichiesti: turni, kbPerTurno: opzioni.kbPerTurno, checkpointOgni: opzioni.checkpointOgni, regolaDimensione: opzioni.regolaDimensione };
  let picco = process.memoryUsage().rss;
  const campione = setInterval(() => { picco = Math.max(picco, process.memoryUsage().rss); }, 25);
  const fase = () => { picco = process.memoryUsage().rss; };
  const piccoFase = () => Math.max(picco, process.memoryUsage().rss);
  try {
    Object.assign(esito, await generaJournal(join(cartellaStore, `${sessionId}.jsonl`), { formato: opzioni.formato, turni, kbPerTurno: opzioni.kbPerTurno, tettoByte: opzioni.tettoMb * 1024 * 1024, checkpointOgni: opzioni.checkpointOgni, regolaDimensione: opzioni.regolaDimensione }));
    esito.rssPiccoGenerazione = piccoFase();

    // 1. replay a stream: il percorso del prodotto (corsia B lo cabla nel registro).
    fase();
    let inizio = performance.now();
    try {
      const consumatore = consumatoreDiReplay();
      const lettura = await leggiRegistroAStream({ cartellaStore, sessionId, perRiga: consumatore.perRiga });
      const ricostruita = consumatore.ricostruisci();
      esito.msReplayStream = Math.round(performance.now() - inizio);
      esito.recordStream = lettura.record;
      esito.messaggiRicostruiti = ricostruita.storia.length;
      esito.incoerenzeDa = ricostruita.incoerenze;
      esito.checkpointUsato = ricostruita.checkpointVisto;
      esito.deltaDopoCheckpoint = ricostruita.deltaDopo;
      esito.riparazione = lettura.riparazione ?? null;
    } catch (errore) {
      esito.msReplayStream = Math.round(performance.now() - inizio);
      esito.replayStreamFallito = `${errore?.code ?? errore?.name ?? 'Error'}: ${errore?.message ?? String(errore)}`;
    }
    esito.rssPiccoStream = piccoFase();

    // 2. l'array intero (`leggiRegistro`, contratto vecchio) — per confronto, sotto un tetto dichiarato.
    fase();
    if (esito.byte > opzioni.tettoArrayMb * 1024 * 1024) {
      esito.letturaArraySaltata = `file ${esito.byte} B > tetto array ${opzioni.tettoArrayMb} MiB`;
    } else {
      inizio = performance.now();
      try {
        const record = await leggiRegistro({ cartellaStore, sessionId });
        esito.msLettura = Math.round(performance.now() - inizio);
        esito.recordLetti = record.length;
      } catch (errore) {
        esito.msLettura = Math.round(performance.now() - inizio);
        esito.letturaFallita = `${errore?.code ?? errore?.name ?? 'Error'}: ${errore?.message ?? String(errore)}`;
      }
    }
    esito.rssPiccoArray = piccoFase();
    esito.rssPiccoByte = Math.max(esito.rssPiccoGenerazione, esito.rssPiccoStream, esito.rssPiccoArray);
  } finally {
    clearInterval(campione);
    await rimuoviCartellaDiProvaAttesa(cartellaStore);
  }
  process.stdout.write(`${JSON.stringify(esito)}\n`);
}

// ───────────────────────────── genitore: tre giri, mediana, tabella ─────────────────────────────

function lanciaFiglio(turni, opzioni) {
  return new Promise((resolve) => {
    const args = [QUI, '--figlio', '--formato', opzioni.formato, '--turni', String(turni), '--kb-per-turno', String(opzioni.kbPerTurno), '--checkpoint-ogni', String(opzioni.checkpointOgni), '--regola-dimensione', opzioni.regolaDimensione ? '1' : '0', '--tetto-mb', String(opzioni.tettoMb), '--tetto-array-mb', String(opzioni.tettoArrayMb)];
    const figlio = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let out = '';
    let err = '';
    figlio.stdout.on('data', (d) => { out += d; });
    figlio.stderr.on('data', (d) => { err += d; });
    figlio.on('close', (codice, segnale) => {
      const ultima = out.trim().split('\n').pop();
      try { resolve({ ...JSON.parse(ultima), codiceUscita: codice }); }
      catch { resolve({ turniRichiesti: turni, figlioMorto: true, codiceUscita: codice, segnale, stderr: err.slice(-2000) }); }
    });
  });
}

const mediana = (valori) => {
  const v = valori.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2);
};
const mb = (b) => (b == null ? '—' : `${(b / 1024 / 1024).toFixed(1)} MB`);

async function genitore(opzioni) {
  const risultati = [];
  for (const turni of opzioni.turni) {
    const giri = [];
    for (let g = 1; g <= opzioni.giri; g++) {
      process.stderr.write(`[bench] formato ${opzioni.formato}, ${turni} turni, giro ${g}/${opzioni.giri}…\n`);
      giri.push(await lanciaFiglio(turni, opzioni));
    }
    risultati.push({
      formato: opzioni.formato,
      turniRichiesti: turni,
      turniRaggiunti: mediana(giri.map((x) => x.turniRaggiunti)),
      fermatoPer: giri.map((x) => x.fermatoPer ?? x.replayStreamFallito ?? x.letturaFallita ?? (x.figlioMorto ? `figlio morto (uscita ${x.codiceUscita}${x.segnale ? `, ${x.segnale}` : ''})` : null)).find(Boolean) ?? null,
      byte: mediana(giri.map((x) => x.byte)),
      checkpointScritti: mediana(giri.map((x) => x.checkpointScritti)),
      msGenerazione: mediana(giri.map((x) => x.msGenerazione)),
      msReplayStream: mediana(giri.map((x) => x.msReplayStream)),
      replayStreamRiuscito: giri.every((x) => x.messaggiRicostruiti != null),
      messaggiRicostruiti: mediana(giri.map((x) => x.messaggiRicostruiti)),
      messaggiAttesi: mediana(giri.map((x) => x.messaggiAttesi)),
      incoerenzeDa: mediana(giri.map((x) => x.incoerenzeDa)),
      rssPiccoStream: mediana(giri.map((x) => x.rssPiccoStream)),
      msLettura: mediana(giri.map((x) => x.msLettura)),
      letturaRiuscita: giri.every((x) => x.recordLetti != null),
      letturaArraySaltata: giri.map((x) => x.letturaArraySaltata).find(Boolean) ?? null,
      recordLetti: mediana(giri.map((x) => x.recordLetti)),
      rssPiccoArray: mediana(giri.map((x) => x.rssPiccoArray)),
      rssPiccoByte: mediana(giri.map((x) => x.rssPiccoByte)),
      giri,
    });
  }
  const colonnaArray = (r) => (r.letturaArraySaltata ? `saltata (${r.letturaArraySaltata})` : r.letturaRiuscita ? `${r.msLettura}` : `FALLITA (${r.msLettura ?? '—'})`);
  const colonnaStream = (r) => (r.replayStreamRiuscito ? `${r.msReplayStream}` : `FALLITA (${r.msReplayStream ?? '—'})`);
  const colonnaMessaggi = (r) => (r.messaggiRicostruiti == null ? '—' : `${r.messaggiRicostruiti}/${r.messaggiAttesi}${r.incoerenzeDa ? ` (⛔ ${r.incoerenzeDa} incoerenze)` : ''}`);
  const righe = [
    '| formato | turni richiesti | turni raggiunti | byte journal | checkpoint | ms generazione | ms replay stream | messaggi ricostruiti | picco RSS stream | ms leggiRegistro (array) | record | picco RSS array | fermato per |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
    ...risultati.map((r) => `| ${r.formato} | ${r.turniRichiesti} | ${r.turniRaggiunti ?? '—'} | ${mb(r.byte)} | ${r.checkpointScritti ?? '—'} | ${r.msGenerazione ?? '—'} | ${colonnaStream(r)} | ${colonnaMessaggi(r)} | ${mb(r.rssPiccoStream)} | ${colonnaArray(r)} | ${r.recordLetti ?? '—'} | ${mb(r.rssPiccoArray)} | ${r.fermatoPer ?? '—'} |`),
  ];
  const rapporto = { data: new Date().toISOString(), node: process.version, opzioni: { ...opzioni, figlio: undefined }, mediane: 'per colonna sui giri', risultati };
  console.log(righe.join('\n'));
  if (opzioni.out) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(opzioni.out, `${JSON.stringify(rapporto, null, 2)}\n`);
    console.log(`\nJSON scritto in ${opzioni.out}`);
  }
}

const opzioni = argomenti(process.argv.slice(2));
if (opzioni.figlio) await misuraFiglio(opzioni);
else await genitore(opzioni);
