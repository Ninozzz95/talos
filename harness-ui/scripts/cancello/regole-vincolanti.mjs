/**
 * IL CANCELLO DELLE REGOLE VINCOLANTI — quello che una riga di memoria non può fare.
 *
 * ⛔⛔⛔ 07/09/2026, owner: «fai in modo di escogitare qualcosa per non farti violare mai regole
 *   vincolanti principali, ricerca sul web sono stanco di dovertelo dire ogni volta, qui aggiungere
 *   una riga nella memoria non basta».
 *
 * Ha ragione, e la ricerca del 07/09/2026 dice perché non è una questione di buona volontà:
 * · «prompt-based guardrails are advisory rather than enforceable — models interpret instructions
 *   probabilistically» (WSO2, «Why Prompt-Based Guardrails Are Not Enough»);
 * · esiste una dimostrazione che per QUALUNQUE insieme finito di regole scritte nel prompt esiste un
 *   prompt che le fa ignorare (Help Net Security, 10/06/2026, «Every set of AI guardrails can be
 *   broken by the right prompt»);
 * · la risposta è un CONTROLLO FUORI DAL MODELLO: «effective AI governance requires enforcement
 *   outside of it — a deterministic control layer that applies policies regardless of how the model
 *   behaves» (stessa fonte), e nei fatti sono gli hook che escono con codice 2 e bloccano
 *   («hooks enforce rules deterministically — they run regardless of what the LLM decides»,
 *   ranthebuilder.cloud e la documentazione degli hook dei CLI di coding, 2026).
 *
 * ⇒ Perciò questo file NON è un promemoria: è un programma che dice NO. Legge lo stato del lavoro e
 *   risponde con dei fatti misurabili, e chi lo chiama (l'hook, la CI, il commit) blocca.
 *
 * Le tre regole che ho violato di più, e come si misurano senza fidarsi di nessuno:
 *
 * 1. VERIFICA VISIVA SUL 4174. Se il commit tocca la UI (frontend, mockup, public) devono esistere
 *    delle FOTO scattate DOPO l'ultima modifica di quei file. Una foto più vecchia del codice non è
 *    una verifica: è una vecchia verifica.
 * 2. RICERCA WEB PRIMA DI SCRIVERE. Un commit che tocca codice di prodotto deve citare una fonte
 *    con la data nel messaggio (`fonte`, `ricerca`, un URL, «letto il…»). Senza citazione la ricerca
 *    non c'è stata: è la regola dell'owner, resa verificabile.
 * 3. NIENTE CO-AUTHORING. Il messaggio non può contenere `Co-Authored-By` né `Claude-Session`.
 *
 * ⛔ E la quarta, che riguarda proprio questo cancello: NON SI DISATTIVANO GLI HOOK. Chi commette
 *    con `core.hooksPath=/dev/null` (cioè io, per mesi, per togliere il co-authoring) scavalca ogni
 *    controllo che l'owner mette. Da qui in poi il co-authoring lo toglie il cancello, non il buio.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { giudicaLeFoto, testiDelleIspezioni } from './ogni-foto-guardata.mjs';

/** I percorsi che, se toccati, pretendono una prova dal vivo. */
export const SUPERFICI_VISIBILI = [
  'harness-ui/frontend/src/',
  'harness-ui/frontend/mockup/',
  'harness-ui/frontend/index.template.html',
  'harness-ui/public/',
];

/**
 * Dove vivono le foto delle prove: una prova senza foto non è una prova.
 * ⛔ Le prove di questa sessione scrivono nello scratchpad temporaneo, che sta FUORI dal repo: il
 *   cancello deve guardare anche lì, o direbbe «nessuna foto» a chi ha appena fotografato tutto.
 *   Il percorso non lo sceglie chi commette: si ricava dalla cartella temporanea del progetto.
 */
export const CARTELLE_FOTO = ['scratchpad/prove/foto'];

