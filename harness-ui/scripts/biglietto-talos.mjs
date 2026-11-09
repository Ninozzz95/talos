#!/usr/bin/env node
/*
 * ⛔ «GETTONE SEMPRE» (owner 02/11/2026): gli attrezzi di chi avvia un server da sorgente, e il comando dei biglietti del Tester.
 *
 *   node harness-ui/scripts/biglietto-talos.mjs [--porta 4174] [--apri]
 *     stampa un link d'ingresso monouso da 60 secondi; con `--apri` lo apre nel browser della persona.
 *
 * Chi avvia il server (il lanciatore del 4174) conosce il gettone e scrive qui accanto SOLO la chiave derivata (`chiaveDeiBiglietti`), in
 * `~/.talos-biglietti/<porta>.chiave`, leggibile solo dall'utente (condizione del Tester). Il gettone non tocca il disco; quello che il browser tiene nel profilo è un
 * valore derivato (`valoreDelCookie`), che vale comunque finché il server vive.
 * ⛔ Per il modello quel file è una credenziale della casa e questo comando chiede la carta, anche in Accesso pieno (`path-policy.mjs`), condizione del Tester e punto
 *   aperto del Desktop nella forma. È attrito sul testo del comando, non un confine: chi lo copia sotto un altro nome non lo si vede.
 */
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CAMPO_BIGLIETTO, CARTELLA_CHIAVI_BIGLIETTI, chiaveDeiBiglietti, creaBiglietto, creaGettone, NOME_COOKIE } from '../src/gettone.mjs';

export function percorsoChiave(porta, casa = homedir()) {
  return join(casa, CARTELLA_CHIAVI_BIGLIETTI, `${porta}.chiave`);
}

/** Solo l'utente: su Windows la modalità del file non conta, servono le ACL. Se non si riesce a stringerle il file non resta. */
function soloDellUtente(file, icacls = spawnSync) {
  if (process.platform !== 'win32') { chmodSync(file, 0o600); return; }
  const esito = icacls('icacls', [file, '/inheritance:r', '/grant:r', `${userInfo().username}:F`], { windowsHide: true, encoding: 'utf8' });
  if (esito.status !== 0) {
    rmSync(file, { force: true });
    throw Object.assign(new Error('TICKET_KEY_NOT_PRIVATE: the ticket key could not be made readable by this user only.'), { code: 'TICKET_KEY_NOT_PRIVATE' });
  }
}

/** La chiave derivata dal gettone, per il comando dei biglietti. Temporaneo + rename: una scrittura a metà non lascia una chiave rotta. */
export function salvaChiaveDeiBiglietti(porta, gettone, casa = homedir()) {
  const file = percorsoChiave(porta, casa);
  mkdirSync(join(casa, CARTELLA_CHIAVI_BIGLIETTI), { recursive: true, mode: 0o700 });
  const temporaneo = `${file}.${process.pid}.tmp`;
  writeFileSync(temporaneo, chiaveDeiBiglietti(gettone).toString('hex'), { encoding: 'utf8', mode: 0o600 });
  soloDellUtente(temporaneo);
  renameSync(temporaneo, file);
  return file;
}

/** `null` se quella porta non ha una chiave (un server avviato da altri, o senza gettone). */
export function leggiChiaveDeiBiglietti(porta, casa = homedir()) {
  try {
    const testo = readFileSync(percorsoChiave(porta, casa), 'utf8').trim();
    return /^[0-9a-f]{64}$/u.test(testo) ? Buffer.from(testo, 'hex') : null;
  } catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw errore;
  }
}

export function linkDiIngresso(base, chiave, { dopo = '' } = {}) {
  return `${base}/?${CAMPO_BIGLIETTO}=${creaBiglietto(chiave)}${dopo}`;
}

/** Per chi avvia un server: il gettone nuovo, la riga per lo stdin, e l'ambiente del figlio. Mai il gettone nell'ambiente. */
export function preparaAvvioColGettone(env) {
  const gettone = creaGettone();
  const ambiente = Object.fromEntries(Object.entries(env).filter(([k]) => !/^TALOS_HARNESS_UI_TOKEN$/iu.test(k)));
  ambiente.TALOS_HARNESS_UI_SEGRETI_DA = 'stdin';
  return { gettone, ambiente, stdin: `TALOS_HARNESS_UI_TOKEN=${gettone}\n`, cookie: `${NOME_COOKIE}=${gettone}` };
}

/** Il cookie di un server già acceso, entrando con un biglietto: serve al lanciatore per lo stop gentile. Resta in memoria, non si stampa. */
export async function cookieDalBiglietto(base, chiave, fetchFn = fetch) {
  const risposta = await fetchFn(linkDiIngresso(base, chiave), { redirect: 'manual' });
  const cookie = risposta.headers.get('set-cookie');
  return risposta.status === 302 && cookie ? cookie.split(';', 1)[0] : null;
}

/** `cmd /c start`, l'URL come argomento a sé. Il comando porta un biglietto, mai il gettone (Hermes: «a launcher's argv carries this, not the token»). */
export function apriNelBrowser(link) {
  spawn('cmd', ['/c', 'start', '', link], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function principale(argomenti) {
  const i = argomenti.indexOf('--porta');
  const porta = i === -1 ? 4174 : Number(argomenti[i + 1]);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) { console.error('--porta wants a port number'); return 2; }
  const chiave = leggiChiaveDeiBiglietti(porta);
  if (!chiave) { console.error(`No ticket key for port ${porta}: this server was not started by a launcher that keeps one. / Nessuna chiave per la porta ${porta}: questo server non l'ha avviato un lanciatore che la tiene.`); return 1; }
  const link = linkDiIngresso(`http://127.0.0.1:${porta}`, chiave);
  if (argomenti.includes('--apri')) apriNelBrowser(link);
  else console.log(link);
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) process.exitCode = principale(process.argv.slice(2));
