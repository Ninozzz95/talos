/*
 * ⭐ 01/10/2026 — L'AGGIORNAMENTO AUTOMATICO DEL GUSCIO. Owner: «un controllo automatico se ci sono aggiornamenti, aggiornare
 *   l'app … come fa Codex … Hermes e Claude … estremamente seamless, automatizzato e user friendly». Decisioni dell'owner:
 *   in background con installazione alla chiusura (o subito con «Riavvia ora»); firma Ed25519 nostra del manifesto;
 *   interruttore acceso di serie nelle Impostazioni, con «Controlla ora», versione ed esito dell'ultimo controllo.
 *
 * Come fanno gli altri (codice e documentazione letti il 01/10/2026):
 * - Claude Code: controlla all'avvio e periodicamente, scarica e installa in background, vale al prossimo avvio; `claude
 *   doctor` riporta l'ultimo tentativo (https://code.claude.com/docs/en/setup, «Auto-updates»).
 * - GitHub Desktop: ogni 4 ore (`app/src/ui/app.tsx:239`, `UpdateCheckInterval = 4 * HourInMilliseconds`).
 * - Codex: `releases/latest` al massimo ogni 20 ore, in background, MAI bloccando l'avvio (`codex-rs/tui/src/updates.rs:27-50`).
 * - Hermes (macOS): electron-updater con `autoDownload = false` e `autoInstallOnAppQuit = false`, governati a mano
 *   (`apps/desktop/electron/updater/mac-client.ts:49-50`).
 *
 * ⛔ Perché la release si cerca QUI e non col provider GitHub di electron-updater: quello prende la `latest` di tutto il repo
 *   (`out/providers/GitHubProvider.js:160-170`) e legge la versione dal tag con `/\/tag\/(v?[^/]+)$/` (riga 10). In
 *   `Ninozzz95/talos` escono tre prodotti (`desktop-v*`, `talos-cli-v*`, mobile `v*`): dopo una release della CLI la «latest»
 *   sarebbe la sua. ⇒ Si chiede l'elenco delle release, si tiene la `desktop-vX.Y.Z` più alta (non bozza, non pre-release), e
 *   electron-updater si punta, con il provider `generic`, sulla cartella di download di QUEL tag.
 * ⛔ Perché due controlli dell'impronta: electron-updater rilegge `latest.yml` per conto suo e confronta lo sha512 del file
 *   con QUELLO. Fra la nostra lettura verificata e la sua il file potrebbe cambiare. ⇒ Dopo lo scaricamento si ricontrolla lo
 *   sha512 del file contro il manifesto VERIFICATO; solo allora l'installazione alla chiusura si accende.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { NOME_FIRMA, NOME_MANIFESTO, leggiManifesto, verificaFirmaManifesto } from './firma-aggiornamenti.mjs';
import { FONTE_GITHUB } from './fonte-aggiornamenti.mjs';

export const REPO_PREDEFINITO = 'Ninozzz95/talos';
export const INTERVALLO_MS = 4 * 60 * 60 * 1000;
export const RITARDO_PRIMO_CONTROLLO_MS = 30_000;
const TAG = /^desktop-v(\d+)\.(\d+)\.(\d+)$/u;
const VERSIONE = /^(\d+)\.(\d+)\.(\d+)$/u;

/** −1, 0 o 1 fra due versioni `x.y.z`; una versione non valida è un errore, non un «uguale». */
export function confrontaVersioni(a, b) {
  const pa = VERSIONE.exec(String(a)); const pb = VERSIONE.exec(String(b));
  if (!pa || !pb) throw Error(`Versione non confrontabile: ${a} / ${b}`);
  for (let i = 1; i <= 3; i += 1) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Dall'elenco delle release di GitHub, la desktop più alta e PIÙ NUOVA dell'installata; altrimenti `null`. */
export function sceltaRelease(release, versioneAttuale) {
  let migliore = null;
  for (const r of Array.isArray(release) ? release : []) {
    if (!r || r.draft || r.prerelease || typeof r.tag_name !== 'string') continue;
    const m = TAG.exec(r.tag_name);
    if (!m) continue;
    const versione = `${m[1]}.${m[2]}.${m[3]}`;
    if (confrontaVersioni(versione, versioneAttuale) <= 0) continue;
    if (!migliore || confrontaVersioni(versione, migliore.versione) > 0) {
      migliore = { tag: r.tag_name, versione, pagina: typeof r.html_url === 'string' ? r.html_url : null };
    }
  }
  return migliore;
}

async function chiedi(fetch, url, opzioni = {}) {
  const risposta = await fetch(url, { redirect: 'follow', ...opzioni });
  if (!risposta.ok) throw Error(`${url} ha risposto ${risposta.status}`);
  return risposta;
}

export async function trovaUltimaRelease({ fetch, repo = REPO_PREDEFINITO, versioneAttuale, api = FONTE_GITHUB.api }) {
  const risposta = await chiedi(fetch, `${api}/repos/${repo}/releases?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'TALOS-Desktop' },
  });
  return sceltaRelease(await risposta.json(), versioneAttuale);
}

/** Scarica `latest.yml` e la sua firma dalla cartella del tag; il manifesto vale solo se la firma torna e la versione è quella. */
export async function leggiManifestoVerificato({ fetch, base, versione, chiavePubblica }) {
  const [manifesto, firma] = await Promise.all([
    chiedi(fetch, `${base}/${NOME_MANIFESTO}`).then((r) => r.arrayBuffer()),
    chiedi(fetch, `${base}/${NOME_FIRMA}`).then((r) => r.text()),
  ]);
  const byte = Buffer.from(manifesto);
  if (!verificaFirmaManifesto(byte, firma, chiavePubblica)) {
    throw Error('La firma del manifesto non è valida: l’aggiornamento non viene scaricato.');
  }
  const letto = leggiManifesto(byte.toString('utf8'));
  if (letto.version !== versione) throw Error(`Il manifesto firmato dice ${letto.version}, la release è ${versione}.`);
  return letto;
}

export async function sha512DelFile(percorso) {
  const hash = createHash('sha512');
  for await (const pezzo of createReadStream(percorso)) hash.update(pezzo);
  return hash.digest('base64');
}

/**
 * L'aggiornatore. Tutto ciò che tocca il mondo arriva da fuori (`updater` = l'autoUpdater di electron-updater, `fetch`,
 * `impostazioni`, il tempo): le prove lo esercitano senza Electron e senza rete.
 */
export function creaAggiornatore({
  updater, fetch, chiavePubblica, versioneAttuale, impostazioni, repo = REPO_PREDEFINITO, fonte = FONTE_GITHUB, // fonte: `fonte-aggiornamenti.mjs`
  pianifica = setTimeout, annulla = clearTimeout, ora = () => new Date(), registra = () => {}, notifica = () => {},
  calcolaSha512 = sha512DelFile,
}) {
  updater.autoDownload = false; // scarica solo DOPO la verifica della firma
  updater.autoInstallOnAppQuit = false; // si accende solo dopo il secondo controllo dell'impronta
  /*
   * ⛔⛔ L'AGGANCIO DELL'INSTALLAZIONE ALLA CHIUSURA (01/10/2026, letto in electron-updater 6.8.9 prima di collegarlo).
   *   `BaseUpdater.executeDownload` emette `update-downloaded` e SUBITO DOPO chiama `addQuitHandler`, che aggancia
   *   l'installazione alla chiusura SOLO se `autoInstallOnAppQuit` è vero in quell'istante (`out/BaseUpdater.js:28-34`, `:69-73`);
   *   alla chiusura il gestore RILEGGE il valore (`:79`). La prima stesura lo teneva falso fino al secondo controllo: l'aggancio
   *   non avveniva mai, e «si installa quando chiudi l'app» non sarebbe mai successo (prova AGG-CHIUSURA-01).
   *   ⇒ Vero allo scaricamento (l'aggancio avviene), poi falso nella microtask dell'evento — prima che un evento di chiusura
   *   possa arrivare — e vero solo dopo lo sha512 contro il manifesto firmato, se l'interruttore è acceso.
   */
  let verificato = false;
  updater.on?.('update-downloaded', () => { queueMicrotask(() => { if (!verificato) updater.autoInstallOnAppQuit = false; }); });
  const salvate = impostazioni.leggi() ?? {};
  const stato = {
    stato: 'fermo', versioneAttuale, automatici: salvate.automatici !== false,
    ultimoControllo: salvate.ultimoControllo ?? null, pronto: null, errore: null,
  };
  let timer = null;
  let inCorso = null;

  const pubblico = () => structuredClone(stato);
  const annuncia = () => { try { notifica(pubblico()); } catch (e) { registra('notifica', e); } };
  const salva = () => impostazioni.scrivi({ automatici: stato.automatici, ultimoControllo: stato.ultimoControllo });
  const programma = (ms) => { if (timer) annulla(timer); timer = stato.automatici ? pianifica(() => { timer = null; void controlla(); }, ms) : null; };

  async function esegui() {
    const release = await trovaUltimaRelease({ fetch, repo, versioneAttuale, api: fonte.api });
    if (!release) return { esito: 'aggiornato' };
    const base = `${fonte.download}/${repo}/releases/download/${release.tag}`;
    const manifesto = await leggiManifestoVerificato({ fetch, base, versione: release.versione, chiavePubblica });
    stato.stato = 'scaricamento'; annuncia();
    updater.setFeedURL({ provider: 'generic', url: base });
    const risultato = await updater.checkForUpdates();
    // `null` = aggiornatore spento (app non impacchettata); `isUpdateAvailable: false` = per lui non c'è niente: `downloadUpdate`
    // fallirebbe («Please check update first»), e una versione diversa vuol dire un manifesto diverso da quello verificato.
    if (!risultato?.isUpdateAvailable || !risultato.updateInfo || risultato.updateInfo.version !== manifesto.version) {
      throw Error('Il server ha risposto con un manifesto diverso da quello verificato: aggiornamento annullato.');
    }
    verificato = false;
    updater.autoInstallOnAppQuit = true; // solo per l'aggancio: lo spegne la microtask di `update-downloaded`, vedi sopra
    const scaricati = await updater.downloadUpdate().finally(() => { if (!verificato) updater.autoInstallOnAppQuit = false; });
    const file = scaricati?.find((p) => typeof p === 'string' && p.toLowerCase().endsWith('.exe'));
    if (!file) throw Error('Lo scaricamento non ha prodotto l’installer.');
    if (await calcolaSha512(file) !== manifesto.sha512) {
      throw Error('L’installer scaricato non corrisponde al manifesto firmato: non verrà installato.');
    }
    verificato = true;
    stato.pronto = { versione: manifesto.version, pagina: release.pagina };
    updater.autoInstallOnAppQuit = stato.automatici;
    return { esito: 'pronto' };
  }

  async function controlla({ manuale = false } = {}) {
    if (inCorso) return inCorso;
    if (stato.pronto) { annuncia(); return pubblico(); } // già scaricato e verificato: si aspetta la chiusura
    if (!stato.automatici && !manuale) return pubblico();
    stato.stato = 'controllo'; stato.errore = null; annuncia();
    inCorso = (async () => {
      try {
        const { esito } = await esegui();
        stato.stato = esito;
      } catch (errore) {
        stato.stato = 'errore'; stato.errore = String(errore?.message || errore);
        stato.pronto = null; updater.autoInstallOnAppQuit = false;
        registra('aggiornamento', errore);
      } finally {
        stato.ultimoControllo = { quando: ora().toISOString(), esito: stato.stato, errore: stato.errore };
        try { salva(); } catch (e) { registra('impostazioni', e); }
        inCorso = null;
        programma(INTERVALLO_MS);
        annuncia();
      }
      return pubblico();
    })();
    return inCorso;
  }

  return {
    avvia() { programma(RITARDO_PRIMO_CONTROLLO_MS); annuncia(); },
    controlla,
    impostaAutomatici(acceso) {
      stato.automatici = acceso === true;
      updater.autoInstallOnAppQuit = stato.automatici && Boolean(stato.pronto);
      try { salva(); } catch (e) { registra('impostazioni', e); }
      programma(stato.automatici ? RITARDO_PRIMO_CONTROLLO_MS : 0);
      annuncia();
      return pubblico();
    },
    /** Installa SUBITO l'aggiornamento già scaricato e verificato; senza, non fa niente. */
    riavviaOra() {
      if (!stato.pronto) return false;
      updater.quitAndInstall(true, true);
      return true;
    },
    stato: pubblico,
    ferma() { if (timer) annulla(timer); timer = null; },
  };
}
