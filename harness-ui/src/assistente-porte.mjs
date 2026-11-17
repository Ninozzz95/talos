/*
 * ⭐ L'Assistente, pezzo «a domanda» (owner 11/11/2026; giudice v1500-v1502) — LE PORTE del server per il ciclo del nucleo
 *   (`kernel/assistente-lato.mjs`). Tutto in sola lettura, nessuna shell, nessun programma della cartella:
 *   · file: le letture del kernel (`leggiTestoLimitato`, `elencaDaCartella`, `cercaNelProgetto`, che toglie già i segreti dai risultati),
 *     dietro la regola dei percorsi di `leggi` (`motivoDaChiedere`) giudicata al livello fisso «lettura»: un SEGRETO è un rifiuto secco,
 *     mai una carta; FUORI dalla cartella passa solo un file che l'agente della chat ha già letto in questa sessione (dal giornale), e
 *     mai elenchi o ricerche fuori;
 *   · git: SOLO `git-service.mjs` (programmi della cartella spenti, `--no-ext-diff --no-textconv`); un segreto cambiato si NOMINA, il
 *     contenuto no;
 *   · trascritto, uscite degli strumenti, contesto e spesa: dagli eventi della sessione;
 *   · rete: la stessa lettura sicura della chat (`leggiPaginaSicura`, `eseguiRicercaWeb`).
 * Hermes toglie dai risultati ogni percorso bloccato in lettura (`tools/file_tools.py:234`); la regola dei file già aperti è la scelta G
 *   dell'owner (16:55).
 */
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve as risolvi, sep } from 'node:path';
import {
  cercaNelProgetto, discoNode, elencaDaCartella, esitoDellaLettura, eseguiRicercaWeb, formattaRisultatiRicerca, leggiPaginaSicura, leggiTestoLimitato,
  parametriDiElenca, percorsoDiFile, uscitaUtile,
} from './kernel/talosHarness.mjs';
import { eUnFileSegreto, motivoDaChiedere } from './path-policy.mjs';
import { LIVELLO_DELL_ASSISTENTE, paginaDelTrascritto, trascrittoDaEventi, TETTI_ASSISTENTE } from './kernel/assistente-lato.mjs';
import { contextUsageFromEvents } from '../../context-engine/src/usage.mjs';

const RIFIUTO_SEGRETO = 'REFUSED. This file holds secrets (keys, credentials or .env): the Assistant never reads it, and no card can unlock it. Nothing was read.';
const RIFIUTO_FUORI = 'REFUSED. This path is outside the chat folder and the chat agent has not read it in this session. Nothing was read. Read files inside the chat folder instead.';
const RIFIUTO_RETE_LOCALE = 'REFUSED. Network shares are not read by the Assistant. Nothing was read.';

const eDiRete = (p) => /^(?:\\\\|\/\/)/u.test(String(p ?? '').trim());

/**
 * IL PERCORSO VERO (revisore A, ROSSO-1; giudice v1554 punto 2): giunzioni, collegamenti simbolici e nomi corti 8.3 risolti sul disco
 *   (`realpathSync.native`, che su Windows chiede al sistema il nome finale). La parte che non esiste ancora si riattacca com'è: un file
 *   che non c'è non si legge comunque. È l'idea di `posizioneNelProgetto` del nucleo (`talosHarness.mjs:12287`), qui sincrona perché
 *   anche la rotta dei link ai file (`fileDellAssistente`) lo è.
 */
export function percorsoVeroSync(assoluto) {
  let corrente = assoluto;
  const resto = [];
  for (let i = 0; i < 256; i += 1) {
    try {
      const vero = realpathSync.native(corrente);
      return resto.length ? join(vero, ...resto) : vero;
    } catch { /* non c'è, o non si risolve: sotto si guarda quale dei due */ }
    /* ⛔ un collegamento che c'è ma non si risolve (la destinazione manca) NON si riattacca per nome: è il buco di `realpathTolerant`
       (Open Multi-Agent, «dangling symlink escape», hackmd.io/@haind, letto l'11/11/2026). Non verificabile ⇒ `null`, e chi chiama lo
       tratta come fuori. */
    try { lstatSync(corrente); return null; } catch { /* non esiste davvero: si risale */ }
    const su = dirname(corrente);
    if (su === corrente) return assoluto;
    resto.unshift(basename(corrente));
    corrente = su;
  }
  return assoluto;
}
/* confronto esatto sui percorsi veri, come `dentroLaCartella` del nucleo: realpath restituisce la forma registrata sul disco */
const dentroDi = (radice, p) => p === radice || p.startsWith(radice.endsWith(sep) ? radice : radice + sep);

