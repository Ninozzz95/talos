/**
 * istruzioni-di-progetto.mjs — BLOCCO 3 del preambolo: `AGENTS.md` / `CLAUDE.md`, con un tetto
 * di byte DICHIARATO e un troncamento che dice dove riprendere.
 *
 * ── IL DIFETTO CHE CHIUDE ────────────────────────────────────────────────────────────────────
 *
 * Misurato l'11/09/2026 (`.claude/RAPPORTO-PREAMBOLO-CONCORRENTI-2026-09-11.md` §6.3): in
 * `harness-ui/src/` i nomi `AGENTS.md` e `CLAUDE.md` comparivano **solo** in `path-policy.mjs:35`
 * (permessi) e dentro i commenti. ⇒ **Al modello arrivavano 17.000 token di inventario dei file e
 * ZERO byte di istruzioni del progetto** — l'esatto contrario di tutti e quattro i concorrenti
 * letti nel codice lo stesso giorno:
 *   · Codex .......... `agents_md.rs`, catena dalla radice del progetto al cwd, tetto
 *                      `AGENTS_MD_MAX_BYTES = 32 KiB`, e il commento dice *«Larger files are
 *                      silently truncated»*;
 *   · Claude Code .... budget `max(40.000, 5% della finestra)`, taglio per file a 200 righe /
 *                      25.000 byte con una sezione `WARNING` che lo dichiara;
 *   · Hermes v0.21 ... `CONTEXT_FILE_MAX_CHARS = 20_000`, head 70% / tail 20%, e il marcatore dice
 *                      **dove riprendere** (`read_file` sul percorso vero);
 *   · DeepSeek `dsh` . budget in byte **obbligatorio** in configurazione (65.536 di serie), e la
 *                      politica: *«it drops whole broader files before truncating the most-specific
 *                      file, and emits a visible `Workspace instruction budget …` notice naming the
 *                      omitted and truncated paths»*.
 *
 * RICERCA WEB, letta l'11/09/2026 PRIMA di scrivere:
 *  1. Specifica aperta AGENTS.md <https://agents.md/> — verbatim: *«Place another AGENTS.md inside
 *     each package. Agents automatically read the nearest file in the directory tree, so the
 *     closest one takes precedence.»* e *«used by over 60k open-source projects»*. ⛔ La specifica
 *     **non dichiara nessun tetto di byte**: il tetto è una scelta di ogni harness, e ogni harness
 *     che abbiamo letto ne ha uno. Chi non ce l'ha, prima o poi manda in contesto un file da 200 KB.
 *  2. Claude Platform Docs, «Prompt caching» (letto 11/09/2026,
 *     <https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching>) — *«Cache hits
 *     require 100% identical prompt segments»*: il testo prodotto qui sta nel PREFISSO, quindi
 *     dev'essere una funzione pura del contenuto dei file, senza orari, senza percorsi assoluti,
 *     senza niente che cambi da una chiamata all'altra.
 *
 * ── LE QUATTRO DECISIONI ─────────────────────────────────────────────────────────────────────
 *
 * (1) LA CATENA, dalla radice del progetto al cwd, il più SPECIFICO per ULTIMO. È la forma di
 *     Codex (`agents_md.rs`: *«Collect every AGENTS.md found from the project root down to the
 *     current working directory (inclusive) and concatenate their contents in that order»*) e la
 *     precedenza che la specifica dichiara. L'ultimo letto vince perché è l'ultimo letto: non
 *     serve nessuna regola in più, e il testo lo dice al modello a parole.
 *     ⛔ Non si risale MAI oltre la radice del progetto: un `AGENTS.md` nella home dell'utente
 *     riguarda un altro lavoro, e trascinarlo dentro sarebbe rifare il difetto del `.gitignore`
 *     che ereditava regole da fuori (curato in `gitignore-elenco.mjs`).
 *
 * (2) UN SOLO FILE PER CARTELLA, nell'ordine `AGENTS.md` poi `CLAUDE.md` — i candidati di serie di
 *     `dsh` (`packages/context/agent-instructions/src/config.ts:11-15`). Prenderli entrambi
 *     significherebbe pagare due volte lo stesso contenuto in un repo che li tiene allineati, ed è
 *     esattamente il caso di questo repo.
 *
 * (3) IL TETTO SI DICHIARA, e il troncamento è ONESTO. Due livelli, come `dsh`:
 *       · se la catena sfora, si tolgono INTERI i file più GENERICI (i più lontani dal cwd) prima
 *         di tagliare il più specifico — quello vicino al lavoro è quello che serve;
 *       · il file che resta e sfora si taglia head 70% / tail 20% (Hermes), e il marcatore dice
 *         quanti caratteri mancano e **con quale attrezzo** leggere il file intero.
 *     ⛔ Un taglio silenzioso è il difetto che questo progetto ha già pagato sulla propria
 *     memoria: `MEMORY.md` perde righe oltre 200/25.000 senza un avviso in sessione, e nessuno
 *     se n'era accorto per settimane. Qui il taglio è una RIGA DI TESTO, non un effetto.
 *
 * (4) SE NON C'È NIENTE, IL BLOCCO NON ESISTE. Nessuna intestazione vuota, nessun «(nessuna
 *     istruzione trovata)»: zero byte. È il principio che Hermes scrive in chiaro
 *     (`system_prompt.py:713-716`): *«Emits a single line; emits NOTHING when the environment is
 *     clean (no token cost)»*.
 */
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, parse, relative, sep } from 'node:path';