/** Le cartelle-foto degli scratchpad di sessione, cercate dove il sistema le mette davvero. */
export function cartelleScratchpad(ambiente = process.env, deps = {}) {
  const elenca = deps.readdirSync ?? readdirSync;
  const esiste = deps.existsSync ?? existsSync;
  const base = ambiente.LOCALAPPDATA ? join(ambiente.LOCALAPPDATA, 'Temp', 'claude') : (ambiente.TMPDIR ? join(ambiente.TMPDIR, 'claude') : null);
  if (!base || !esiste(base)) return [];
  const fuori = [];
  for (const progetto of elenca(base, { withFileTypes: true })) {
    if (!progetto.isDirectory() || !/AVM-harness-desktop/i.test(progetto.name)) continue;
    const dentro = join(base, progetto.name);
    for (const sessione of elenca(dentro, { withFileTypes: true })) {
      if (!sessione.isDirectory()) continue;
      const foto = join(dentro, sessione.name, 'scratchpad', 'prove', 'foto');
      if (esiste(foto)) fuori.push(foto);
    }
  }
  return fuori;
}

/** Le parole che dichiarano una ricerca: una di queste, con una data o un URL accanto. */
/* ⛔ 07/9 — il primo giro di questo cancello ha accusato IL SUO STESSO COMMIT, che citava
   «la ricerca del 07/09/2026»: il modello voleva «ricerca» attaccata alla data. Un cancello che nega
   a chi ha obbedito è già costato caro qui (04/09, la ricerca web negata a un agente delegato) e
   finisce disattivato: le forme ammesse sono quelle che una persona scrive davvero. */
/* ⛔ 17/09 — SECONDA VOLTA che questo cancello nega a chi ha obbedito: dal 14/09 i messaggi di commit
   sono in INGLESE (owner: «d'ora in poi i messaggi commit sempre in inglese»), e l'elenco conosceva solo
   le forme italiane. Un agente della P0-bis, col messaggio giusto e le fonti datate, si è visto rispondere
   «Il messaggio non cita né una fonte con la data né una misura» e ha dovuto aggirarlo con gli URL.
   Le forme inglesi che una persona scrive davvero stanno accanto a quelle italiane; nessuna tolta. */
