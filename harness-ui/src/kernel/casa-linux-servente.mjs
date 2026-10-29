/*
 * ⛔⛔ Fase B «casa di esecuzione» (owner 01/10/2026) — il SERVENTE: gira dentro WSL, col Node per Linux che TALOS porta (eseguito
 *   da C:, niente installato nella distro), e fa una cosa sola: esegue le funzioni dei file DEL KERNEL STESSO sui percorsi di
 *   Linux. Nessuna seconda implementazione: è il modulo `talosHarness.mjs` di sempre, importato di qua (misurato il 01/10:
 *   l'import da /mnt/c costa ~290 ms, una volta per sessione; `leggiTestoLimitato` legge i percorsi Linux e segue i collegamenti).
 *   È la forma «locale/remoto dietro la stessa interfaccia» di Zed (server remoto alla stessa versione del client).
 *
 * Protocollo, una riga JSON per messaggio su stdin/stdout:
 *   → { id, op, args }          ← { id, ok: true, valore } | { id, ok: false, errore: { message, code, path, name } }
 *   → { annulla: id }           (lo Stop di quella richiesta: il suo AbortSignal si accende)
 *   stdin chiuso ⇒ si fermano le ricerche vive e si esce.
 * ⛔ Su stdout passano SOLO righe del protocollo: un `console.log` del kernel finirebbe nel canale, quindi si sposta su stderr.
 * Permessi, ricevute, «leggi prima di sostituire» e punti di controllo restano dal lato Windows: qui si esegue soltanto.
 */
import { createInterface } from 'node:readline';
import { userInfo } from 'node:os';
import { stat } from 'node:fs/promises';
import { realpathSync, writeSync } from 'node:fs';
import { posix } from 'node:path';
import { rigaJson } from './riga-json.mjs';

const rg = process.argv[2];
if (rg) process.env.TALOS_RG_PATH = rg;
/* 22/10/2026: `rigaJson` — un file con U+2028 spezzava la risposta nel `readline` del cliente, e la chiamata restava appesa */
const scriviRiga = (oggetto) => process.stdout.write(rigaJson(oggetto));
console.log = (...parti) => process.stderr.write(`${parti.map(String).join(' ')}\n`);

const kernel = await import('./talosHarness.mjs');
const { creaRegistroRicerche } = await import('./ricerche-in-corso.mjs');
const { pezzoConSeparatore } = await import('./accoda-con-a-capo.mjs');
const { bloccataDa } = await import('../path-policy.mjs');
const ricerche = creaRegistroRicerche();

/*
 * ⛔ Revisione del blocco 11, A-R1 (27/10/2026) — le CARTELLE BLOCCATE per il dispositivo del giro, nella casa Linux. Il lato Windows
 *   manda le radici bloccate nella vista Linux (`bloccati`, `/mnt/c/…`) e quelle sotto la radice relative a lei (`escludi`, per rg);
 *   qui si costruisce lo STESSO `salta` della strada di Windows (`saltaBloccata` in talosHarness.mjs): una cartella bloccata si nomina
 *   ma non ci si entra, e la camminata di `cerca` non ne legge i file. Come `bloccataDa` e Claude Code («Deny rules apply when either
 *   the requested path or the file it resolves to matches», code.claude.com/docs/en/permissions), si guarda il percorso chiesto E
 *   quello vero (un collegamento dentro la cartella che porta alla bloccata). Un percorso vero che non si sa dire si salta (chiuso a
 *   guasto).
 * ⛔ Il percorso vero si chiede QUI, a Linux: un collegamento creato da WSL su /mnt/c (`ln -s`) è un punto di rianalisi che Windows
 *   non segue, quindi il `realpath` del lato Windows (`bloccataDa`) lo vede come un file qualunque — misurato il 27/10/2026: `leggi`,
 *   `elenca` e `file_edit` attraverso un collegamento così leggevano e cambiavano il segreto. Per questo anche il controllo dei singoli
 *   attrezzi, nella casa Linux, ripassa di qui (operazione `bloccata`).
 * Senza `bloccati` (la persona al PC, o un giro senza blocchi) `salta` non c'è e tutto va come prima, byte per byte.
 */
/* Il percorso vero anche di un file che non c'è ancora: quello del genitore più vicino che esiste, più il resto (come
   `percorsoRealeAncheSeManca` in path-policy.mjs, coi percorsi di Linux). */
function percorsoVeroLinux(assoluto) {
  const resto = [];
  let corrente = assoluto;
  for (;;) {
    try { return posix.join(realpathSync(corrente), ...resto); }
    catch (errore) {
      if (errore?.code !== 'ENOENT' && errore?.code !== 'ENOTDIR') throw errore;
      const padre = posix.dirname(corrente);
      if (padre === corrente) return assoluto;
      resto.unshift(posix.basename(corrente));
      corrente = padre;
    }
  }
}
/* La radice bloccata che contiene `percorso` (relativo a `radice`, o assoluto di Linux): `{ radice }`, `{ radice, irrisolvibile }`, o null. */
function bloccataNellaCasa(radice, percorso, bloccati) {
  const assoluto = posix.resolve(radice, String(percorso ?? ''));
  const perNome = bloccataDa(assoluto, { bloccati });
  if (perNome) return perNome;
  let vero;
  try { vero = percorsoVeroLinux(assoluto); } catch { return { radice: bloccati[0], irrisolvibile: true }; }
  return vero === assoluto ? null : bloccataDa(vero, { bloccati });
}
const conBlocchi = (bloccati) => Array.isArray(bloccati) && bloccati.some((b) => typeof b === 'string' && b !== '');
function saltaDi(radice, bloccati) {
  if (!conBlocchi(bloccati)) return null;
  return (percorso) => Boolean(bloccataNellaCasa(radice, percorso, bloccati));
}