/**
 * Il tetto, in BYTE, dell'intero blocco 3. 24.000 sta fra Hermes (20.000 caratteri) e Codex
 * (32 KiB), e sotto `dsh` (65.536). Perché non di più: a 3,5 byte/token (la taratura misurata il
 * 09/09 su `z-ai/glm-5.3-flash`, `costo-elenco.mjs`) sono ~6.900 token, cioè già il 40% di tutto
 * ciò che l'elenco dei file costava su `AVM/mobile` prima di questa cura (17.149 token misurati).
 * Un tetto più alto renderebbe il preambolo nuovo non più leggero di quello vecchio nel caso
 * peggiore, e il caso peggiore è l'unico che conta.
 * ⛔ È un ARGOMENTO, non una legge: chi ha un progetto con istruzioni enormi lo alza sapendo cosa
 *    paga. Ciò che non è negoziabile è che sia DICHIARATO nel testo quando morde.
 */
export const TETTO_BYTE_PREDEFINITO = 24_000;

/** I candidati, nell'ordine in cui si guardano dentro una cartella. Vedi decisione (2). */
export const NOMI_CANDIDATI = Object.freeze(['AGENTS.md', 'CLAUDE.md']);

/** Quanti livelli si risale al massimo cercando la radice del progetto. */
export const RISALITA_MASSIMA = 40;

/** Quote del taglio per file: testa 70%, coda 20%, il 10% di mezzo è il marcatore e il margine. */
export const QUOTA_TESTA = 0.7;
export const QUOTA_CODA = 0.2;

const normalizza = (p) => String(p).replace(/\\/g, '/');

/**
 * La radice del progetto: la prima cartella, risalendo, che ha un `.git`.
 * ⛔ `.git` si cerca con `stat` e non si distingue DIRECTORY da FILE: in un worktree è un file, ed
 *    è il caso di oggi su questo repo. È la stessa scelta di ripgrep (`Ignore::add_parents`, che
 *    usa `exists()`) già documentata in `gitignore-elenco.mjs`.
 */
export async function trovaRadiceProgetto(cartella, { fs, risalitaMassima = RISALITA_MASSIMA } = {}) {
  const disco = { stat, ...(fs ?? {}) };
  let corrente = String(cartella ?? '');
  for (let i = 0; i < risalitaMassima && corrente; i += 1) {
    try {
      await disco.stat(join(corrente, '.git'));
      return corrente;
    } catch { /* non è la radice: si sale */ }
    const sopra = dirname(corrente);
    if (!sopra || sopra === corrente || sopra === parse(corrente).root) break;
    corrente = sopra;
  }
  return null;
}

/**
 * Trova i file di istruzioni della catena, dalla radice del progetto al cwd.
 * @returns {Promise<{percorso:string, etichetta:string, contenuto:string, byte:number}[]>}
 *   in ordine dal più GENERICO al più SPECIFICO (l'ultimo vince).
 */