/** I percorsi ASSOLUTI che l'agente della chat ha letto con successo in questa sessione, dal giornale (`leggi` + il suo esito). */
export function fileGiaLettiDallAgente(eventi, cartella) {
  const voci = trascrittoDaEventi(eventi);
  const letti = new Set();
  for (const v of voci) {
    if (v.chi !== 'tool' || v.nome !== 'leggi' || typeof v.esito !== 'string' || /^\s*(?:REFUSED|INVALID|blocked)\b/u.test(v.esito)) continue;
    let argomenti;
    try { argomenti = JSON.parse(v.argomenti || '{}'); } catch { continue; }
    const p = percorsoDiFile(argomenti);
    if (typeof p !== 'string' || !p.trim()) continue;
    /* il percorso VERO: un file letto da una giunzione, da un collegamento o col nome corto 8.3 è lo stesso file */
    try { const vero = percorsoVeroSync(risolvi(cartella, p)); if (vero) letti.add(vero.toLowerCase()); } catch { /* percorso illeggibile */ }
  }
  return letti;
}

/**
 * La regola dei percorsi dell'Assistente, una sola per leggere, elencare, cercare e per i link ai file. Il livello è FISSO: anche in una
 *   chat in Accesso pieno si giudica come in sola lettura (`accessoPieno: false`).
 * @returns {{ ok: true, assoluto: string, fuori: boolean } | { ok: false, motivo: 'segreto'|'fuori'|'rete', esito: string }}
 */
export function percorsoPerLAssistente({ tipo = 'leggi', percorso, cartella, giaLetti = new Set(), motivoFn = motivoDaChiedere }) {
  const p = String(percorso ?? '').trim() || '.';
  if (eDiRete(p)) return { ok: false, motivo: 'rete', esito: RIFIUTO_RETE_LOCALE };
  const motivo = motivoFn({ tipo, percorso: p, cartella, accessoPieno: LIVELLO_DELL_ASSISTENTE !== 'lettura' });
  const assoluto = risolvi(cartella, p);
  /* ⛔ «dentro la cartella» e «già aperto» si giudicano sul percorso VERO, per letture ed elenchi: `motivoDaChiedere` per scelta non
     risolve i collegamenti (`path-policy.mjs:1342`), e una giunzione dentro la cartella portava fuori senza che nessuno lo vedesse */
  const vero = percorsoVeroSync(assoluto);
  if (motivo && motivo.classe !== 'fuori-workspace') return { ok: false, motivo: 'segreto', esito: RIFIUTO_SEGRETO };
  if (vero === null) return { ok: false, motivo: 'fuori', esito: RIFIUTO_FUORI };
  if (eDiRete(vero)) return { ok: false, motivo: 'rete', esito: RIFIUTO_RETE_LOCALE };
  const radice = percorsoVeroSync(risolvi(cartella)) ?? risolvi(cartella);
  /* un collegamento dal nome innocuo verso un segreto è un segreto */
  if (eUnFileSegreto(vero, { cartella: radice })) return { ok: false, motivo: 'segreto', esito: RIFIUTO_SEGRETO };
  if (dentroDi(radice, vero)) return { ok: true, assoluto, fuori: false };
  if (tipo === 'leggi' && giaLetti.has(vero.toLowerCase())) return { ok: true, assoluto, fuori: true };
  return { ok: false, motivo: 'fuori', esito: RIFIUTO_FUORI };
}

const formattaStato = (stato) => {
  if (!stato || stato.erroreAvvio) return `git status is not available: ${stato?.erroreAvvio ?? 'no repository'}.`;
  const voci = Array.isArray(stato.voci) ? stato.voci : [];
  if (voci.length === 0) return 'git status: nothing changed in the chat folder.';
  const righe = voci.slice(0, 200).map((v) => `${v.staged ? 'staged ' : ''}${v.tipo ?? 'changed'} ${v.percorso}${Number.isFinite(v.aggiunte) ? ` +${v.aggiunte} -${v.rimozioni ?? 0}` : ''}`);
  return `git status (${voci.length} entries):\n${righe.join('\n')}${voci.length > 200 ? `\n… ${voci.length - 200} more` : ''}`;
};

