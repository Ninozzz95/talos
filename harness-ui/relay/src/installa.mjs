/*
 * talos-relay — scarica, verifica ed estrae il binario fissato (R5.9).
 *
 * L'ordine conta: l'archivio si scarica TUTTO in memoria, si controllano peso e sha256, e solo dopo tocca il disco. Un archivio
 * sbagliato non lascia niente dietro di sé. Estratto il binario, se ne registra l'impronta accanto: a ogni avvio si ricontrolla,
 * e un binario cambiato sul disco si riscarica invece di eseguirlo.
 *
 * L'estrazione usa il `tar` del sistema (Linux, macOS, e Windows 10+ che legge anche gli zip): nessuna dipendenza in più.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { VERSIONE, binarioPer } from './binari.mjs';

const esegui = promisify(execFile);
const sha256 = (byte) => createHash('sha256').update(byte).digest('hex');

function errore(code, message) {
  return Object.assign(new Error(message), { code });
}

/*
 * ⛔ Su Windows il `tar` del PATH può essere il GNU tar di Git (Git Bash, MSYS): legge «C:» come un host remoto e non apre gli
 *   zip. Si chiama quello di sistema, bsdtar in System32, che legge anche gli zip (misurato il 18/10/2026: la prima prova falliva
 *   con «Cannot connect to C: resolve failed»).
 */
export function comandoTar(platform = process.platform, env = process.env) {
  return platform === 'win32' ? join(env.SystemRoot || env.windir || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
}

async function estraiCon(archivio, cartella) {
  await esegui(comandoTar(), ['-xf', archivio, '-C', cartella]);
}

async function cerca(cartella, nome) {
  for (const voce of await readdir(cartella, { withFileTypes: true })) {
    const percorso = join(cartella, voce.name);
    if (voce.isFile() && voce.name === nome) return percorso;
    if (voce.isDirectory()) {
      const dentro = await cerca(percorso, nome);
      if (dentro) return dentro;
    }
  }
  return null;
}

/** Dove sta il binario installato, e la sua impronta registrata. */
export function percorsiDelBinario(cartellaDati, binario = binarioPer()) {
  const cartella = join(cartellaDati, 'bin');
  const nome = binario.eseguibile.replace('iroh-relay', `iroh-relay-${VERSIONE}`);
  return { cartella, eseguibile: join(cartella, nome), impronta: join(cartella, `${nome}.sha256`) };
}

/**
 * Il binario pronto da eseguire. Lo scarica solo se manca o se non è più quello estratto la prima volta.
 * `deps.fetch`, `deps.binario` e `deps.estrai` servono alle prove.
 */
export async function installa(cartellaDati, deps = {}) {
  const binario = deps.binario ?? binarioPer();
  const recupera = deps.fetch ?? globalThis.fetch;
  const estrai = deps.estrai ?? estraiCon;
  const dove = percorsiDelBinario(cartellaDati, binario);

  const registrata = await readFile(dove.impronta, 'utf8').then((s) => s.trim()).catch(() => null);
  if (registrata) {
    const attuale = await readFile(dove.eseguibile).then(sha256).catch(() => null);
    if (attuale === registrata) return { eseguibile: dove.eseguibile, scaricato: false };
    deps.avvisa?.(attuale ? 'The installed iroh-relay changed on disk: downloading it again.' : 'The iroh-relay binary is missing: downloading it again.');
  }

  const risposta = await recupera(binario.url, { redirect: 'follow' });
  if (!risposta.ok) throw errore('RELAY_DOWNLOAD', `Download of ${binario.file} failed: HTTP ${risposta.status}.`);
  const byte = Buffer.from(await risposta.arrayBuffer());
  if (byte.length !== binario.byte) throw errore('RELAY_DOWNLOAD_SIZE', `${binario.file} is ${byte.length} bytes, expected ${binario.byte}: refusing it.`);
  const impronta = sha256(byte);
  if (impronta !== binario.sha256) throw errore('RELAY_DOWNLOAD_HASH', `${binario.file} has sha256 ${impronta}, expected ${binario.sha256}: refusing it.`);

  await mkdir(dove.cartella, { recursive: true });
  const lavoro = await mkdtemp(join(dove.cartella, '.estrai-'));
  try {
    const archivio = join(lavoro, binario.file);
    await writeFile(archivio, byte);
    const estratti = join(lavoro, 'x');
    await mkdir(estratti);
    await estrai(archivio, estratti);
    const trovato = await cerca(estratti, binario.eseguibile);
    if (!trovato) throw errore('RELAY_ARCHIVE', `${binario.file} does not contain ${binario.eseguibile}.`);
    await chmod(trovato, 0o755);
    await rm(dove.eseguibile, { force: true });
    await rename(trovato, dove.eseguibile);
    await writeFile(dove.impronta, `${sha256(await readFile(dove.eseguibile))}\n`);
  } finally {
    await rm(lavoro, { recursive: true, force: true });
  }
  return { eseguibile: dove.eseguibile, scaricato: true };
}