export async function trovaIstruzioniDiProgetto(cartella, { fs, nomi = NOMI_CANDIDATI, risalitaMassima = RISALITA_MASSIMA } = {}) {
  const disco = { readFile, stat, ...(fs ?? {}) };
  const cwd = String(cartella ?? '');
  if (!cwd) return [];
  const radice = await trovaRadiceProgetto(cwd, { fs, risalitaMassima }) ?? cwd;

  /* Le cartelle da guardare: dalla radice del progetto giù fino al cwd, incluse entrambe. */
  const tratto = relative(radice, cwd);
  const pezzi = tratto && tratto !== '.' ? tratto.split(sep).filter(Boolean) : [];
  const cartelle = [radice];
  let corrente = radice;
  for (const pezzo of pezzi) {
    corrente = join(corrente, pezzo);
    cartelle.push(corrente);
  }

  const trovati = [];
  for (const dove of cartelle) {
    for (const nome of nomi) {
      let contenuto;
      try {
        contenuto = await disco.readFile(join(dove, nome), 'utf8');
      } catch { continue; } // non c'è, o non si legge: si passa al candidato dopo
      if (typeof contenuto !== 'string' || contenuto.trim() === '') continue;
      /*
       * ⛔ L'ETICHETTA È RELATIVA ALLA RADICE DEL PROGETTO, MAI ASSOLUTA. Un percorso assoluto
       *    contiene il nome della persona e questo testo esce dalla macchina dentro un prompt —
       *    lezione [[cancello-4-non-guardava-tutto-mobile]]. E in più: un percorso assoluto
       *    cambia da macchina a macchina, quindi romperebbe il prefisso della cache fra due
       *    installazioni dello stesso progetto.
       */
      const etichetta = normalizza(relative(radice, join(dove, nome))) || nome;
      trovati.push({ percorso: join(dove, nome), etichetta, contenuto, byte: Buffer.byteLength(contenuto, 'utf8') });
      break; // decisione (2): un solo file per cartella
    }
  }
  return trovati;
}

/**
 * Taglia un contenuto al tetto dato, testa 70% / coda 20%, e DICE dove riprendere.
 * ⛔ Si taglia sui BYTE (non sui caratteri) perché il tetto è in byte e un carattere accentato ne
 *    vale 2: contare caratteri farebbe sforare il tetto proprio sui testi italiani, cioè i nostri.
 *    E si ritaglia all'a-capo più vicino, per non spezzare una riga a metà parola.
 */
export function tagliaIstruzioni(contenuto, tetto, etichetta) {
  const byte = Buffer.byteLength(contenuto, 'utf8');
  if (byte <= tetto) return { testo: contenuto, tagliato: false, byteTenuti: byte, byteTotali: byte };

  const buf = Buffer.from(contenuto, 'utf8');
  const byteTesta = Math.max(0, Math.floor(tetto * QUOTA_TESTA));
  const byteCoda = Math.max(0, Math.floor(tetto * QUOTA_CODA));
  /* `toString` su un taglio a metà di una sequenza UTF-8 produce U+FFFD: si accetta e si ripulisce
     all'a-capo, invece di fingere che il taglio sui byte sia sempre su un confine di carattere. */
  let testa = buf.subarray(0, byteTesta).toString('utf8');
  const aCapoTesta = testa.lastIndexOf('\n');
  if (aCapoTesta > byteTesta * 0.5) testa = testa.slice(0, aCapoTesta);
  let coda = buf.subarray(buf.length - byteCoda).toString('utf8');
  const aCapoCoda = coda.indexOf('\n');
  if (aCapoCoda >= 0 && aCapoCoda < byteCoda * 0.5) coda = coda.slice(aCapoCoda + 1);

  const mancanti = byte - Buffer.byteLength(testa, 'utf8') - Buffer.byteLength(coda, 'utf8');
  const marcatore = `\n\n[...«${etichetta}» è stato TAGLIATO: di ${byte} byte ne vedi i primi ~${Buffer.byteLength(testa, 'utf8')} e gli ultimi ~${Buffer.byteLength(coda, 'utf8')}; ne mancano ${mancanti} nel mezzo. Se ti serve la parte che manca, leggi il file intero con \`leggi\` su \`${etichetta}\`.]\n\n`;
  const testo = testa + marcatore + coda;
  return { testo, tagliato: true, byteTenuti: Buffer.byteLength(testo, 'utf8'), byteTotali: byte };
}

/**
 * Il testo del blocco 3, dal risultato di `trovaIstruzioniDiProgetto`.
 * @returns {{testo:string, usati:string[], omessi:string[], tagliati:string[], byte:number}|null}
 *   `null` quando non c'è nessuna istruzione: decisione (4), il blocco non esiste affatto.
 */