const OPERAZIONI = Object.freeze({
  ping: async () => ({ node: process.version, pid: process.pid, utente: userInfo().username, uid: process.getuid?.() ?? null }),
  leggiTestoLimitato: ({ cartella, percorso, opzioni = {} }, segnale) => kernel.leggiTestoLimitato(cartella, percorso, { ...opzioni, segnale }),
  elenca: ({ radice, base, profondita, limite = null, cursore = null, note = [], bloccati = null }) => {
    const salta = saltaDi(radice, bloccati); // A-R1: la cartella bloccata si nomina, non ci si entra
    return kernel.elencaDaCartella(kernel.discoNode({ radice }), base,
      { ...(Number.isInteger(profondita) ? { profondita } : {}), limite, cursore, note, ...(salta ? { salta } : {}) }); // C5: depth/limit/cursor
  },
  cerca: ({ radice, argomenti, tempoRgMs, bloccati = null, escludi = [] }, segnale) => {
    const salta = saltaDi(radice, bloccati); // A-R1: rg con gli --iglob di esclusione, la camminata JS con `salta`
    return kernel.cercaNelProgetto(kernel.discoNode({ radice }), argomenti,
      { radice, segnale, ricerche, ...(Number.isFinite(tempoRgMs) ? { tempoRgMs } : {}), ...(salta ? { salta, escludi: Array.isArray(escludi) ? escludi : [] } : {}) });
  },
  discoLeggi: ({ radice, percorso }) => kernel.discoNode({ radice }).leggi(percorso),
  discoScrivi: ({ radice, percorso, testo, modalita }) => kernel.discoNode({ radice }).scrivi(percorso, testo, modalita),
  discoElenca: ({ radice, cartella }) => kernel.discoNode({ radice }).elenca(cartella),
  istantanea: async ({ percorso }) => {
    try { const s = await stat(percorso); return s.isFile() ? { mtimeMs: s.mtimeMs, size: s.size, ctimeMs: s.ctimeMs } : null; } catch { return null; }
  },
  /* C25: l'impronta sha256 dei byte, calcolata QUI dentro Linux — al lato Windows arrivano 64 caratteri, non il file */
  impronta: ({ percorso }) => kernel.improntaDelPercorso(percorso),
  pezzoConSeparatore: ({ percorso, pezzo }) => pezzoConSeparatore(percorso, pezzo),
  /* F4-03: dove finisce davvero una scrittura, coi collegamenti di Linux (il permesso resta deciso dal lato Windows). */
  posizioneNelProgetto: ({ cartella, percorso }) => kernel.posizioneNelProgetto(cartella, percorso),
  /* F4-01: i byte del file da modificare (NUL ⇒ binario, UTF-8 rigoroso), senza la decodifica tollerante di `discoLeggi`. */
  leggiPerModifica: ({ percorso }) => kernel.leggiPerModifica(percorso),
  fermaRicerche: async () => { ricerche.fermaTutte('fermata'); return true; },
  /* A-R1: la cartella bloccata che contiene un percorso, col percorso vero visto da Linux (vedi `bloccataNellaCasa`). */
  bloccata: async ({ radice, percorso, bloccati }) => (conBlocchi(bloccati) ? bloccataNellaCasa(radice, percorso, bloccati) : null),
});

const inCorso = new Map();
/* L'annuncio: il kernel è importato e stdin si legge. Prima di questa riga il client sa che nessuna richiesta è stata eseguita. */
/* SINCRONO: un annuncio rimasto in un buffer direbbe al client «non è partito» anche dopo una richiesta eseguita. */
writeSync(1, rigaJson({ pronto: true, node: process.version }));
createInterface({ input: process.stdin }).on('line', async (riga) => {
  let messaggio;
  try { messaggio = JSON.parse(riga); } catch { return; }
  if (messaggio && messaggio.annulla !== undefined) { inCorso.get(messaggio.annulla)?.abort(); return; }
  const { id, op, args } = messaggio ?? {};
  const operazione = Object.hasOwn(OPERAZIONI, op) ? OPERAZIONI[op] : null;
  if (!operazione) { scriviRiga({ id, ok: false, errore: { message: `CASA_LINUX_OPERAZIONE_IGNOTA: ${op}`, code: 'CASA_LINUX_OPERAZIONE_IGNOTA' } }); return; }
  const controllo = new AbortController();
  inCorso.set(id, controllo);
  try {
    const valore = await operazione(args ?? {}, controllo.signal);
    scriviRiga({ id, ok: true, valore: valore === undefined ? null : valore });
  } catch (errore) {
    scriviRiga({ id, ok: false, errore: { message: errore?.message ?? String(errore), code: errore?.code ?? null, path: errore?.path ?? null, name: errore?.name ?? 'Error' } });
  } finally {
    inCorso.delete(id);
  }
}).on('close', () => { ricerche.fermaTutte('fermata'); setTimeout(() => process.exit(0), 50); });