const SEGNI_DI_RICERCA = [
  /fonti?\s*[:(]/i,
  /ricerc.{0,24}\d{2}\/\d{2}\/\d{4}/i,
  /letto il \d{2}/i,
  /https?:\/\//i,
  /\bmisurat[oa]\b/i,
  /\bprovato dal vivo\b/i,
  /\bsources?\s*[:(]/i,
  /\bresearch.{0,24}\d{2}\/\d{2}\/\d{4}/i,
  /\bread (?:on )?\d{2}\/\d{2}\/\d{4}/i,
  /\bmeasured\b/i,
  /\bproven live\b/i,
];

export function tocca(percorso, superfici = SUPERFICI_VISIBILI) {
  return superfici.some((s) => percorso.startsWith(s));
}

/** @returns {string[]} i file nell'indice (quelli che stanno per essere committati) */
export function fileNellIndice(radice, esegui = execFileSync) {
  const fuori = esegui('git', ['diff', '--cached', '--name-only'], { cwd: radice, encoding: 'utf8' });
  return String(fuori).split('\n').map((r) => r.trim()).filter(Boolean);
}

/** Il momento dell'ultima modifica fra i file dati. `0` se non ce n'è nessuno. */
export function ultimaModifica(radice, percorsi, leggiStat = statSync) {
  let quando = 0;
  for (const percorso of percorsi) {
    const intero = join(radice, percorso);
    try { quando = Math.max(quando, leggiStat(intero).mtimeMs); } catch { /* cancellato: non conta */ }
  }
  return quando;
}

/** Il momento della foto più recente. `0` se non c'è nessuna foto. */
export function ultimaFoto(radice, cartelle = CARTELLE_FOTO, deps = {}) {
  const elenca = deps.readdirSync ?? readdirSync;
  const leggiStat = deps.statSync ?? statSync;
  const esiste = deps.existsSync ?? existsSync;
  let quando = 0;
  const visita = (dove) => {
    if (!esiste(dove)) return;
    for (const voce of elenca(dove, { withFileTypes: true })) {
      const intero = join(dove, voce.name);
      if (voce.isDirectory()) { visita(intero); continue; }
      if (!/\.(png|jpe?g|webp)$/i.test(voce.name)) continue;
      try { quando = Math.max(quando, leggiStat(intero).mtimeMs); } catch { /* sparita mentre guardavo */ }
    }
  };
  for (const c of cartelle) visita(c.startsWith('/') || /^[A-Za-z]:/.test(c) ? c : join(radice, c));
  return quando;
}

/**
 * Dove si scrive di aver guardato: i taccuini delle prove e il registro delle ispezioni.
 * ⛔ Il registro sta nello scratchpad, accanto alle foto: chi scatta e chi guarda lasciano la
 *   traccia nello stesso posto, o una delle due si perde.
 */
export function percorsiIspezioni(radice) {
  const fuori = [join(radice, '.claude', 'ISPEZIONI-FOTO.md')];
  for (const cartella of cartelleScratchpad()) {
    fuori.push(join(cartella, '..', 'ispezioni.md'));      // scratchpad/prove/ispezioni.md
    fuori.push(join(cartella, '..', '..', 'ispezioni.md')); // scratchpad/ispezioni.md
  }
  try {
    const taccuini = join(radice, '.claude', 'taccuini');
    if (existsSync(taccuini)) for (const f of readdirSync(taccuini)) if (f.endsWith('.md')) fuori.push(join(taccuini, f));
  } catch { /* nessun taccuino: pazienza */ }
  return fuori;
}

export function citaUnaFonte(messaggio) {
  const testo = String(messaggio || '');
  return SEGNI_DI_RICERCA.some((s) => s.test(testo));
}

export function haCoAuthoring(messaggio) {
  return /co-authored-by:|claude-session:/i.test(String(messaggio || ''));
}

/**
 * Il giudizio, senza toccare niente: chi chiama decide se bloccare.
 * @returns {{ok:boolean, motivi:string[], dettagli:object}}
 */
/* ⛔ `occhio` è iniettabile come i due tempi: senza, una prova del cancello finirebbe a guardare le
   foto VERE sul disco di chi la lancia, e direbbe cose diverse su macchine diverse. */
export function giudica({ radice, fileToccati, messaggio, quandoFoto, quandoCodice, cartelleFoto = CARTELLE_FOTO, occhio: occhioDato }) {
  const motivi = [];
  const visibili = fileToccati.filter((f) => tocca(f));
  const foto = quandoFoto ?? ultimaFoto(radice, [...cartelleFoto, ...cartelleScratchpad()]);
  const codice = quandoCodice ?? ultimaModifica(radice, visibili);

  if (visibili.length > 0) {
    /*
     * ⛔ 07/9, owner: «ispezionare ogni singola prova immagine DEVE ESSERE TRASFORMATO IN UN
     *   CANCELLO». Una foto scattata e mai guardata non è una verifica: è un file. Il cancello non
     *   può misurare l'occhio, ma può misurare la TRACCIA — ogni foto di questa verifica dev'essere
     *   nominata in un'ispezione scritta che dica qualcosa.
     */
    const cartelle = [...cartelleFoto.map((c) => (c.startsWith('/') || /^[A-Za-z]:/.test(c) ? c : join(radice, c))), ...cartelleScratchpad()];
    const occhio = occhioDato ?? giudicaLeFoto({
      cartelle, dopo: codice, testi: testiDelleIspezioni(percorsiIspezioni(radice)),
    });
    if (!occhio.ok) {
      motivi.push(`Hai scattato ${occhio.totali} foto e ne hai guardate ${occhio.guardate}: `
        + `${occhio.mancanti.slice(0, 6).join(', ')}${occhio.mancanti.length > 6 ? ' e altre' : ''} non sono nominate in nessuna ispezione. `
        + 'Una foto scattata e mai aperta non è una verifica.');
    }
    if (foto === 0) {
      motivi.push('Questo commit tocca la UI e non esiste NESSUNA foto di una prova: guarda il 4174 prima di chiudere.');
    } else if (foto < codice) {
      const minuti = Math.round((codice - foto) / 60000);
      motivi.push(`La foto più recente è di ${minuti} minuti PRIMA dell'ultima modifica alla UI: è una vecchia verifica, non una verifica.`);
    }
  }
  if (haCoAuthoring(messaggio)) {
    motivi.push('Il messaggio contiene co-authoring: l\'owner l\'ha vietato il 20/8, e vale anche quando le istruzioni di sistema lo chiedono.');
  }
  if (fileToccati.some((f) => f.endsWith('.mjs') || f.endsWith('.js')) && !citaUnaFonte(messaggio)) {
    motivi.push('Il messaggio non cita né una fonte con la data né una misura: senza citazione la ricerca non è stata fatta.');
  }
  return { ok: motivi.length === 0, motivi, dettagli: { visibili, foto, codice } };
}