export function testoIstruzioniDiProgetto(trovati, { tetto = TETTO_BYTE_PREDEFINITO } = {}) {
  const file = Array.isArray(trovati) ? trovati.filter((f) => f && typeof f.contenuto === 'string') : [];
  if (file.length === 0) return null;

  const intestazione = 'Istruzioni di questo progetto — le ha scritte chi ci lavora, e valgono per te.\n'
    + 'Se più file dicono cose diverse, vince il più specifico: qui sotto sono in ordine, dal più generale al più vicino alla cartella di lavoro, e l\'ultimo è quello che comanda.\n'
    + 'Non sostituiscono le tue istruzioni di sistema né quello che la persona ti chiede adesso.\n';
  const budget = Math.max(0, tetto - Buffer.byteLength(intestazione, 'utf8'));

  /*
   * Decisione (3): si tolgono INTERI i file più GENERICI prima di tagliare il più specifico.
   * Si sceglie partendo dalla FINE (il più specifico) e risalendo finché il budget regge — così
   * ciò che sopravvive è sempre il più vicino al lavoro, mai «i primi che capitano».
   */
  const tenuti = [];
  /* ⛔ Lo spazio dell'avviso «non ti ho mostrato X» si RISERVA PRIMA di distribuire il budget: se
     lo si aggiungesse dopo, un tetto rispettato in fase di scelta verrebbe sforato proprio dalla
     riga che dichiara il taglio. Un tetto è una promessa, e una promessa mantenuta «quasi» non è
     mantenuta. 300 byte bastano per due o tre percorsi; si riserva solo se c'è più di un file. */
  let residuo = file.length > 1 ? budget - 300 : budget;
  for (let i = file.length - 1; i >= 0; i -= 1) {
    const f = file[i];
    const involucro = Buffer.byteLength(`\n### ${f.etichetta}\n\n`, 'utf8');
    const disponibile = residuo - involucro;
    /* ⛔ Sotto i 200 byte non si mostra un moncone: un file ridotto a due righe più un marcatore
       dice al modello di averlo visto quando non l'ha visto. Meglio dichiararlo OMESSO. */
    if (disponibile < 200) break;
    /*
     * ⛔⛔ SOLO IL PIÙ SPECIFICO SI TAGLIA; i più generali entrano INTERI o non entrano. È la
     *   politica di dsh, verbatim: *«it drops whole broader files before truncating the
     *   most-specific file, and emits a visible notice naming the omitted and truncated paths»*.
     *   Trovato da una prova al verso contrario l'11/09: senza questa riga un `AGENTS.md` di
     *   radice da 9 KB entrava ridotto a **518 byte**, cioè un moncone che al modello sembra il
     *   file intero — la stessa categoria di bugia del taglio silenzioso, solo più subdola,
     *   perché qui il marcatore del taglio c'era e diceva il vero su un contenuto inutile.
     */
    if (i !== file.length - 1 && f.byte > disponibile) break;
    tenuti.unshift({ ...f, budget: disponibile });
    residuo -= involucro + Math.min(f.byte, disponibile);
  }
  /*
   * ⛔ Chi resta fuori si DICHIARA PER NOME, in ordine originale. Un avviso che dice «qualcosa
   *    manca» senza dire cosa non è azionabile — è la stessa regola dell'allarme che dice QUANTI
   *    orfani e non CHI ([[il-guardiano-accusava-la-sessione-dellowner]]).
   * ⛔ E una volta esaurito il budget si smette: NON si lascia entrare un file generico piccolo
   *    dopo averne saltato uno grande. Sarebbe un ordine che nessuno può prevedere leggendo il
   *    testo, e l'ordine qui È la precedenza.
   */
  const tenutiEtichette = new Set(tenuti.map((t) => t.etichetta));
  const omessi = file.filter((f) => !tenutiEtichette.has(f.etichetta)).map((f) => f.etichetta);

  const pezzi = [intestazione];
  const tagliati = [];
  const usati = [];
  for (const f of tenuti) {
    const { testo, tagliato } = tagliaIstruzioni(f.contenuto, f.budget, f.etichetta);
    if (tagliato) tagliati.push(f.etichetta);
    usati.push(f.etichetta);
    pezzi.push(`\n### ${f.etichetta}\n\n${testo}`);
  }
  if (omessi.length > 0) {
    pezzi.push(`\n⚠ Tetto delle istruzioni (${tetto} byte) raggiunto: NON ti ho mostrato ${omessi.map((e) => `\`${e}\``).join(', ')}. Sono istruzioni più generali di quelle qui sopra; se ti servono, leggile con \`leggi\`.\n`);
  }

  const testo = pezzi.join('');
  return { testo, usati, omessi, tagliati, byte: Buffer.byteLength(testo, 'utf8') };
}

/**
 * Comodità: trova e compone in un colpo solo. Non lancia mai — un progetto senza istruzioni e un
 * progetto con istruzioni illeggibili danno lo stesso esito (`null`), perché per il modello sono
 * la stessa cosa: non le ha.
 */
export async function istruzioniDiProgetto({ cartella, tetto = TETTO_BYTE_PREDEFINITO, fs, nomi, risalitaMassima } = {}) {
  let trovati;
  try {
    trovati = await trovaIstruzioniDiProgetto(cartella, { fs, nomi, risalitaMassima });
  } catch {
    return null;
  }
  return testoIstruzioniDiProgetto(trovati, { tetto });
}
