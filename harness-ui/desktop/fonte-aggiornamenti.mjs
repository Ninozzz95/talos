/*
 * ⭐ 02/10/2026 — LA FONTE DEGLI AGGIORNAMENTI E LA SUA VARIANTE DI PROVA (passo 4 del piano: la prova di aggiornamento VERA nel
 *   CI — installare X, vedere l'app trovare X+1 da sola e passarci; un manifesto manomesso non installa niente).
 *
 * Owner, 02/10/2026: «File solo nella build di prova». La fonte vera è GitHub (`FONTE_GITHUB`) con la chiave pubblica dentro
 *   l'app. La build di PROVA del CI porta in più, nelle risorse, `aggiornamenti-prova.json`: indirizzo del server locale e
 *   chiave di prova. La build vera non lo contiene MAI (`distribuisci.mjs` si ferma se lo trova): l'app scaricata dagli
 *   utenti non ha nessuna leva.
 * ⇒ È la forma che electron-updater stesso usa per la sua configurazione: `app-update.yml` dentro `process.resourcesPath`
 *   (`electron-updater/out/ElectronAppAdapter.js:23`), scritto al momento della build, mai una variabile d'ambiente.
 * ⛔ E anche nella build di prova il file non può puntare altrove che al computer stesso: solo `http://127.0.0.1:<porta>`.
 *   Un file malformato FERMA l'aggiornatore (chi non riesce a valutare non procede), non ricade sulla fonte vera.
 */
import { createPublicKey } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const NOME_FONTE_DI_PROVA = 'aggiornamenti-prova.json';
export const FONTE_GITHUB = Object.freeze({ api: 'https://api.github.com', download: 'https://github.com' });
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

function indirizzoLocale(valore, campo) {
  let url;
  try { url = new URL(String(valore)); } catch { throw Error(`${NOME_FONTE_DI_PROVA}: «${campo}» non è un indirizzo.`); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw Error(`${NOME_FONTE_DI_PROVA}: «${campo}» deve essere http://127.0.0.1:<porta>, senza altro.`);
  }
  return url.origin;
}

/** Valida il contenuto del file: `{ api, download, repo, chiavePubblica }`. Lancia se qualcosa non torna. */
export function validaFonteDiProva(dati) {
  if (!dati || typeof dati !== 'object' || Array.isArray(dati)) throw Error(`${NOME_FONTE_DI_PROVA}: atteso un oggetto.`);
  const ammessi = new Set(['api', 'download', 'repo', 'chiavePubblica']);
  for (const chiave of Object.keys(dati)) if (!ammessi.has(chiave)) throw Error(`${NOME_FONTE_DI_PROVA}: campo sconosciuto «${chiave}».`);
  if (typeof dati.repo !== 'string' || !REPO.test(dati.repo)) throw Error(`${NOME_FONTE_DI_PROVA}: «repo» deve essere proprietario/nome.`);
  let chiave;
  try { chiave = createPublicKey(String(dati.chiavePubblica)); } catch { throw Error(`${NOME_FONTE_DI_PROVA}: «chiavePubblica» non è una chiave pubblica.`); }
  if (chiave.asymmetricKeyType !== 'ed25519') throw Error(`${NOME_FONTE_DI_PROVA}: la chiave di prova deve essere Ed25519.`);
  return Object.freeze({
    api: indirizzoLocale(dati.api, 'api'), download: indirizzoLocale(dati.download, 'download'),
    repo: dati.repo, chiavePubblica: String(dati.chiavePubblica),
  });
}

/** La fonte di prova se il file c'è nelle risorse, altrimenti `null` (la build vera). Un file malformato LANCIA. */
export function leggiFonteDiProva(cartellaRisorse, { esiste = existsSync, leggi = (p) => readFileSync(p, 'utf8') } = {}) {
  if (typeof cartellaRisorse !== 'string' || !cartellaRisorse) return null;
  const percorso = join(cartellaRisorse, NOME_FONTE_DI_PROVA);
  if (!esiste(percorso)) return null;
  let dati;
  try { dati = JSON.parse(leggi(percorso)); } catch { throw Error(`${NOME_FONTE_DI_PROVA}: JSON non leggibile.`); }
  return validaFonteDiProva(dati);
}

/**
 * La configurazione di electron-builder per la build di PROVA (solo il CI la chiede, con `TALOS_BUILD_AGGIORNAMENTI_PROVA` =
 * percorso del file e `TALOS_BUILD_VERSIONE` = x.y.z). Si aggiunge SOLO la voce nuova di `extraResources`: electron-builder
 * concatena gli elenchi della configurazione passata da codice con quelli del `package.json` (`builder-util-runtime/out/
 * objects.js:57-58`). La versione passa da `extraMetadata` (`app-builder-lib/out/packager.js:284`), che vale per il nome dei
 * file, per `latest.yml` e per `app.getVersion()`. Uscita a parte, così un pacchetto di prova non finisce mai in `dist/`.
 */
export function configurazioneBuildDiProva(fileFonte, versione, { leggi = (p) => readFileSync(p, 'utf8') } = {}) {
  if (fileFonte === undefined || fileFonte === '') return null;
  if (!/^\d+\.\d+\.\d+$/u.test(String(versione ?? ''))) throw Error('Build di prova degli aggiornamenti: serve TALOS_BUILD_VERSIONE nella forma x.y.z.');
  let dati;
  try { dati = JSON.parse(leggi(fileFonte)); } catch { throw Error(`Build di prova degli aggiornamenti: ${fileFonte} non è un JSON leggibile.`); }
  validaFonteDiProva(dati);
  return {
    extraMetadata: { version: versione },
    extraResources: [{ from: fileFonte, to: NOME_FONTE_DI_PROVA }],
    directories: { output: `dist-prova-aggiornamenti/${versione}` },
  };
}
