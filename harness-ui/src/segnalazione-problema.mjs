/*
 * ⭐ «SEGNALA UN PROBLEMA» — la parte del server (owner 29/10/2026, quattro risposte sul bozzetto interattivo; contratto col motore
 *   accettato dalla CLI il 29/10 con due note). Qui stanno due cose sole:
 *   · la PULIZIA, una per tutto: la diagnostica e anche titolo e descrizione che scrive il modello passano dalla stessa funzione prima
 *     di arrivare a schermo (nota (a) della CLI: il modello può aver citato un pezzo di codice o una chiave incollata);
 *   · la DIAGNOSTICA, costruita da fatti già in forma (codici, numeri di versione, interruttori): le parole le mette l'interfaccia
 *     (owner 03/10, «le frasi del kernel sono codici»).
 * ⛔ Mai percorsi di cartelle o file, testo dei messaggi, chiavi o gettoni, nomi utente o nome del PC (owner 29/10). La segnalazione su
 *   GitHub è PUBBLICA: ciò che esce di qui finisce in una pagina che chiunque legge.
 * Come fa Codex (`codex-rs/tui/src/bottom_pane/feedback_view.rs:113-133`, `issue_url_for_category`): un indirizzo `issues/new` col
 *   modello del repo e un campo precompilato; la persona invia col suo account. Codex però CARICA i log sui suoi server prima di dare
 *   l'indirizzo (`feedback_upload_consent_params`, :219): qui non si manda niente a nessuno, e la diagnostica si legge tutta prima.
 *   Le forme delle chiavi sono quelle della CLI (`forme-di-segreto.mjs`, a sua volta `cli/src/diagnostics/redact.ts`), non una copia.
 */
import { hostname, userInfo, arch as archDelSistema, release as releaseDelSistema } from 'node:os';
import { oscuraFormeDiSegreto } from './forme-di-segreto.mjs';

export const TIPI_DI_SEGNALAZIONE = Object.freeze(['bug', 'wrong_answer', 'idea']);

/*
 * Revisione D del 29/10/2026 (F4, dal Mobile): chi ospita il server ACCENDE la seconda porta, positivamente. Solo il guscio desktop
 *   (`desktop/runtime.mjs`) e lo script del 4174 mettono `TALOS_SEGNALAZIONE_PROBLEMA=on`; il Pad e «Codice in casa» non la mettono
 *   (`TalosCodiceInCasa.kt:163` avvia `server.mjs` senza nemmeno `TALOS_LOCALE_OSPITE_DIR`, quindi la guardia negativa da sola non
 *   teneva). `TALOS_LOCALE_OSPITE_DIR` resta come secondo «spento». Solo il valore esatto `on`: qualunque altro vale spento.
 */
export function segnalazioneAccesaDallAmbiente(env = {}) {
  return env?.TALOS_SEGNALAZIONE_PROBLEMA === 'on' && !env?.TALOS_LOCALE_OSPITE_DIR;
}
export const TITOLO_MASSIMO = 120;
export const DESCRIZIONE_MASSIMA = 4000;
export const SCHEMA_DIAGNOSTICA = 'talos.segnalazione-diagnostica.v1';
/* Gli errori: i più recenti, al più cinque — «solo il codice, mai il messaggio intero» (owner 29/10). */
export const ERRORI_MASSIMI = 5;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Il nome utente e il nome del PC di questa macchina; ciò che non si legge resta fuori (mai un errore). */
export function nomiPrivatiDellaMacchina() {
  let utente = null;
  let pc = null;
  try { utente = userInfo().username; } catch { /* account senza nome leggibile */ }
  try { pc = hostname(); } catch { /* sistema che non lo dice */ }
  return { utente, pc };
}

/*
 * I percorsi. ⛔ Si tolgono quelli ASSOLUTI (Windows con la lettera, UNC, POSIX, `~/`, `file://`) e i pezzi uniti dalla barra
 *   rovesciata (`Users\Antonino\Desktop`): dicono come si chiama la persona e come è fatto il suo disco. I percorsi RELATIVI con la
 *   barra dritta restano (`src/kernel/a.mjs`, e anche `z-ai/glm-5.3-flash`, che è un nome di modello): non portano niente di
 *   personale, e una segnalazione senza il nome del file di cui parla non serve a chi la legge. Limite dichiarato.
 */