/**
 * Le porte (`ctx`) del ciclo per UNA domanda.
 * @param {{ sessionId: string, cartella: string, eventi: object[], permessiPerAttrezzo?: object, git?: object|null, ricercaWebFn?: Function|null,
 *           spesa?: () => object, letti?: string[], apriPaginaFn?: Function }} o
 */
export function portePerLAssistente(o) {
  const { sessionId, cartella, eventi } = o;
  const giaLetti = fileGiaLettiDallAgente(eventi, cartella);
  const disco = discoNode({ radice: cartella });
  const voci = trascrittoDaEventi(eventi);
  const file = async (nome, argomenti) => {
    if (nome === 'leggi') {
      const percorso = percorsoDiFile(argomenti);
      if (!percorso) return { esito: 'INVALID. leggi needs "percorso". Nothing was read.', rifiutato: true };
      const giudizio = percorsoPerLAssistente({ tipo: 'leggi', percorso, cartella, giaLetti });
      if (!giudizio.ok) return { esito: giudizio.esito, cosa: percorso, rifiutato: true };
      const letta = await leggiTestoLimitato(cartella, giudizio.assoluto, { offset: argomenti.offset, limit: argomenti.limit, format: argomenti.format, byteOffset: argomenti.byteOffset });
      /* le righe lette, per il diario del pannello («ha letto src/a.js, righe 1-60»), solo quando la domanda le dice */
      const da = argomenti.offset;
      const quante = argomenti.limit;
      const righe = argomenti.format !== 'hex' && Number.isSafeInteger(da) && da >= 1 && Number.isSafeInteger(quante) && quante >= 1 ? `${da}-${da + quante - 1}` : '';
      return { esito: esitoDellaLettura(letta, percorso), cosa: percorso, ...(righe ? { righe } : {}) };
    }
    if (nome === 'elenca') {
      const base = percorsoDiFile(argomenti);
      const giudizio = percorsoPerLAssistente({ tipo: 'elenca', percorso: base || '.', cartella, giaLetti });
      if (!giudizio.ok || giudizio.fuori) return { esito: giudizio.esito ?? RIFIUTO_FUORI, cosa: base, rifiutato: true };
      return { esito: await elencaDaCartella(disco, base, parametriDiElenca(argomenti)), cosa: base || '.' };
    }
    const dentro = String(argomenti.dentro ?? '').trim();
    if (dentro) {
      const giudizio = percorsoPerLAssistente({ tipo: 'elenca', percorso: dentro, cartella, giaLetti });
      if (!giudizio.ok || giudizio.fuori || isAbsolute(dentro)) return { esito: giudizio.esito ?? RIFIUTO_FUORI, cosa: dentro, rifiutato: true };
    }
    /* `cercaNelProgetto` toglie dai risultati i file segreti (righe, nomi e conteggi), come Hermes */
    return { esito: await cercaNelProgetto(disco, argomenti, { radice: cartella }), cosa: String(argomenti.testo ?? argomenti.nome ?? '') };
  };
  const git = o.git ?? null;
  const nuovi = {
    git_stato: async () => (git ? formattaStato(await git.stato({ sessionId })) : 'git is not available for this chat.'),
    git_diff: async ({ percorso = '', area = 'worktree' } = {}) => {
      if (!git) return 'git is not available for this chat.';
      const zona = area === 'staged' ? 'preparato' : 'lavoro';
      const stato = await git.stato({ sessionId });
      if (stato?.erroreAvvio) return formattaStato(stato);
      const voci = (Array.isArray(stato.voci) ? stato.voci : []).filter((v) => (zona === 'preparato' ? v.staged : (v.nonStaged || v.conflitto || v.tipo === 'nonTracciato')) && !v.cartella);
      const scelti = percorso ? voci.filter((v) => v.percorso === String(percorso).replace(/\\/gu, '/')) : voci.slice(0, 10);
      if (scelti.length === 0) return percorso ? `git diff: no ${area} changes for ${percorso}.` : `git diff: no ${area} changes.`;
      const pezzi = [];
      for (const v of scelti) {
        /* ⛔ un segreto cambiato si NOMINA, il contenuto no: la differenza non si chiede nemmeno a git */
        if (eUnFileSegreto(v.percorso, { cartella })) { pezzi.push(`--- ${v.percorso}: changed (secret file: content hidden)`); continue; }
        const d = await git.diff({ sessionId, percorso: v.percorso, area: zona });
        pezzi.push(d?.erroreAvvio ? `--- ${v.percorso}: ${d.erroreAvvio}` : `${d.testo}${d.troncato ? '\n[diff cut at the size limit]' : ''}`);
      }
      return `${pezzi.join('\n')}${!percorso && voci.length > scelti.length ? `\n… ${voci.length - scelti.length} more changed files: ask for one with "percorso".` : ''}`;
    },
    git_storia: async ({ limite = 20 } = {}) => {
      if (!git) return 'git is not available for this chat.';
      const n = Number.isInteger(limite) && limite >= 1 && limite <= 50 ? limite : 20;
      const s = await git.storia({ sessionId, limite: n });
      if (s?.erroreAvvio) return `git history is not available: ${s.erroreAvvio}.`;
      const righe = (s.commit ?? []).map((c) => `${c.breve} ${String(c.data ?? '').slice(0, 10)} ${c.autore}: ${c.soggetto}`);
      return righe.length ? `git history (newest first):\n${righe.join('\n')}` : 'git history: no commits yet.';
    },
    trascritto_leggi: async ({ pagina } = {}) => paginaDelTrascritto(voci, pagina),
    uscita_strumento: async ({ id } = {}) => {
      const v = voci.find((x) => x.chi === 'tool' && x.id === String(id ?? ''));
      if (!v) return `No tool call with id "${id}" in this chat. Find ids with trascritto_leggi.`;
      return `Tool ${v.nome} id=${v.id}\nArguments: ${v.argomenti.slice(0, 2_000)}\nOutput:\n${v.esito ?? '(no result yet)'}`;
    },
    contesto_stato: async () => {
      const u = contextUsageFromEvents(eventi);
      return JSON.stringify(u ?? { note: 'no context measure yet' }).slice(0, 2_000);
    },
    spesa_sessione: async () => JSON.stringify(typeof o.spesa === 'function' ? o.spesa() : {}).slice(0, 2_000),
  };
  const apriPagina = async ({ url } = {}) => {
    const pagina = await (o.apriPaginaFn ?? leggiPaginaSicura)(String(url ?? ''));
    return `HTTP ${pagina.stato} · ${pagina.url}\n${uscitaUtile(pagina.corpo, TETTI_ASSISTENTE.esito, 0.25)}`;
  };
  const cercaSulWeb = async ({ query = '', max_results: quanti = 5 } = {}) => {
    let conf = null;
    try { conf = typeof o.ricercaWebFn === 'function' ? o.ricercaWebFn() : null; } catch { conf = null; }
    if (!conf?.ricercaWeb) return 'web search not configured on this harness: no provider/credential was set.';
    const risultati = await eseguiRicercaWeb(String(query), quanti, conf.ricercaWeb, ...(conf.richiediRicercaFn ? [conf.richiediRicercaFn] : []));
    return formattaRisultatiRicerca(String(query), risultati);
  };
  /* `haLetto`: l'Assistente ha già letto la chat (la sua fotografia non è vuota), quindi ogni indirizzo passa dalla carta (owner 21:40);
     `chiediCarta` c'è solo per una richiesta dalla finestra del PC: da un dispositivo l'indirizzo è un rifiuto secco */
  /* `ricercaPronta`: c'è un fornitore della ricerca web; senza, la ricerca non si offre e si rifiuta prima della carta (giudice v1596 punto 4) */
  let ricercaPronta = false;
  try { ricercaPronta = Boolean(typeof o.ricercaWebFn === 'function' ? o.ricercaWebFn()?.ricercaWeb : null); } catch { ricercaPronta = false; }
  return { file, nuovi, apriPagina, cercaSulWeb, permessiPerAttrezzo: o.permessiPerAttrezzo ?? {}, letti: Array.isArray(o.letti) ? o.letti : [],
    haLetto: o.haLetto === true, ricercaPronta, ...(typeof o.chiediCarta === 'function' ? { chiediCarta: o.chiediCarta } : {}) };
}