const PERCORSI = [
  /\bfile:\/\/\/?[^\s"'<>]*/giu,
  /(?<![\p{L}\p{N}_])[A-Za-z]:[\\/][^\s"'<>|]*/gu,
  /\\\\[^\s\\"'<>|]+\\[^\s"'<>|]*/gu,
  /(?<![\p{L}\p{N}_.:/~-])~[\\/][^\s"'<>|]*/gu,
  /(?<![\p{L}\p{N}_.:/~-])\/(?:[^\s/"'<>|]+\/)+[^\s/"'<>|]*/gu,
  /* ⛔ niente spazi dentro un pezzo: «Rossi\Documenti e cartella» si mangerebbe la frase. «Users\Mario Rossi\x» diventa due
     segnaposto, e il nome resta fuori lo stesso (i due pezzi accanto allo spazio sono entrambi tolti). */
  /(?<![\p{L}\p{N}_])[\p{L}\p{N}_.-]+(?:\\[\p{L}\p{N}_.-]*)+/gu,
];
/* ⛔ Revisione D del 29/10/2026 (F1, F2): le chiavi — forme, nome di variabile che finisce col nome di un segreto, Z.AI, segnaposto
   della documentazione, blocco PEM intero — le toglie TUTTE la pulizia condivisa `oscuraFormeDiSegreto` (concordata con la CLI, che
   copia le stesse forme in `redact.ts`). Qui restano solo percorsi, email e nomi. */
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

/**
 * Il testo pronto per una pagina pubblica: chiavi, gettoni, percorsi, indirizzi email, nome utente e nome del PC sostituiti da un
 *   segnaposto che dice che cosa c'era. `nomi` di serie quelli di questa macchina; un nome sotto i tre caratteri non si cerca
 *   (spezzerebbe le parole).
 */
export function ripulisciTestoSegnalazione(testo, { nomi = nomiPrivatiDellaMacchina() } = {}) {
  if (typeof testo !== 'string' || testo === '') return '';
  let fuori = oscuraFormeDiSegreto(testo);
  for (const forma of PERCORSI) fuori = fuori.replace(forma, '[path]');
  fuori = fuori.replace(EMAIL, '[email]');
  const sostituisci = (nome, segnaposto) => {
    if (typeof nome !== 'string') return;
    const n = nome.trim();
    if (n.length < 3) return;
    fuori = fuori.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escape(n)}(?![\\p{L}\\p{N}_])`, 'giu'), segnaposto);
  };
  sostituisci(nomi?.utente, '[user]');
  sostituisci(nomi?.pc, '[pc]');
  for (const altro of Array.isArray(nomi?.altri) ? nomi.altri : []) sostituisci(altro, '[pc]');
  return fuori;
}

/**
 * La bozza scritta dal modello con `report_problem`, controllata e ripulita. `{ok:false, messaggio}` (inglese, per il modello) se
 *   gli argomenti non vanno; il kernel controlla già le stesse cose: questa è la difesa del registro.
 */
export function normalizzaBozzaSegnalazione(argomenti, { nomi } = {}) {
  const kind = argomenti?.kind;
  if (!TIPI_DI_SEGNALAZIONE.includes(kind)) return { ok: false, messaggio: `"kind" must be one of ${TIPI_DI_SEGNALAZIONE.join(', ')}. Nothing was shown.` };
  const title = argomenti?.title;
  if (typeof title !== 'string' || title.trim() === '' || title.length > TITOLO_MASSIMO) {
    return { ok: false, messaggio: `"title" must be a non-empty text of at most ${TITOLO_MASSIMO} characters. Nothing was shown.` };
  }
  const description = argomenti?.description ?? '';
  if (typeof description !== 'string' || description.length > DESCRIZIONE_MASSIMA) {
    return { ok: false, messaggio: `"description" must be a text of at most ${DESCRIZIONE_MASSIMA} characters. Nothing was shown.` };
  }
  const opzioni = nomi ? { nomi } : {};
  return { ok: true, bozza: { kind, title: ripulisciTestoSegnalazione(title.trim(), opzioni), description: ripulisciTestoSegnalazione(description.trim(), opzioni) } };
}

/** «Windows 11» dal numero di build (22000 in su), come lo dice Microsoft; gli altri col loro numero, se ha una forma da numero. */
export function nomeDelSistema(piattaforma, release) {
  const numero = typeof release === 'string' && /^[0-9][\w.-]{0,39}$/u.test(release) ? release : null;
  if (piattaforma === 'win32') {
    const build = Number(numero?.split('.')[2]);
    return Number.isFinite(build) ? (build >= 22000 ? 'Windows 11' : 'Windows 10') : 'Windows';
  }
  if (piattaforma === 'darwin') return numero ? `macOS (Darwin ${numero})` : 'macOS';
  if (piattaforma === 'linux') return numero ? `Linux ${numero}` : 'Linux';
  return null;
}

const PIATTAFORME = Object.freeze({ win32: 'windows', darwin: 'macos', linux: 'linux' });
const PERMESSI_NOTI = Object.freeze(['Read only', 'Research', 'On request', 'Workspace write', 'Full access']);
const forma = (valore, re) => (typeof valore === 'string' && re.test(valore) ? valore : null);

/** Il nome del modello: di un file locale resta il nome del file, mai la cartella; poi la stessa pulizia del resto. */
function nomeDelModello(valore, nomi) {
  if (typeof valore !== 'string' || valore.trim() === '') return null;
  let nome = valore.trim();
  if (/^(?:[A-Za-z]:[\\/]|\\\\|\/|~[\\/])/u.test(nome) || nome.includes('\\')) nome = nome.split(/[\\/]/u).filter(Boolean).at(-1) ?? '';
  nome = ripulisciTestoSegnalazione(nome, { nomi }).slice(0, 100);
  return /^[\p{L}\p{N}_.:@+/ \[\]-]{1,100}$/u.test(nome) ? nome : null;
}

/**
 * La diagnostica dai fatti. Ogni campo ha la SUA forma (numero di versione, codice d'errore, interruttore): ciò che non la rispetta
 *   diventa `null` — «non si sa» — invece di passare com'è.
 */
export function costruisciDiagnosticaSegnalazione(fatti = {}, { nomi = nomiPrivatiDellaMacchina() } = {}) {
  const s = fatti.sessione;
  const errori = (Array.isArray(fatti.errori) ? fatti.errori : [])
    .filter((e) => typeof e?.codice === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/u.test(e.codice))
    .map((e) => ({ codice: e.codice, alle: typeof e.alle === 'string' && !Number.isNaN(Date.parse(e.alle)) ? new Date(e.alle).toISOString() : null }))
    .sort((a, b) => (Date.parse(b.alle ?? '') || 0) - (Date.parse(a.alle ?? '') || 0))
    .slice(0, ERRORI_MASSIMI);
  return {
    schema: SCHEMA_DIAGNOSTICA,
    versione: forma(fatti.versione, /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:-[0-9A-Za-z.-]{1,32})?$/u),
    installata: fatti.installata === true,
    sistema: {
      piattaforma: PIATTAFORME[fatti.sistema?.piattaforma] ?? 'altro',
      nome: nomeDelSistema(fatti.sistema?.piattaforma, fatti.sistema?.release),
      arch: forma(fatti.sistema?.arch, /^[a-z0-9_]{2,12}$/u),
    },
    sessione: s && typeof s === 'object' ? {
      modello: nomeDelModello(s.modello, nomi),
      fornitore: forma(s.provider, /^[a-z0-9][a-z0-9._-]{0,39}$/u),
      sforzo: forma(s.reasoning, /^[a-z]{2,12}$/u),
      permesso: PERMESSI_NOTI.includes(s.permessi) ? s.permessi : null,
      terminale: typeof fatti.terminale === 'boolean' ? fatti.terminale : null,
    } : null,
    errori,
    motoreLocale: typeof fatti.motoreLocale === 'boolean' ? fatti.motoreLocale : null,
    remoto: typeof fatti.remoto === 'boolean' ? fatti.remoto : null,
  };
}

/** Una fonte che cade (o che lancia) vale «non si sa»: la finestra si apre lo stesso, con la riga che lo dice. */
async function prova(fn, ...argomenti) {
  if (typeof fn !== 'function') return undefined;
  try { return await fn(...argomenti); } catch { return undefined; }
}

/**
 * Chi ha le fonti (la rotta, `http-app.mjs`) le passa come funzioni; qui si chiamano una per una e si costruisce la diagnostica.
 *   `sessionId` null ⇒ la finestra aperta dal menu senza una conversazione: niente modello, permesso e terminale.
 */
export async function raccogliDiagnosticaSegnalazione({
  sessionId = null, versione, sistema = () => ({ piattaforma: process.platform, release: releaseDelSistema(), arch: archDelSistema() }),
  riga, schede, errori, motoreLocale, remoto, nomi = nomiPrivatiDellaMacchina(),
} = {}) {
  const v = await prova(versione);
  const conSessione = typeof sessionId === 'string' && sessionId !== '';
  const r = conSessione ? await prova(riga, sessionId) : undefined;
  const elencoSchede = conSessione ? await prova(schede, sessionId) : undefined;
  const statoRemoto = await prova(remoto);
  const nomiTutti = { ...nomi, altri: [typeof statoRemoto?.nomePc === 'string' ? statoRemoto.nomePc : null].filter(Boolean) };
  return costruisciDiagnosticaSegnalazione({
    versione: v?.versione, installata: v?.installata === true,
    sistema: await prova(sistema),
    sessione: r ? { modello: r.modelId ?? r.modello ?? null, provider: r.provider ?? null, reasoning: r.reasoning ?? null, permessi: r.permessi ?? null } : null,
    terminale: Array.isArray(elencoSchede) ? elencoSchede.some((x) => x?.attiva === true) : undefined,
    errori: (await prova(errori, conSessione ? sessionId : null)) ?? [],
    motoreLocale: await prova(motoreLocale),
    remoto: typeof statoRemoto?.acceso === 'boolean' ? statoRemoto.acceso : undefined,
  }, { nomi: nomiTutti });
}
