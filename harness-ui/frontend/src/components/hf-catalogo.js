/*
 * Catalogo Hugging Face — la scheda «Hugging Face» del Model Lab nel linguaggio
 * del mockup (`#panel-hf`): righe dei repository (`ListRow`), dettaglio
 * (`DetailPanel`) con licenza e revisione, «Tutti i file», la scelta del file
 * (`talos-choice`, radiogroup: una voce per variante GGUF con dimensione e stima),
 * il callout per i repository con accesso richiesto, la stima e «Scarica sul computer».
 *
 * 06/09, B6.9. I dati sono quelli del monolite:
 * `/api/v1/huggingface/search` (repo, downloads, likes, gated, author, license,
 * pipelineTag), il dettaglio (files[{path,sizeBytes,sha256}], revision, readme,
 * images) e la stima per variante di `/api/v1/local-models/fit-estimate`
 * (state compatible · tight · blocked · unknown, memory.{requiredBytes,availableBytes}).
 *
 * Ricerca 06/09/2026: Hub API (huggingface.co/docs/hub/api) — search, author,
 * sort=downloads|likes|created|updated con direction -1; i repository «gated»
 * richiedono l'accesso con account (callout, non un download che fallisce).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RIDISEGNO 06/09/2026 — la schermata bocciata dall'owner («questa schermata ux
 * di huggingface è orrenda, bisogna ridisegnarla»). Misurata prima di toccarla,
 * sul server di prova 4178: il pannello era alto 3.589 px, la lista larga 484 px
 * e il dettaglio 320 px alto 3.330 px; le quattro voci della barra stavano su
 * tre righe a quattro larghezze diverse (280 · 818 · 215 · 110 px); e
 * soprattutto le quindici varianti erano in ordine di NOME — `BF16 · 56,9 GB`
 * prima e preselezionata — con tutte e quindici che dicevano «non ancora
 * misurato», perché il pulsante che misura stava sotto la lista, fuori schermo.
 *
 * ── Ricerca del 06/09/2026, e da lì escono le regole qui sotto ──
 *
 * · HuggingFace, «GGUF · Quantization Types»
 *   (https://huggingface.co/docs/hub/en/gguf, letta il 06/09/2026): la tabella
 *   dichiara i BIT PER PESO di ogni tipo — Q6_K 6,5625 · Q5_K 5,5 · Q4_K 4,5 ·
 *   IQ4_XS 4,25 · Q3_K 3,4375 · Q2_K 2,625 · IQ1_S 1,56 — e marca Q8_0/Q5_0/
 *   Q4_0 come «legacy». È l'unico ordinamento di qualità dichiarato ALLA FONTE:
 *   la scala qui sotto è quella, non una mia classifica.
 *
 * · Un concorrente diretto in questo spazio (local-models docs, letta
 *   06/09/2026) — è l'avversario dichiarato, ed è avanti su due cose:
 *     1. ogni riga porta un verdetto di memoria a tre stati — «Fits your GPU» ·
 *        «Uses system RAM» · «Too big for this machine». I nostri quattro
 *        (compatible · tight · blocked · unknown) ci mappano sopra: parità.
 *     2. sotto i 4 bit la perdita di qualità è troppo severa per essere
 *        offerta di default. ⇒ PAVIMENTO adottato: sotto i 4 bit per
 *        peso non si CONSIGLIA mai.
 *   ⛔ Ma quell'approccio **sceglie al posto tuo e non mostra il conto**: gestisce
 *   tutto il lavoro di adattamento con un clic e via. Il nostro +1 sta lì: consigliamo *e*
 *   mostriamo il verdetto misurato di OGNI variante su QUESTA macchina, con
 *   l'ora della misura, e la scelta resta della persona. E le varianti sotto i
 *   4 bit le ELENCHIAMO marcate invece di nasconderle: nascondere ciò che il
 *   repository contiene è mentire su cosa c'è dentro.
 *   ⛔ Debito noto e NON coperto qui: quell'approccio dimensiona anche il contesto
 *   (almeno una finestra di 64K token), noi stimiamo i soli pesi. La nota che lo
 *   dichiara resta a schermo; il resto è del runtime, non di questa scheda.
 *
 * · LM Studio (lmstudio.ai, guide 2026): la prima esecuzione propone «la
 *   quantizzazione consigliata per il tuo hardware», di norma Q4, dimensionata
 *   sulla RAM. ⇒ si CONSIGLIA una variante, non si lascia scegliere a caso.
 * · Jan.ai (mljourney.com · aimadetools.com, 2026): l'hub etichetta i modelli
 *   «fast · balanced · high-quality» e propone Q4_K_M come equilibrio.
 * · La banda: «Q5_K_M se hai margine, Q6_K/Q8_0 se ne hai da vendere, Q4_K_M se
 *   non ci sta» (dev.to/pat9000 · mustafa.net · willitrunai.com, tutti 2026).
 *
 * ⛔ SOFFITTO: non si consigliano mai F16 · BF16 · F32. Non sono
 * quantizzazioni, sono i pesi pieni: servono a chi converte, non a chi vuole
 * far girare il modello. Restano in elenco, in cima, mai preselezionati.
 */
import { gb } from './modelli-installati.js';

/*
 * BIT PER PESO — la scala di qualità, dalla tabella «Quantization Types» di
 * HuggingFace (letta il 06/09/2026; il link sta nel cappello del file).
 *
 * ⛔ I valori sono quelli DICHIARATI ALLA FONTE dove la fonte li dichiara. Dove
 * la tabella descrive la famiglia e non il suffisso (`Q4_K` senza dire quanto
 * valga `_M` contro `_S`), il suffisso aggiunge una frazione — vedi `SUFFISSO`
 * — che serve SOLO a mettere in fila due varianti della stessa famiglia: non è
 * un dato di HuggingFace e non compare mai a schermo.
 */
export const BIT_PER_PESO = {
  F32: 32, F16: 16, BF16: 16,
  Q8_1: 9, Q8_0: 8.5, Q8_K: 8,
  Q6_K: 6.5625,
  Q5_1: 6, Q5_K: 5.5, Q5_0: 5.5,
  Q4_1: 5, Q4_K: 4.5, Q4_0: 4.5, IQ4_NL: 4.5, IQ4_XS: 4.25, MXFP4: 4.25,
  Q3_K: 3.4375, IQ3_S: 3.44, IQ3_XXS: 3.06,
  Q2_K: 2.625, IQ2_S: 2.5, IQ2_XS: 2.31, IQ2_XXS: 2.06, TQ2_0: 2.06,
  IQ1_M: 1.75, TQ1_0: 1.69, IQ1_S: 1.56,
};
/** Ordine interno alla famiglia: XL > L > M > S. Non è un dato di HuggingFace. */
const SUFFISSO = { XL: 0.4, L: 0.3, M: 0.2, S: 0.1 };
/** Il pavimento adottato: sotto i 4 bit per peso non si consiglia mai. */
export const PAVIMENTO_CONSIGLIO = 4;

/**
 * I bit per peso di una variante, o `null` se il nome non è riconoscibile.
 * ⛔ `null` non è zero: una variante che non so leggere va in FONDO all'elenco,
 * non in cima come farebbe uno zero.
 */
export function bitPerPeso(quant) {
  const nome = String(quant || '').toUpperCase();
  /*
   * ⛔ Un nome che la tabella dichiara PER INTERO non prende nessun ritocco:
   * `IQ1_S` vale 1,56 dichiarato, e leggere quel `_S` finale come «suffisso
   * small» lo faceva diventare 1,66 — un numero che HuggingFace non dice.
   * Il ritocco vale solo dove la tabella si ferma alla famiglia (`Q4_K` + `_M`).
   */
  if (BIT_PER_PESO[nome] != null) return BIT_PER_PESO[nome];
  const base = bitPerPesoFamiglia(nome);
  if (base == null) return null;
  const suffisso = nome.match(/_(XL|L|M|S)$/u);
  return base + (suffisso ? SUFFISSO[suffisso[1]] : 0);
}

/**
 * I bit per peso della FAMIGLIA, senza il ritocco del suffisso: `Q5_K_M` e
 * `Q5_K_S` valgono entrambi 5,5, che è il numero che HuggingFace dichiara.
 *
 * ⛔ Serve perché la banda consigliata («Q4-Q5») è una banda di FAMIGLIE. Con
 * il ritocco del suffisso `Q5_K_M` vale 5,7 e cadeva fuori da una banda scritta
 * `4…5,5`: il ripiego senza misura finiva su Q4_K_M invece che su Q5_K_M. Un
 * numero inventato per ordinare non deve mai entrare in un confronto di soglia.
 */
export function bitPerPesoFamiglia(quant) {
  const nome = String(quant || '').toUpperCase();
  if (BIT_PER_PESO[nome] != null) return BIT_PER_PESO[nome];
  const m = nome.match(/^(I?Q\d(?:_K|_NL|_XS|_XXS)?|MXFP4|TQ\d_\d|BF16|F16|F32)(?:_(?:XL|L|M|S))?$/u);
  if (!m) return null;
  return BIT_PER_PESO[m[1]] ?? null;
}

/** I pesi pieni: si scaricano, non si consigliano. */
export function eSenzaQuantizzazione(quant) {
  return ['F32', 'F16', 'BF16'].includes(String(quant || '').toUpperCase());
}

/*
 * La glossa umana di una quantizzazione: una riga, in italiano, per chi non sa
 * cosa voglia dire `IQ4_XS`. Regola H22 — niente nomi tecnici NUDI a schermo: il
 * nome del file resta (è il nome del file che si scarica) ma non viaggia solo.
 */
const GLOSSE = [
  [/^F32$/u, 'pesi pieni · per convertire, non per usare'],
  [/^(F16|BF16)$/u, 'pesi pieni a metà precisione · per convertire'],
  [/^Q8/u, '8 bit · quasi identico all’originale, pesante'],
  [/^Q6/u, '6 bit · differenza non percepibile, se ci sta'],
  [/^Q5/u, '5 bit · margine di sicurezza su codice e ragionamento'],
  [/^Q4_K/u, '4 bit · il compromesso più usato'],
  [/^Q4/u, '4 bit · metodo vecchio, meglio Q4_K'],
  [/^IQ4/u, '4 bit compressi · più piccolo di Q4, un filo più lento'],
  [/^(Q3|IQ3)/u, '3 bit · si sente, ma entra dove Q4 non entra'],
  [/^(Q2|IQ2|TQ2)/u, '2 bit · ultima spiaggia, qualità in calo netto'],
  [/^(IQ1|TQ1)/u, '1 bit · sperimentale, spesso inservibile'],
  [/^MXFP4$/u, '4 bit a blocchi · formato nuovo'],
];
export function glossaQuant(quant) {
  const nome = String(quant || '').toUpperCase();
  for (const [re, testo] of GLOSSE) if (re.test(nome)) return testo;
  return null;
}

const numero = new Intl.NumberFormat('it-IT');
export function conteggio(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  if (v >= 1_000_000) return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v / 1_000_000)} M`;
  if (v >= 1_000) return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v / 1_000)} k`;
  return numero.format(v);
}

/** Le varianti: i file `-00001-of-00003.gguf` di uno stesso set stanno insieme. */
export function gruppiVarianti(files = []) {
  const gruppi = new Map();
  for (const f of files) {
    if (!/\.gguf$/i.test(f.path || '')) continue;
    const chiave = f.path.replace(/-\d{5}-of-\d{5}(?=\.gguf$)/iu, '');
    const g = gruppi.get(chiave) || []; g.push(f); gruppi.set(chiave, g);
  }
  return [...gruppi.entries()].map(([chiave, items]) => {
    items.sort((a, b) => a.path.localeCompare(b.path));
    const bytes = items.reduce((s, f) => s + Number(f.sizeBytes || 0), 0);
    const attesi = items[0].path.match(/-\d{5}-of-(\d{5})\.gguf$/iu)?.[1];
    return { chiave, file: items, bytes, incompleto: Boolean(attesi && Number(attesi) !== items.length), attesi: attesi ? Number(attesi) : items.length, senzaHash: items.some((f) => !f.sha256), quant: quantDaNome(items[0].path) };
  });
}
export function quantDaNome(percorso = '') {
  const nome = String(percorso).split('/').pop() || '';
  /*
   * ⛔ 06/09, trovato dal vivo su `Qwen3-Coder-30B-A3B-Instruct-UD-TQ1_0.gguf`:
   * la sigla non veniva riconosciuta e il titolo della variante diventava il
   * NOME DEL FILE INTERO — una riga lunghissima nella colonna da 320 px, senza
   * glossa e fuori dall'ordinamento di qualità. `UD-` è il prefisso delle
   * quantizzazioni dinamiche di Unsloth (`UD-Q4_K_XL`, `UD-TQ1_0`): si salta,
   * la sigla vera è quella che segue.
   */
  const m = nome.match(/[._-](?:UD-)?(I?Q\d[A-Z0-9_]*|TQ\d_\d|MXFP4|F16|BF16|F32)(?=[._-]|\.gguf$)/i);
  return m ? m[1].toUpperCase() : nome.replace(/\.gguf$/i, '');
}

/**
 * Le varianti in ordine di QUALITÀ decrescente, non di nome.
 *
 * ⛔ È il difetto che ha fatto bocciare la schermata: l'API restituisce i file
 * in ordine alfabetico, e `BF16 · 56,9 GB` finiva primo e preselezionato su una
 * macchina che non può caricarlo. Qui in cima c'è la variante più fedele, in
 * fondo la più compressa, e chi non so leggere sta dopo tutte (mai in cima:
 * vedi `bitPerPeso`, che torna `null` e non zero).
 */
export function ordinaVarianti(gruppi = []) {
  return [...gruppi].sort((a, b) => {
    const qa = bitPerPeso(a.quant); const qb = bitPerPeso(b.quant);
    if (qa == null && qb == null) return String(a.quant).localeCompare(String(b.quant));
    if (qa == null) return 1;
    if (qb == null) return -1;
    if (qa !== qb) return qb - qa;
    return String(a.quant).localeCompare(String(b.quant));
  });
}

/**
 * La variante CONSIGLIATA su questa macchina, o `null` se non si può consigliare.
 *
 * La regola, dalle fonti citate nel cappello:
 *  · mai un set incompleto o senza impronta sha256 — non si scarica comunque;
 *  · mai i pesi pieni (F16/BF16/F32): sono per chi converte — SOFFITTO;
 *  · mai sotto i 4 bit per peso: sotto quella soglia la perdita di qualità
 *    è troppo severa — PAVIMENTO;
 *  · fra quelle rimaste si prende **la più fedele che ci sta davvero**:
 *    prima le `compatible`, e solo se non ce n'è nessuna le `tight`.
 *
 * ⛔ Senza misura NON si inventa un verdetto: si ripiega sulla banda che le
 * fonti indicano come predefinita (Q4_K_M/Q5_K_M, cioè 4-5,5 bit per peso),
 * e `motivo` dice che è un ripiego. Un consiglio dato per misura e un consiglio
 * dato per convenzione non si scrivono con la stessa faccia.
 */
export function varianteConsigliata(gruppi = [], stima = new Map()) {
  const leggi = (chiave) => (typeof stima?.get === 'function' ? stima.get(chiave) : undefined);
  const ammesse = ordinaVarianti(gruppi).filter((g) => {
    if (g.incompleto || g.senzaHash) return false;
    if (eSenzaQuantizzazione(g.quant)) return false;
    const bit = bitPerPeso(g.quant);
    return bit != null && bit >= PAVIMENTO_CONSIGLIO;
  });
  if (!ammesse.length) return null;
  /*
   * ⛔ `unknown` NON è una misura: è «non sono riuscito a misurare».
   *
   * Trovato dal vivo il 06/09 e invisibile ai test unitari: su una macchina
   * senza runtime locale `/fit-estimate` risponde **503 RUNTIME_NOT_AVAILABLE**,
   * e tutte e ventisette le varianti tornavano `{state:'unknown'}`. Contandole
   * come misurate, il consiglio spariva («nessuna ci sta») e restava
   * preselezionato il primo dell'elenco — cioè di nuovo `BF16· 56,9 GB`,
   * esattamente il difetto che stavo curando. Senza verdetto si ripiega sulla
   * convenzione, che è ciò che fa una persona quando non può misurare.
   */
  const misurate = ammesse.filter((g) => { const v = leggi(g.chiave); return v && !v.inCorso && ['compatible', 'tight', 'blocked'].includes(v.state); });
  if (misurate.length) {
    const entra = misurate.find((g) => leggi(g.chiave).state === 'compatible');
    if (entra) return { gruppo: entra, motivo: 'misura' };
    const limite = misurate.find((g) => leggi(g.chiave).state === 'tight');
    if (limite) return { gruppo: limite, motivo: 'limite' };
    return null; // misurate tutte e nessuna ci sta: NON si consiglia niente
  }
  // ⛔ la banda si misura sulla FAMIGLIA (4…5,5 = Q4_K/Q5_K): il ritocco del suffisso serve a ordinare, non a decidere.
  const banda = ammesse.filter((g) => { const b = bitPerPesoFamiglia(g.quant); return b >= 4 && b <= 5.5; });
  return { gruppo: banda[0] || ammesse[ammesse.length - 1], motivo: 'convenzione' };
}

/** La stima di una variante in parole del mockup: «~8,1 GB di memoria · entra». */
export function descriviStima(stima, bytes) {
  if (!stima) return { testo: bytes ? `${gb(bytes)} da scaricare · non ancora misurato` : 'non ancora misurato', tono: '' };
  if (stima.inCorso) return { testo: 'Misuro su questo PC…', tono: '' };
  const richiesti = Number.isFinite(stima.memory?.requiredBytes) ? stima.memory.requiredBytes : bytes;
  const liberi = stima.memory?.availableBytes;
  if (stima.state === 'compatible') return { testo: `~${gb(richiesti)} di memoria · entra`, tono: 'success' };
  if (stima.state === 'tight') return { testo: `~${gb(richiesti)} di memoria · al limite`, tono: 'warning' };
  if (stima.state === 'blocked' && stima.reason === 'storage') return { testo: `${gb(bytes)} · non c'è spazio sul disco`, tono: 'danger' };
  if (stima.state === 'blocked') return { testo: `~${gb(richiesti)} · oltre la memoria allocabile`, tono: 'danger', liberi };
  /*
   * ⛔ `unknown`: la macchina non si è potuta misurare. Il PERCHÉ lo dice il
   * callout in cima, una volta sola; ripeterlo su ognuna delle ventisette
   * righe (visto in una foto del 06/09) riempie la colonna di rumore e
   * cancella l'unico dato che resta vero — quanto pesa il file da scaricare.
   */
  return { testo: bytes ? `${gb(bytes)} da scaricare · memoria non misurata` : 'memoria non misurata', tono: '' };
}

const TIPI = { 'text-generation': 'Conversazione e codice', 'text2text-generation': 'Testo', 'image-text-to-text': 'Immagini e testo', 'automatic-speech-recognition': 'Voce', 'feature-extraction': 'Embedding' };

/** Cosa dice una riga di risultato. */
export function datiRepoHf(item = {}) {
  const [autore, nome] = String(item.repo || item.id || '').split('/');
  const conversione = Boolean(item.communityConversion) || /gguf$/i.test(autore || '') || /^(bartowski|unsloth|mradermacher|lmstudio-community|TheBloke|QuantFactory)$/i.test(autore || '');
  const fileGguf = Number.isFinite(item.ggufFiles) ? item.ggufFiles : null;
  const tipo = conversione ? 'Conversione della community' : (TIPI[item.pipelineTag] || 'Modello'); // chi ha convertito conta più del tipo: la licenza e la responsabilità sono sue
  const sub1 = `${tipo}${fileGguf != null ? ` · ${fileGguf === 1 ? '1 file' : `${fileGguf} file`}${conversione ? '' : ' compatibili'}` : ''}`;
  const sub2 = item.gated ? 'Verifica le condizioni prima del download' : (item.license ? `Licenza ${item.license}` : 'Licenza non dichiarata');
  return {
    id: item.repo || item.id, titolo: `${autore} / ${nome || ''}`.trim(), autore, match: String(item.repo || '').toLowerCase(),
    /* `conversione` esce da qui dal 19/09/2026 perché serve anche ai GRUPPI della lista
       (`raggruppaRisultatiHf`): era calcolata e poi usata solo per comporre `sub1`. */
    conversione,
    sub1, sub2,
    badge: item.gated ? { testo: 'Accesso richiesto', tono: 'warning' } : (conversione ? null : { testo: 'Autore del modello', tono: 'info' }),
    download: conteggio(item.downloads), likes: conteggio(item.likes), gated: Boolean(item.gated),
  };
}

/*
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * LA SCOPERTA — chip coi conteggi, faccette, gruppi, righe (FASE 4-bis, corsia A, 19/09/2026)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Owner, 19/09/2026, guardando il suo schermo: «La lista Hugging Face non è quella del mock-up.
 * Il mock-up ha una formattazione e uno stile molto migliore».
 *
 * ⛔ IL MOCKUP, MISURATO DAL SUO DOM VIVO (`TALOS-Calm-Lab-04.html` servito su 127.0.0.1:4214,
 *   scheda `models`; non dal CSS a occhio) — i numeri sono quelli letti con `getBoundingClientRect`
 *   e `getComputedStyle`, e sono i termini di paragone di ogni scelta qui sotto:
 *   · riga di comandi: campo di ricerca (902×40, raggio 9) + «Ordina» + selettore (204×42);
 *   · chip coi conteggi (`button.chip` 32 px, `padding:6px 12px`, raggio 6, `gap:7px`, 12 px):
 *     «Tutti» (attivo: fondo `#e8e4db`, bordo `#c8c3b9`) · «Locali 12» · «Cloud 3» ·
 *     divisore verticale · «Installati 2» · «☆ Preferiti». Il conteggio è `span.facet-count`;
 *   · quattro select di faccetta (`.facet-select`, etichetta 11 px sopra, select 42 px) —
 *     «Grandezza · parametri totali» · «Contesto minimo · token» · «Formato del file» ·
 *     «Compatibilità RAM · demo» — e la nota a 11 px «1B = un miliardo di parametri. Parametri ≠
 *     peso del file ≠ memoria richiesta.»;
 *   · testa dei risultati (`.catalog-results-head`, bordo superiore): «15 modelli» in grassetto +
 *     «su 15 nel catalogo demo», e a destra «Viste salvate (0)» + «+ Salva vista»;
 *   · gruppi (`.list-group-label`, 10 px, `letter-spacing:1px`, MAIUSCOLO, col conteggio a
 *     destra): «SUL DISPOSITIVO 12» / «VIA PROVIDER 3»;
 *   · righe `article.model-row` **1122×96** (`.model-row-copy` 764×64 dentro): glifo 38×38
 *     (`.model-glyph`, raggio 10), nome 14 px/550 + badge «Predefinito» 9 px, meta 12 px,
 *     «● Sul dispositivo» 11 px verde con pallino 5 px; a destra la colonna `.row-capacity`
 *     (8,2B 14/500 · «parametri totali» 11 · «32.768 token» 10), il chevron, la stella e la
 *     casella di confronto.
 *
 * ⛔ QUELLO CHE SI PORTA È LA FORMA, NON I SUOI DATI. I valori del mockup sono di un catalogo
 *   dimostrativo (`Locali/Cloud`, `parametri`, «Compatibilità RAM · demo») e le faccette che li
 *   leggono NON hanno una sorgente nella risposta vera della ricerca: `searchModels`
 *   (`hf-hub-client.mjs:60`) mappa ogni riga su OTTO campi soli — `repo`, `revision`, `downloads`,
 *   `likes`, `gated`, `pipelineTag`, `license`, `tags`. Tutto il resto si ELENCA
 *   (`FACCETTE_NON_COLLEGATE`) e non si inventa: è la regola del 18/09 («ciò che non si collega si
 *   elenca, non si inventa»).
 *
 * ⛔ RICERCA — la forma della scoperta, letta il 19/09/2026 (le stesse fonti del brief di fase):
 *   · OR dentro una faccetta, AND fra faccette; il conteggio di un valore si calcola SENZA il
 *     filtro della sua stessa faccetta; i valori a zero restano VISIBILI e si GRIGIANO; i conteggi
 *     stanno accanto ai valori; `aria-live` sui cambi di risultato; 5-8 faccette visibili.
 *     Fonti: <https://www.saasui.design/blog/saas-filtering-sorting-ux-patterns> ·
 *     <https://www.ideaplan.io/templates/faceted-search-template> ·
 *     <https://www.designsystems.one/design-systems/patterns/filters-and-refinement> ·
 *     <https://www.uixhero.com/resources/ui-components/filter> (lette il 19/09/2026).
 *   · Perché NON c'è un «Vedi altri» sulle faccette lunghe (autore, tipo): qui ogni faccetta è un
 *     `<select>` come nel mockup (`.facet-select`), e in un select l'eccedenza si scorre da sé —
 *     il ripiego del pattern vale per gli elenchi di caselle. Il limite delle 5-8 faccette resta
 *     rispettato: qui se ne offrono cinque in tutto, due a chip e tre a select.
 *   · Perché i tipi di pipeline hanno un'etichetta umana e non il valore grezzo: regola H22 —
 *     a schermo non va mai il nome tecnico nudo.
 */

/**
 * I CAMPI CHE LA RICERCA RESTITUISCE DAVVERO. È la sorgente di ogni faccetta: ciò che non è in
 * questo elenco non ha un dato dietro, e la faccetta che lo userebbe non si offre.
 */
export const CAMPI_RICERCA_HF = Object.freeze(['repo', 'revision', 'downloads', 'likes', 'gated', 'pipelineTag', 'license', 'tags']);

/*
 * ⛔ LE FACCETTE DEL MOCKUP CHE QUI NON SI POSSONO OFFRIRE — elencate, non inventate.
 *   Ognuna dice la sua ragione MISURATA sul campo che le mancherebbe:
 *   · «Grandezza · parametri totali» — i parametri non sono in nessuno degli otto campi. L'API li
 *     porta dentro `expand[]=gguf`, che il client chiede e poi SCARTA (`hf-hub-client.mjs:60`,
 *     la mappa finale tiene otto campi). Leggerli dal NOME del repository sarebbe inventare.
 *   · «Contesto minimo · token» — stessa sorte dei parametri: sta in `expand[]=gguf`.
 *   · «Formato del file» — il server aggiunge SEMPRE `filter=gguf` alla ricerca
 *     (`hf-hub-client.mjs:66`), quindi ogni risultato è GGUF per costruzione: una faccetta con un
 *     valore solo è un controllo che non filtra niente.
 *   · «Compatibilità RAM · demo» — il verdetto di memoria si misura sui FILE, e i file si
 *     conoscono solo dal dettaglio del repository (`/api/v1/huggingface/repo`) o dalla stima
 *     (`/api/v1/local-models/fit-estimate?bytes=…`). Non c'è un verdetto per riga di ricerca, e
 *     chiederlo per venti righe sarebbe venti chiamate di rete per disegnare una lista.
 *   · «Locali / Cloud» e «Installati / Preferiti» — la ricerca Hugging Face non mescola
 *     destinazioni: restituisce repository, non modelli installati, e non ha una nozione di
 *     preferito. (I due dati veri che le somigliano — `/api/v1/local-models` e i preferiti — non
 *     esistono in questa risposta.)
 *   · «Viste salvate (0)» + «+ Salva vista» — non esiste nessuna memoria delle viste nel
 *     prodotto: un pulsante «Salva vista» qui non avrebbe dove scrivere.
 *   · La stella dei preferiti e la casella di confronto dentro la riga — stesso motivo: non c'è
 *     un archivio dei preferiti né una modalità confronto. Un controllo che non fa niente è
 *     peggio di un controllo assente.
 */
export const FACCETTE_NON_COLLEGATE = Object.freeze([
  ['Grandezza · parametri totali', 'i parametri non sono in nessuno degli otto campi della ricerca'],
  ['Contesto minimo · token', 'il contesto non è in nessuno degli otto campi della ricerca'],
  ['Formato del file', 'il server filtra sempre `gguf`: la faccetta avrebbe un valore solo'],
  ['Compatibilità RAM', 'il verdetto si misura sui file, che si conoscono solo dal dettaglio'],
  ['Locali · Cloud · Installati · Preferiti', 'la ricerca restituisce repository, non modelli installati'],
  ['Viste salvate · + Salva vista', 'il prodotto non ha una memoria delle viste'],
  ['Stella dei preferiti · casella di confronto', 'non esistono un archivio dei preferiti né una modalità confronto'],
]);

/*
 * I TIPI DI PIPELINE — le etichette umane dei valori che `pipelineTag` può portare.
 *
 * ⛔ RICERCA, 19/09/2026: i valori ammessi sono le chiavi di `PIPELINE_DATA` in
 *   `huggingface.js/packages/tasks/src/pipelines.ts` (57 tipi), che la documentazione indica come
 *   il posto dove si aggiunge un tipo — <https://huggingface.co/docs/hub/models-tasks> (letta il
 *   19/09/2026) — e il file è la fonte dei valori, letto il 19/09/2026. Le etichette qui sotto
 *   traducono il campo `name` di ognuno.
 * ⛔ Un valore che questa tabella non conosce NON prende un'etichetta inventata: `etichettaTipoHf`
 *   lo scrive com'è. Un tipo che non so nominare resta un'informazione vera; battezzarlo a caso
 *   sarebbe la sola cosa peggiore del mostrarlo (regola H22: il grezzo resta, ma non da solo
 *   quando si sa come si chiama).
 */
const TIPI_PIPELINE = Object.freeze({
  'text-generation': 'Conversazione e codice',
  'text2text-generation': 'Testo in testo',
  'text-classification': 'Classificazione del testo',
  'token-classification': 'Etichettatura del testo',
  'question-answering': 'Domande su un testo',
  'table-question-answering': 'Domande su una tabella',
  'zero-shot-classification': 'Classificazione senza esempi',
  translation: 'Traduzione',
  summarization: 'Riassunto',
  'feature-extraction': 'Vettori di testo',
  'fill-mask': 'Parole mancanti',
  'sentence-similarity': 'Somiglianza fra frasi',
  'text-ranking': 'Ordinamento del testo',
  'text-to-speech': 'Voce sintetica',
  'text-to-audio': 'Audio da testo',
  'automatic-speech-recognition': 'Trascrizione della voce',
  'audio-to-audio': 'Trasformazione audio',
  'audio-classification': 'Classificazione audio',
  'depth-estimation': 'Profondità da immagine',
  'image-classification': 'Classificazione di immagini',
  'object-detection': 'Riconoscimento di oggetti',
  'image-segmentation': 'Segmentazione di immagini',
  'text-to-image': 'Immagini da testo',
  'image-to-text': 'Testo da immagine',
  'image-to-image': 'Trasformazione di immagini',
  'image-to-video': 'Video da immagine',
  'unconditional-image-generation': 'Generazione di immagini',
  'video-classification': 'Classificazione video',
  'text-to-video': 'Video da testo',
  'zero-shot-image-classification': 'Immagini senza esempi',
  'zero-shot-object-detection': 'Oggetti senza esempi',
  'mask-generation': 'Maschere da immagine',
  'image-feature-extraction': 'Vettori di immagine',
  'image-text-to-text': 'Immagini e testo',
  'image-text-to-image': 'Immagini da immagini e testo',
  'image-text-to-video': 'Video da immagini e testo',
  'visual-question-answering': 'Domande su un’immagine',
  'document-question-answering': 'Domande su un documento',
  'video-text-to-text': 'Video e testo',
  'any-to-any': 'Qualsiasi formato',
  'audio-text-to-text': 'Voce e testo',
  'reinforcement-learning': 'Apprendimento per rinforzo',
  robotics: 'Robotica',
  'tabular-classification': 'Classificazione tabellare',
  'tabular-regression': 'Regressione tabellare',
  'time-series-forecasting': 'Previsione di serie',
  'graph-ml': 'Grafi',
  other: 'Altro',
});
/** `null` = «nessun tipo dichiarato»: un valore VERO, e diverso da «tipo sconosciuto». */
export const TIPO_NON_DICHIARATO = '__non-dichiarato';
export function etichettaTipoHf(valore) {
  if (valore === TIPO_NON_DICHIARATO) return 'Tipo non dichiarato';
  return TIPI_PIPELINE[valore] || String(valore);
}

/*
 * LE BANDE DI POPOLARITÀ — le soglie sono NOSTRE e dichiarate: Hugging Face non ha una nozione di
 * «fascia di download» (l'API ordina per `downloads` e basta). Sono l'analogo onesto della faccetta
 * «Grandezza · parametri totali» del mockup: l'unico numero vero e continuo che la ricerca porta è
 * quello dei download, ed è già quello con cui il prodotto ordina (`#modelLabHfSortControl`).
 */
export const BANDE_DOWNLOAD = Object.freeze([
  ['oltre-100k', 'Oltre 100.000', (n) => n > 100_000],
  ['10k-100k', 'Da 100.000 a 10.000', (n) => n > 10_000],
  ['1k-10k', 'Da 10.000 a 1.000', (n) => n > 1_000],
  ['fino-1k', 'Fino a 1.000', (n) => n >= 0],
  ['non-dichiarati', 'Download non dichiarati', () => false],
]);
export function bandaDownload(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 'non-dichiarati';
  return (BANDE_DOWNLOAD.find(([, , prova]) => prova(v)) || BANDE_DOWNLOAD[BANDE_DOWNLOAD.length - 1])[0];
}

/** Le cinque faccette che i dati veri sostengono: due a chip (l'ambito) e tre a select. */
export const FACCETTE_HF = Object.freeze([
  { chiave: 'accesso', titolo: 'Accesso', forma: 'chip' },
  { chiave: 'licenza', titolo: 'Licenza', forma: 'chip' },
  { chiave: 'popolarita', titolo: 'Popolarità · download', forma: 'select' },
  { chiave: 'tipo', titolo: 'Tipo · pipeline', forma: 'select' },
  { chiave: 'autore', titolo: 'Autore · organizzazione', forma: 'select' },
]);

/**
 * Il valore di UNA faccetta per UN risultato. Sempre una sola stringa: è la regola che rende il
 * conteggio giusto (un risultato conta una volta sola dentro la sua faccetta).
 */
export function valoreFaccettaHf(item = {}, chiave) {
  if (chiave === 'accesso') return item.gated === true ? 'richiesto' : 'aperto';
  if (chiave === 'licenza') return item.license ? 'dichiarata' : 'non-dichiarata';
  if (chiave === 'popolarita') return bandaDownload(item.downloads);
  if (chiave === 'tipo') return item.pipelineTag || TIPO_NON_DICHIARATO;
  if (chiave === 'autore') return String(item.repo || item.id || '').split('/')[0] || TIPO_NON_DICHIARATO;
  return null;
}

/*
 * IL VOCABOLARIO di una faccetta. Due nature, e la differenza conta:
 *  · FISSO (`accesso`, `licenza`, `popolarita`): le voci ci sono SEMPRE, anche a zero — un valore a
 *    zero dice che quel valore esiste nel vocabolario e che adesso non c'è niente dentro, ed è
 *    un'informazione. Si grigia, non si nasconde (fonti del 19/09/2026, vedi il cappello).
 *  · DERIVATO (`tipo`, `autore`): le voci sono quelle presenti nei risultati ricevuti. Non ha senso
 *    elencare un autore che non c'è: il vocabolario non esiste a priori.
 */
export function vociFaccettaHf(risultati = [], chiave) {
  if (chiave === 'accesso') return [['aperto', 'Accesso aperto'], ['richiesto', 'Accesso richiesto']];
  if (chiave === 'licenza') return [['dichiarata', 'Con licenza'], ['non-dichiarata', 'Senza licenza']];
  if (chiave === 'popolarita') return BANDE_DOWNLOAD.map(([valore, testo]) => [valore, testo]);
  if (chiave !== 'tipo' && chiave !== 'autore') return [];
  const conteggi = new Map();
  for (const item of risultati) {
    const v = valoreFaccettaHf(item, chiave);
    if (v != null) conteggi.set(v, (conteggi.get(v) || 0) + 1);
  }
  return [...conteggi.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'it'))
    .map(([valore]) => [valore, chiave === 'tipo' ? etichettaTipoHf(valore) : valore]);
}

export function filtriHfVuoti() { return { accesso: [], licenza: [], popolarita: [], tipo: [], autore: [] }; }

/**
 * Ripulisce i filtri ricevuti: chiavi che non sono faccette e valori che non sono nel vocabolario
 * si SCARTANO. Senza, un filtro rimasto da un'altra lista (o da un vocabolario che nel frattempo è
 * cambiato) svuoterebbe la lista senza che nessun controllo a schermo lo mostri — la stessa specie
 * del chip che non toglie niente.
 */
export function normalizzaFiltriHf(grezzi = {}, risultati = []) {
  const puliti = filtriHfVuoti();
  for (const { chiave } of FACCETTE_HF) {
    const ammessi = new Set(vociFaccettaHf(risultati, chiave).map(([valore]) => valore));
    const scelti = Array.isArray(grezzi?.[chiave]) ? grezzi[chiave] : [];
    puliti[chiave] = scelti.filter((valore, i) => ammessi.has(valore) && scelti.indexOf(valore) === i);
  }
  return puliti;
}

/** AND fra faccette, OR dentro una faccetta. */
export function filtraRisultatiHf(risultati = [], filtri = {}) {
  const attivi = normalizzaFiltriHf(filtri, risultati);
  return risultati.filter((item) => FACCETTE_HF.every(({ chiave }) => !attivi[chiave].length || attivi[chiave].includes(valoreFaccettaHf(item, chiave))));
}

/**
 * I CONTEGGI DI UNA FACCETTA, valore per valore.
 * ⛔ La faccetta che si sta contando si Svuota prima di contare: è la regola («il conteggio di un
 *   valore si calcola senza il filtro della sua stessa faccetta»), ed è ciò che permette di
 *   scegliere un secondo valore invece di vederselo sparire davanti. Tutte le altre restano.
 */
export function conteggiFaccettaHf(risultati = [], filtri = {}, chiave) {
  const senzaLaPropria = { ...normalizzaFiltriHf(filtri, risultati), [chiave]: [] };
  const conteggi = new Map();
  for (const item of filtraRisultatiHf(risultati, senzaLaPropria)) {
    const v = valoreFaccettaHf(item, chiave);
    if (v != null) conteggi.set(v, (conteggi.get(v) || 0) + 1);
  }
  return conteggi;
}

/*
 * I GRUPPI della lista. Il mockup raggruppa per DESTINAZIONE («SUL DISPOSITIVO 12» /
 * «VIA PROVIDER 3»): una partizione vera con una conseguenza vera — da una parte quelli che partono
 * subito, dall'altra quelli che hanno bisogno di qualcosa in più.
 *
 * ⛔ LA PARTIZIONE CHE SEMBRAVA OVVIA L'HO SCARTATA DOPO AVERLA MISURATA: l'accesso (`gated`) è il
 *   campo con la conseguenza più forte — un repository «gated» vuole che si chieda l'autorizzazione
 *   con il proprio account — ma su una ricerca di GGUF **non capita mai**. Misurato sul servizio
 *   vero il 19/09/2026, sei ricerche (`gguf`, `gguf qwen`, `gguf instruct`, `gguf gemma`,
 *   `gguf llama 3`, `gemma-2 gguf`, 50 risultati ciascuna, più `filter=gated`): **0 repository
 *   gated su oltre 250 righe**. Con quella partizione la lista avrebbe avuto UN gruppo solo — e
 *   un gruppo solo non è una partizione, è la lista di prima con un titolo sopra. (Le conversioni
 *   GGUF della community sono pubbliche per costruzione: è il mestiere di chi le fa.)
 *   ⇒ `gated` resta dov'è utile — il chip «Accesso richiesto», che a zero si GRIGIA, e il callout
 *     del pannello — e i gruppi usano una partizione che ha davvero due lati.
 *
 * ⛔ LE DUE CANDIDATE SCARTATE, e ognuna col suo perché misurato sui dati veri del 19/09/2026
 *   (104 repository distinti, sei ricerche):
 *   · PROVENIENZA («Autore del modello» / «Conversione della community»), che è ciò che il badge
 *     della riga dichiara dal 06/09. Quella partizione viene da una EURISTICA
 *     (`datiRepoHf.conversione`: un elenco di convertitori noti più `communityConversion`), non da un
 *     campo — e sui risultati veri mette sotto «Autore del modello» `cdiamond`, `huihui-ai`,
 *     `HauHauCS`, `DavidAU`, che sono fine-tuner e convertitori della community, non gli autori dei
 *     modelli. Come parola di un BADGE è un segnale morbido; come TITOLO DI UN GRUPPO è
 *     un'affermazione, e sarebbe stata sbagliata su metà della lista. (L'euristica NON si tocca qui:
 *     il suo contratto è provato da `tests/unit/hf-catalogo.test.mjs`. Resta segnalata nel referto.)
 *   · ACCESSO (`gated`): la conseguenza più forte — un repository gated vuole che si chieda
 *     l'autorizzazione — ma su una ricerca di GGUF **non capita mai**: **0 repository gated su 104**,
 *     e zero anche su `filter=gated`. Una partizione con un lato solo non è una partizione, è la
 *     lista di prima con un titolo sopra. `gated` resta dov'è utile: il chip (che a zero si griglia)
 *     e il callout del pannello.
 *
 * ⛔ RICERCA — I DUE ASSI CON CUI HUGGING FACE STESSA RAGGRUPPA, letti il 19/09/2026: i modelli si
 *   filtrano per **`pipeline_tag`** (la mansione: Text Generation, Summarization, ASR, Text-to-Image,
 *   VQA…) e per **`library`** (il framework: Transformers, PEFT, Safetensors, GGUF, vLLM, Ollama…).
 *   Fonti: <https://huggingface.co/docs/hub/models-tasks> e la guida ai due assi di filtro, lette il
 *   19/09/2026. **LM Studio**, il concorrente più vicino, **non raggruppa affatto la lista Discover**
 *   — ha liste curate e recenti, icone di capacità, filtri per formato e la tendina delle
 *   quantizzazioni; l'unico raggruppamento documentato è per publisher, e vale per la LIBRERIA
 *   locale. Fonti: <https://beta.lmstudio.ai/docs/app/basics/download-model> ·
 *   <https://deepwiki.com/lmstudio-ai/docs/1.2-core-application-features> ·
 *   <https://raw.githubusercontent.com/huggingface/hub-docs/main/docs/hub/lmstudio.md> ·
 *   <https://markaicode.com/lm-studio-model-management-download-organize-switch/> (lette il
 *   19/09/2026). ⇒ Raggruppare i RISULTATI è un vantaggio nostro, non una copia: si sceglie l'asse
 *   che i DATI sostengono, e l'altro si dichiara — non si inventa un gruppo che i dati non riempiono.
 *
 * ⛔ L'ASSE SCELTO È IL TIPO (`pipelineTag`), MISURATO SU 104 REPOSITORY VERI: **91 con un tipo
 *   dichiarato**, in cinque gruppi — `text-generation` 54 · `image-text-to-text` 27 · `any-to-any` 7
 *   · `automatic-speech-recognition` 2 · `text-to-speech` 1 — e **13 senza tipo**. I 13 NON restano
 *   fuori: vanno nel gruppo «Tipo non dichiarato», che è un valore vero e distinto da «modello», e
 *   **nessuno dei 104 resta fuori da ogni gruppo**. L'ordine è per numerosità, come la faccetta, e i
 *   gruppi VUOTI non si disegnano: un titolo senza righe non è un gruppo.
 *   Le etichette sono le stesse della faccetta «Tipo · pipeline» (`etichettaTipoHf`, con la fonte nel
 *   suo cappello), così la testa del gruppo e la voce del select dicono la stessa parola per la
 *   stessa cosa — la stessa ridondanza che il mockup ha fra il chip «Locali 12» e il gruppo
 *   «SUL DISPOSITIVO 12».
 *
 * ⛔ L'ASSE `library` È DICHIARATO NON DISPONIBILE, e la ragione è una misura, non una preferenza:
 *   · il campo `library` **non c'è in nessuna delle 104 righe** — la ricerca mappa otto campi
 *     (`repo · revision · downloads · likes · gated · pipelineTag · license · tags`,
 *     `hf-hub-client.mjs:60`) e `library` non è fra quelli. Si potrebbe chiedere all'hub (l'API
 *     espone `models-tags-by-type`, e il client chiede già `expand[]=cardData` che lo contiene), ma
 *     quei campi li SCARTA il client, che non è un file di questa corsia;
 *   · e NON si ricava dai `tags`: 104 su 104 ne portano almeno uno di libreria, ma **51 su 104 ne
 *     portano PIÙ DI UNO** (`transformers` + `gguf` + `llama.cpp` insieme). Un valore multi-valore
 *     non PARTIZIONA: lo stesso repository finirebbe in due gruppi, oppure servirebbe una regola di
 *     precedenza che nessuna fonte dichiara — cioè un'invenzione.
 */
export function raggruppaRisultatiHf(risultati = []) {
  const perTipo = new Map();
  for (const r of risultati) {
    const v = valoreFaccettaHf(r, 'tipo');
    if (!perTipo.has(v)) perTipo.set(v, []);
    perTipo.get(v).push(r);
  }
  return [...perTipo.entries()]
    .sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0]), 'it'))
    .map(([chiave, righe]) => ({ chiave, etichetta: etichettaTipoHf(chiave), righe }));
}

/**
 * LA RIGA del mockup, campo per campo — e da dove viene ognuno dei suoi pezzi.
 * `datiRepoHf` resta la sola calcolatrice dei testi (e il suo contratto non si tocca: `sub1`,
 * `sub2` e `badge` sono provati da `tests/unit/hf-catalogo.test.mjs`); qui si aggiunge l'anatomia.
 */
export function datiRigaHf(item = {}) {
  const base = datiRepoHf(item);
  const richiesto = base.gated;
  return {
    ...base,
    accesso: richiesto ? 'richiesto' : 'aperto',
    /*
     * `.row-availability` del mockup: un pallino colorato e lo stato. Il tono non è decorazione —
     * verde = si scarica, ambra = serve prima l'accesso.
     * ⛔ LA NOTA SI LASCIA FUORI QUANDO IL REPOSITORY È GATED, e la ragione è una misura: la riga è
     *   alta una riga sola e non manda a capo (`talos-list-row__sub`: `nowrap` + `ellipsis`), e con
     *   la condizione estesa — «Accesso richiesto · Verifica le condizioni prima del download» — il
     *   testo andava a 325 px in una scatola da 320 e veniva TAGLIATO A METÀ PAROLA, senza nemmeno i
     *   puntini (misurato il 19/09/2026 con `scrollWidth`/`clientWidth` sulla riga vera). Il badge
     *   dice già «Accesso richiesto», e la frase intera sta nel callout del pannello (`#hfAccesso`),
     *   dove c'è lo spazio: in riga resta lo stato, che è corto e non si taglia. Per un repository
     *   aperto invece la licenza resta: è corta e non c'era altrove.
     */
    stato: { testo: richiesto ? 'Accesso richiesto' : 'Accesso aperto', tono: richiesto ? 'warning' : 'success', nota: richiesto ? null : base.sub2 },
    /* `.row-capacity` del mockup: un numero grande, la sua etichetta, e sotto un secondo fatto.
       I due numeri veri che la ricerca porta sono i download e i preferiti. */
    capacita: { misura: base.download, etichetta: 'download', nota: base.likes ? `♥ ${base.likes} preferiti` : null },
    revisione: item.revision || null,
  };
}

/** La nota sotto le faccette: dice a schermo ciò che la ricerca NON porta (vedi FACCETTE_NON_COLLEGATE). */
export const NOTA_FACCETTE_HF = 'La ricerca dice tipo, licenza, download e revisione. I parametri, il contesto e la memoria richiesta non sono nella risposta della ricerca: la memoria si misura nel dettaglio, file per file.';

function el(d, tag, classe, testo) { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; }
function icona(d, nome, classe = 'i') { const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', classe); svg.setAttribute('aria-hidden', 'true'); const use = d.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${nome}`); svg.appendChild(use); return svg; }
function badge(d, testo, tono) { const b = el(d, 'span', `talos-badge talos-badge--sm${tono ? ` talos-badge--${tono}` : ''}`, testo); b.dataset.c = 'Badge'; return b; }

/**
 * LA RIGA — l'anatomia di `article.model-row` (1122×96), coi pezzi che i dati veri sostengono.
 *
 *    ┌──┬───────────────────────────────────────────────┬──────────────────────┬──┐
 *    │▣ │ autore / nome            [badge]              │ 12,7 M               │› │
 *    │  │ Conversazione e codice · 3 file compatibili   │ download             │  │
 *    │  │ ● Accesso aperto · Licenza apache-2.0         │ ♥ 1.034 preferiti    │  │
 *    └──┴───────────────────────────────────────────────┴──────────────────────┴──┘
 *
 * ⛔ LA RIGA È UN `<button>`, E IL CLIC ESCE DA QUI: `seleziona(id)` con l'id del repository e,
 *   sullo stesso nodo, `data-hf` (il repository) e `data-hf-revisione` (il commit risolto).
 *   È l'unico nodo da agganciare: vedi la nota su `aggiornaHf` per chi lo ascolta oggi.
 * ⛔ La stella dei preferiti e la casella di confronto del mockup NON ci sono: non esiste un
 *   archivio dei preferiti né una modalità confronto, e un controllo che non fa niente è peggio di
 *   un controllo assente (vedi `FACCETTE_NON_COLLEGATE`). Il chevron invece resta: dice che la riga
 *   porta da qualche parte, ed è vero — porta alla pagina del modello.
 */
export function creaRigaHf(dati, { selezionato = false, seleziona, document: d = globalThis.document } = {}) {
  const b = el(d, 'button', 'talos-list-row'); b.type = 'button'; b.dataset.c = 'ListRow'; b.dataset.hf = dati.id; b.dataset.author = dati.autore;
  if (dati.revisione) b.dataset.hfRevisione = dati.revisione;
  b.setAttribute('aria-pressed', String(Boolean(selezionato)));
  const nome = String(dati.titolo || '').replace(/\s*\/\s*/u, ' / ');
  b.setAttribute('aria-label', `${nome}. ${dati.stato.testo}.${dati.capacita.misura ? ` ${dati.capacita.misura} download.` : ''}`);
  const ic = el(d, 'span', 'talos-list-row__icon'); ic.dataset.c = 'Glyph'; ic.appendChild(icona(d, 'i-files'));
  const testo = el(d, 'span', 'talos-list-row__text');
  const titolo = el(d, 'span', 'talos-list-row__title', nome);
  if (dati.badge) titolo.appendChild(badge(d, dati.badge.testo, dati.badge.tono));
  const meta = el(d, 'span', 'talos-list-row__sub', dati.sub1);
  /* `.row-availability`: il pallino porta il tono, il testo porta lo stato E la condizione d'uso
     (`sub2`), che è ciò che la riga diceva già dal 06/09 e che non si perde cambiando vestito.
     ⛔ IL PALLINO VIVE SOLO DENTRO UN CONTENITORE FLESSIBILE, e non è un dettaglio: `.talos-dot`
       (design-system/controls.css:138) dichiara `width`/`height`/`flex:none` e **nessun `display`** —
       è scritto per essere un FIGLIO di flex. In un `<span>` normale il `display` resta `inline`, e
       su una scatola inline `width` e `height` NON si applicano: il pallino esiste nel DOM, si
       misura 6×6 con `getComputedStyle`, ed è **invisibile a schermo**. Misurato il 19/09/2026 su
       questa riga (foto `zoom-stato.png`: nessun pallino) e confermato nei due posti dove invece
       funziona — `.talos-session-item__sub` e `.talos-automation__head`, entrambi `display:flex`.
       ⇒ Il contenitore è `.talos-cluster` (`display:flex; align-items:center`), che è la classe di
       casa per «una riga di cose». */
  const stato = el(d, 'span', 'talos-list-row__sub');
  const rigaStato = el(d, 'span', 'talos-cluster');
  const pallino = el(d, 'span', `talos-dot talos-dot--sm talos-dot--${dati.stato.tono}`); pallino.setAttribute('aria-hidden', 'true');
  rigaStato.append(pallino, el(d, 'span', '', dati.stato.nota ? `${dati.stato.testo} · ${dati.stato.nota}` : dati.stato.testo));
  stato.append(rigaStato);
  testo.append(titolo, meta, stato);
  const aside = el(d, 'span', 'talos-list-row__aside');
  const capacita = el(d, 'span', 'talos-stack'); capacita.dataset.c = 'Capacity';
  /*
   * ⛔ 06/09: `datiRepoHf` calcolava `download` e `likes` da sempre e la riga li BUTTAVA — due dati
   * chiesti al server, pagati, e mai disegnati. Sono l'unico segnale di reputazione che una riga di
   * repository può portare (l'ordinamento della barra ordina proprio per questi due). Restano fuori
   * quando il server non li manda: un trattino al posto di un numero non è informazione — e la
   * colonna si stringe invece di mostrare un buco.
   */
  if (dati.capacita.misura) capacita.append(el(d, 'strong', '', dati.capacita.misura), el(d, 'small', 'talos-muted', dati.capacita.etichetta));
  if (dati.capacita.nota) capacita.append(el(d, 'span', 'talos-muted talos-mono--xs', dati.capacita.nota));
  if (capacita.children.length) aside.appendChild(capacita);
  const chevron = icona(d, 'i-chevron-right', 'i talos-hf-chevron'); chevron.setAttribute('aria-hidden', 'true');
  b.append(ic, testo, aside, chevron);
  if (typeof seleziona === 'function') b.addEventListener('click', () => seleziona(dati.id));
  return b;
}

/**
 * L'INTESTAZIONE DI UN GRUPPO — `.list-group-label` del mockup: maiuscolo, spaziato, col conteggio
 * in fondo alla riga.
 * ⛔ `role="heading" aria-level="3"` e non un `<h3>`: è un'etichetta di gruppo dentro una lista, e
 *   un lettore di schermo coi comandi per titoli salta da un gruppo all'altro — che è esattamente il
 *   mestiere di questa riga. Il livello 3 sta sotto il titolo del pannello e sopra niente.
 */
export function creaGruppoHf(gruppo, { document: d = globalThis.document } = {}) {
  const testa = el(d, 'div', 'talos-cluster'); testa.dataset.hfGruppo = gruppo.chiave;
  const etichetta = el(d, 'span', 'talos-eyebrow', gruppo.etichetta);
  etichetta.setAttribute('role', 'heading'); etichetta.setAttribute('aria-level', '3');
  testa.append(etichetta, el(d, 'span', 'talos-grow', ''), el(d, 'span', 'talos-muted talos-mono--xs', new Intl.NumberFormat('it-IT').format(gruppo.righe.length)));
  return testa;
}

/*
 * LA BARRA DELLA SCOPERTA — chip coi conteggi, le faccette, la nota, la testa dei risultati.
 *
 * ⛔ SI COSTRUISCE UNA VOLTA e si aggiorna IN PLACE, come la barra del catalogo dei fornitori
 *   (`catalogo-modelli.js`, `barraDelPannello`): rifarla a ogni passata porterebbe via il fuoco dal
 *   select appena toccato, cioè il difetto classico di questa superficie.
 * ⛔ NIENTE `aria-expanded` + `aria-controls` su niente di questa barra: `app.js:22339` ha una regia
 *   che prende OGNI elemento con QUELLA COPPIA e ne inverte lo stato da sé. I chip usano
 *   `aria-pressed` (una coppia che alla regia non interessa) e le faccette sono `<select>`.
 */
export function creaBarraScopertaHf(d = globalThis.document, { onCambia } = {}) {
  const barra = el(d, 'section', 'talos-stack');
  barra.id = 'modelLabHfScoperta';
  barra.dataset.hfScoperta = '';
  barra.setAttribute('aria-label', 'Scoperta e filtri del catalogo Hugging Face');

  /* L'AMBITO, a chip: è la partizione che il mockup mette nei chip (`scope-options`) — accesso e
     licenza — con `role="group"` per ogni partizione, come il mockup. */
  const ambito = el(d, 'div', 'talos-cluster');
  ambito.dataset.hfAmbito = '';

  const faccette = el(d, 'div', 'talos-choice-grid');
  faccette.dataset.hfFaccette = '';
  const gruppi = new Map();
  for (const { chiave, titolo, forma } of FACCETTE_HF) {
    if (forma !== 'select') continue;
    const campo = el(d, 'label', 'talos-field talos-field--sm');
    campo.append(el(d, 'span', 'talos-muted', titolo));
    const sel = el(d, 'select', 'talos-select talos-select--sm');
    sel.dataset.hfFaccetta = chiave;
    sel.id = `modelLabHfFaccetta-${chiave}`;
    sel.setAttribute('aria-label', titolo);
    campo.append(sel);
    faccette.append(campo);
    gruppi.set(chiave, sel);
  }
  const nota = el(d, 'p', 'talos-muted', NOTA_FACCETTE_HF);
  /* La testa dei risultati: `role="status"` + `aria-live` — senza, chi non vede lo schermo tocca una
     faccetta e non sa che i risultati sono cambiati (fonti del 19/09/2026, cappello del file).
     ⛔ IL CONTEGGIO È UN NODO SUO, e il pulsante di uscita sta FUORI da quella regione viva: dentro,
     ogni volta che il conteggio cambia un lettore di schermo annuncerebbe anche «Azzera i filtri» —
     cioè un comando che non è un risultato, detto ogni volta. Trovato dalla prova (HF-LISTA-01: il
     `textContent` del nodo vivo era «8 modelli su 8 caricatiAzzera i filtri»). */
  const testa = el(d, 'div', 'talos-cluster');
  const conteggio = el(d, 'p', 'talos-cluster');
  conteggio.dataset.hfConteggio = '';
  conteggio.setAttribute('role', 'status'); conteggio.setAttribute('aria-live', 'polite');
  const forte = el(d, 'strong', '', '—'); const coda = el(d, 'span', 'talos-muted', '');
  conteggio.append(forte, coda);
  /*
   * ⛔ LA VIA D'USCITA — e non è nel mockup: il suo «+ Salva vista» scrive in un archivio che non
   *   esiste (`FACCETTE_NON_COLLEGATE`), quindi al suo posto non va una finta, va la cosa che serve
   *   davvero: chi ha acceso tre filtri e non trova più niente deve poterli spegnere TUTTI con un
   *   gesto. Il chip «Tutti» ne spegne uno solo (l'ambito), e la ricerca del testo la azzera un altro
   *   controllo: senza questo pulsante l'unica via era ricaricare la pagina.
   *   Compare SOLO quando c'è qualcosa da azzerare: un pulsante sempre presente che non fa niente
   *   quando i filtri sono già vuoti è la specie di controllo che questo progetto chiama difetto.
   */
  const azzera = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Azzera i filtri');
  azzera.type = 'button'; azzera.dataset.hfAzzera = ''; azzera.hidden = true;
  azzera.addEventListener('click', () => { filtri = filtriHfVuoti(); onCambia?.(filtri); });
  testa.append(conteggio, azzera);

  barra.append(ambito, faccette, nota, testa);

  let filtri = filtriHfVuoti();
  const cambia = (chiave, valore) => {
    const scelti = filtri[chiave];
    filtri = { ...filtri, [chiave]: scelti.includes(valore) ? scelti.filter((v) => v !== valore) : [...scelti, valore] };
    onCambia?.(filtri);
  };
  ambito.addEventListener('click', (evento) => {
    const b = evento.target.closest('[data-hf-chip]');
    if (b && !b.disabled) cambia(b.dataset.hfChip, b.dataset.hfValore);
  });
  for (const [chiave, sel] of gruppi) {
    sel.addEventListener('change', () => {
      filtri = { ...filtri, [chiave]: sel.value === '' ? [] : [sel.value] };
      onCambia?.(filtri);
    });
  }

  function aggiorna(stato = {}) {
    const { risultati = [], visibili = [] } = stato;
    if (stato.filtri) filtri = normalizzaFiltriHf(stato.filtri, risultati);
    ambito.replaceChildren();
    for (const { chiave, titolo, forma } of FACCETTE_HF) {
      if (forma !== 'chip') continue;
      /* Un vocabolario DERIVATO non si mostra a chip: `accesso` e `licenza` sono gli unici fissi, e
         sono gli unici che il mockup mette nei chip. Se un giorno non lo fossero, il chip sparisce
         invece di disegnare un gruppo vuoto. */
      const voci = vociFaccettaHf(risultati, chiave);
      if (!voci.length) continue;
      const gruppoChip = el(d, 'span', 'talos-cluster'); gruppoChip.dataset.hfChipGruppo = chiave;
      gruppoChip.setAttribute('role', 'group'); gruppoChip.setAttribute('aria-label', titolo);
      const conteggi = conteggiFaccettaHf(risultati, filtri, chiave);
      /* «Tutti» apre la fila e sta solo sul primo gruppo, come `quick-all` nel mockup: è lo stato in
         cui l'ambito non restringe niente. Senza risultati non si scrive nessun numero: «0» vorrebbe
         dire «contati: nessuno» mentre non è stato contato niente. */
      if (chiave === 'accesso') gruppoChip.appendChild(chip(d, 'Tutti', chiave, '', { premuto: !filtri[chiave].length, conteggio: stato.senzaDati ? null : risultati.length }));
      for (const [valore, testo] of voci) {
        const n = stato.senzaDati ? null : (conteggi.get(valore) || 0);
        const acceso = filtri[chiave].includes(valore);
        /* ⛔ «Zero non cliccabile»: il valore RESTA a schermo — dice che esiste nel vocabolario — ma
           non porta a un vicolo cieco. Se è già acceso resta spegnibile. */
        gruppoChip.appendChild(chip(d, testo, chiave, valore, {
          premuto: acceso, conteggio: n, disabilitato: n === 0 && !acceso,
          titolo: n === 0 && !acceso ? 'Nessun repository con questo valore fra quelli caricati' : null,
        }));
      }
      ambito.append(gruppoChip);
    }
    for (const [chiave, sel] of gruppi) {
      const voci = vociFaccettaHf(risultati, chiave);
      const conteggi = conteggiFaccettaHf(risultati, filtri, chiave);
      const firma = JSON.stringify([voci.map(([v]) => v), [...conteggi.entries()].sort()]);
      if (sel.dataset.firma !== firma) {
        sel.dataset.firma = firma;
        const scelto = filtri[chiave][0] || '';
        /* «Qualsiasi» è la prima voce, come nel mockup (`.facet-select`): l'etichetta sopra il select
           dice già che cosa si sta scegliendo, e ripeterlo dentro l'opzione sarebbe la stessa parola
           due volte a due centimetri. */
        sel.replaceChildren(new Option('Qualsiasi', '', false, scelto === ''));
        for (const [valore, testo] of voci) {
          const n = conteggi.get(valore) || 0;
          const opzione = new Option(n ? `${testo} (${new Intl.NumberFormat('it-IT').format(n)})` : testo, valore, false, scelto === valore);
          opzione.disabled = !n && scelto !== valore;
          sel.appendChild(opzione);
        }
        sel.value = scelto;
        if (sel.selectedIndex < 0) sel.selectedIndex = 0;
      }
    }
    const formatta = new Intl.NumberFormat('it-IT');
    forte.textContent = `${formatta.format(visibili.length)} ${visibili.length === 1 ? 'modello' : 'modelli'}`;
    coda.textContent = stato.altri
      ? ` su ${formatta.format(risultati.length)} caricati · altri disponibili`
      : ` su ${formatta.format(risultati.length)} ${risultati.length === 1 ? 'caricato' : 'caricati'}`;
    azzera.hidden = !FACCETTE_HF.some(({ chiave }) => filtri[chiave].length);
    /* Lo stato dei dati, leggibile da una prova e dal taccuino della QA: `non-misurati` vuol dire
       «nessun numero in questa barra è stato contato», e non è la stessa cosa di «zero». */
    barra.dataset.hfDati = stato.senzaDati ? 'non-misurati' : 'misurati';
  }
  barra.aggiorna = aggiorna;
  return barra;
}


/* ⛔ Il chip acceso si distingue con `--primary`, non con `aria-pressed`: nel design system NON
   esiste una regola `talos-button[aria-pressed="true"]`, e un chip acceso identico a uno spento è la
   stessa classe di difetto del «pulsante che promette un'altra cosa». `--primary` è la variante che
   il sistema usa per «scelto» (stessa scelta di `catalogo-faccette.js`, `chip`). */
function chip(d, etichetta, chiave, valore, { premuto = false, conteggio = null, disabilitato = false, titolo = null } = {}) {
  const b = el(d, 'button', `talos-button talos-button--sm ${premuto ? 'talos-button--primary' : 'talos-button--secondary'}`, etichetta);
  b.type = 'button';
  b.dataset.hfChip = chiave; b.dataset.hfValore = valore;
  b.setAttribute('aria-pressed', String(premuto));
  if (disabilitato) b.disabled = true;
  if (titolo) b.title = titolo;
  if (conteggio !== null && conteggio !== undefined) b.append(el(d, 'span', 'talos-badge talos-badge--sm', new Intl.NumberFormat('it-IT').format(conteggio)));
  return b;
}

/**
 * IL BLOCCO DELLA SCELTA DEL FILE — estratto dal pannello stretto il 19/09/2026.
 *
 * ⛔ PERCHÉ È DIVENTATO UNA FUNZIONE A SÉ. L'owner ha bocciato il pannello stretto come destinazione
 *   del clic («troppo stretta per ospitare la scheda del modello formattata in HTML»), e il clic
 *   deve portare alla PAGINA del modello — che il prodotto ha già: `#paginaModello`, rotta
 *   `#/impostazioni/modelli/scheda/<id>/<card|files|compatibility>`, tre schede («Scheda Hugging
 *   Face» · «File del modello» · «Compatibilità»), montata da `app.js:apriPaginaModello`.
 *   La scheda «File del modello» di quella pagina è il posto naturale di questo blocco: la scelta
 *   della variante, la stima di memoria e lo scaricamento. ⇒ Il blocco si estrae, si esporta, e si
 *   monta in DUE posti senza duplicare una riga: qui sotto (il pannello di oggi) e, quando la
 *   pagina lo chiamerà, dentro la sua scheda «File del modello».
 *   Chi monta questo blocco fuori dal pannello passa `id` unici col prefisso che vuole (vedi
 *   `prefissoId`), perché gli id `#hfFileChoices` / `#hfStima` / `#hfScarica` sono già presi da
 *   questa superficie e due nodi con lo stesso id rendono `querySelector('#x')` una domanda senza
 *   risposta unica.
 *
 * @param {Element} contenitore dove disegnare
 * @param {object} detail il dettaglio del repository (`/api/v1/huggingface/repo`)
 * @param {{stima?: Map, scelta?: string|null, azioni?: object, prefissoId?: string, conAccesso?: boolean}} opzioni
 * @returns {object|null} il gruppo scelto
 */
export function montaSceltaFileHf(contenitore, detail, { stima = new Map(), scelta = null, azioni = {}, prefissoId = 'hf', conAccesso = true, document: d = globalThis.document } = {}) {
  if (!contenitore || !detail) return null;
  const idDi = (nome) => `${prefissoId}${nome.charAt(0).toUpperCase()}${nome.slice(1)}`;
  /*
   * ⛔ 06/09 — l'ordine è quello di QUALITÀ (`ordinaVarianti`), non quello dei
   * nomi che arriva dall'API: prima era alfabetico e metteva `BF16· 56,9 GB`
   * in testa e preselezionato. E la misura si chiede da QUI, sopra la lista:
   * il pulsante stava in fondo, dopo quindici voci, e nessuno lo vedeva —
   * ecco perché ogni riga diceva «non ancora misurato».
   */
  const gruppi = ordinaVarianti(gruppiVarianti(detail.files));
  const consiglio = varianteConsigliata(gruppi, stima);
  const scelto = gruppi.find((g) => g.chiave === scelta) || consiglio?.gruppo || gruppi[0] || null;
  const misurabile = gruppi.length > 0;
  const inMisura = gruppi.some((g) => stima.get?.(g.chiave)?.inCorso);
  const misurato = gruppi.some((g) => { const v = stima.get?.(g.chiave); return v && !v.inCorso && ['compatible', 'tight', 'blocked'].includes(v.state); });
  // La macchina non si è potuta misurare (niente runtime locale: `/fit-estimate` risponde 503).
  const nonMisurabile = !inMisura && gruppi.length > 0 && gruppi.every((g) => stima.get?.(g.chiave)?.state === 'unknown');
  if (misurabile) {
    const barra = el(d, 'div', 'talos-hf-misura');
    /*
     * ⛔ `--secondary`, non `--ghost`: guardando lo screenshot il pulsante
     * fantasma si leggeva come un SOTTOTITOLO sotto «Scegli il file», non come
     * una cosa da premere. Un controllo deve dichiararsi tale senza bisogno
     * che ci passi sopra il mouse.
     */
    const misura = el(d, 'button', 'talos-button talos-button--secondary talos-button--sm', inMisura ? 'Misuro su questo PC…' : misurato ? 'Rimisura su questo PC' : 'Misura su questo PC');
    misura.type = 'button'; misura.dataset.c = 'Button'; misura.dataset.azione = 'misura'; misura.disabled = inMisura;
    if (azioni.misura) misura.addEventListener('click', () => azioni.misura(gruppi));
    barra.appendChild(misura);
    if (misurato && !inMisura) barra.appendChild(el(d, 'span', 'talos-muted talos-hf-misura__quando', 'misurato adesso'));
    contenitore.appendChild(barra);
    /*
     * ⛔ Il caso «niente servizio locale» si DICE una volta sola e in cima,
     * invece di lasciare ventisette righe che ripetono «non misurabile su
     * questa macchina» senza spiegare perché né cosa cambia. Ed è un callout,
     * non un grigio in fondo a una riga: era l'informazione più importante
     * della colonna disegnata come la più debole.
     */
    if (nonMisurabile) {
      const avviso = el(d, 'div', 'talos-callout'); avviso.dataset.c = 'Callout';
      const testo = el(d, 'div');
      testo.append(el(d, 'b', '', 'La memoria di questo PC non è misurabile'), el(d, 'p', '', 'Manca un servizio locale che risponda. I consigli qui sotto valgono di norma, non su questa macchina: controlla tu che il file scelto ci stia.'));
      avviso.appendChild(testo);
      contenitore.appendChild(avviso);
    }
  }
  const radio = el(d, 'div', 'talos-stack'); radio.id = idDi('fileChoices'); radio.dataset.hfFileChoices = ''; radio.setAttribute('role', 'radiogroup'); radio.setAttribute('aria-label', 'File da scaricare');
  gruppi.forEach((g, i) => {
    const b = el(d, 'button', 'talos-choice'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(g === scelto)); b.dataset.hfFile = String(i); b.dataset.variante = g.chiave;
    const st = descriviStima(stima.get?.(g.chiave), g.bytes);
    const titolo = el(d, 'span', 'talos-choice__title', `${g.quant} · ${gb(g.bytes)}${g.incompleto ? ` · set incompleto ${g.file.length}/${g.attesi}` : ''}`);
    // Il consiglio si vede sulla riga, non solo nella preselezione: chi scorre deve poterlo ritrovare.
    if (consiglio && consiglio.gruppo === g) titolo.appendChild(badge(d, consiglio.motivo === 'convenzione' ? 'Consigliato di norma' : 'Consigliato', 'accent'));
    b.appendChild(titolo);
    const glossa = glossaQuant(g.quant);
    if (glossa) b.appendChild(el(d, 'span', 'talos-muted talos-choice__glossa', glossa));
    b.appendChild(el(d, 'span', 'talos-muted', g.senzaHash ? 'impronta sha256 assente: non si scarica' : st.testo));
    if (azioni.scegli) b.addEventListener('click', () => azioni.scegli(g.chiave));
    radio.appendChild(b);
  });
  if (!gruppi.length) radio.appendChild(el(d, 'p', 'talos-muted', 'Nessun file GGUF in questo repository.'));
  contenitore.appendChild(radio);
  /*
   * ⛔ La variante scelta si porta SOTTO GLI OCCHI.
   *
   * La lista scorre dentro di sé (27 varianti su un repository vero) e la
   * consigliata sta dove la mette la scala di qualità — quasi mai in cima.
   * Senza questo, chi apriva il repository vedeva `BF16` in testa e non aveva
   * modo di accorgersi che il selezionato, e il file che «Scarica» avrebbe
   * preso, erano un altro: una preselezione invisibile è peggio di nessuna.
   * ⛔ NON con `scrollIntoView`: quello risale gli antenati e fa scorrere la
   * PAGINA delle impostazioni (misurato — il pulsante «Misura» finiva a y=286
   * mentre la lista partiva da y=153, cioè la colonna si era mossa sotto le
   * mani di chi legge). Qui si muove solo `scrollTop` del contenitore, e solo
   * se la voce scelta sta davvero fuori dalla sua finestra.
   */
  const indiceScelto = scelto ? gruppi.indexOf(scelto) : -1;
  const nodoScelto = indiceScelto >= 0 ? radio.children[indiceScelto] : null;
  if (nodoScelto) {
    // `offsetTop` è relativo al contenitore posizionato: qui basta la differenza fra i due.
    const alto = nodoScelto.offsetTop - radio.offsetTop;
    const basso = alto + (nodoScelto.offsetHeight || 0);
    if (radio.clientHeight && basso > radio.clientHeight) radio.scrollTop = alto - 8;
  }
  /*
   * ⛔ Il caso che il consiglio NON copre si dice, invece di lasciare l'elenco
   * muto: misurate tutte e nessuna che ci sta è un'informazione, non un vuoto.
   */
  if (misurato && !consiglio && gruppi.length) {
    contenitore.appendChild(el(d, 'p', 'talos-muted talos-hf-nessuno', 'Nessuna variante consigliabile su questa macchina: quelle che ci starebbero scendono sotto i 4 bit per peso, dove la qualità cala troppo.'));
  }
  if (conAccesso) {
    const callout = el(d, 'div', 'talos-callout'); callout.id = idDi('accesso'); callout.dataset.c = 'Callout'; callout.hidden = !detail.gated;
    const cb = el(d, 'div'); cb.append(el(d, 'b', '', "Serve l'accesso al repository"), el(d, 'p', '', 'Apri la pagina del modello, verifica le condizioni e richiedi accesso con il tuo account.')); callout.appendChild(cb);
    contenitore.appendChild(callout);
  }
  const stimaP = el(d, 'p', 'talos-muted talos-lab__space'); stimaP.id = idDi('stima');
  const voce = scelto ? stima.get?.(scelto.chiave) : null;
  if (scelto && voce && !voce.inCorso && Number.isFinite(voce.memory?.requiredBytes)) {
    const m = el(d, 'span', 'talos-measure talos-measure--estimate', gb(voce.memory.requiredBytes)); m.dataset.c = 'Measure';
    stimaP.append(m, d.createTextNode(` necessari${Number.isFinite(voce.memory?.availableBytes) ? ` · ${gb(voce.memory.availableBytes)} allocabili liberando il modello attuale.` : '.'}`));
  } else stimaP.textContent = scelto ? (voce?.inCorso ? 'Misuro su questo PC…' : 'La misura pesa i file contro memoria e disco liberi adesso; la cache del contesto si somma dopo lo scaricamento.') : '';
  contenitore.appendChild(stimaP);
  // ⛔ Il pulsante «Misura» NON si ripete qui: dal 06/09 sta sopra la lista (`talos-hf-misura`).
  const scarica = el(d, 'button', 'talos-button talos-button--primary talos-button--block'); scarica.id = idDi('scarica'); scarica.type = 'button'; scarica.dataset.action = 'download';
  scarica.textContent = scelto ? `Scarica sul computer · ${gb(scelto.bytes)}` : 'Scegli un file da scaricare';
  scarica.disabled = !scelto || scelto.incompleto || scelto.senzaHash || Boolean(detail.gated);
  if (azioni.scarica) scarica.addEventListener('click', () => scelto && azioni.scarica(scelto, detail));
  contenitore.appendChild(scarica);
  return scelto;
}

/**
 * IL PANNELLO DEL REPOSITORY — la colonna stretta di oggi (320 px misurati sul 4174 il 19/09/2026).
 *
 * ⛔ RESTA, E NON È PIÙ LA DESTINAZIONE DEL CLIC: l'owner l'ha bocciata come posto della scheda del
 *   modello («troppo stretta per ospitare la scheda del modello formattata in HTML»). Il clic sulla
 *   riga deve portare alla PAGINA del modello; questo pannello resta il posto della scelta rapida
 *   del file finché la pagina non la ospita (vedi `montaSceltaFileHf`, che è il blocco da travasare).
 * ⛔ Niente è stato tolto: il blocco della scelta si monta QUI, con gli id di sempre (`hfFileChoices`,
 *   `hfStima`, `hfScarica`, `hfAccesso`), quindi `app.js` — che li legge e li pilota — continua a
 *   trovarli dov'erano.
 *
 * `stima` = Map chiaveVariante → esito (o { inCorso }).
 * `azioni` = { scarica(gruppo), misura(gruppi), tuttiFile(detail), scheda(detail) }.
 */
export function aggiornaDettaglioHf(aside, detail, { stima = new Map(), scelta = null, azioni = {}, document: d = globalThis.document } = {}) {
  if (!aside) return null;
  aside.replaceChildren();
  if (!detail) { aside.hidden = true; return null; }
  aside.hidden = false;
  const [autore, nome] = String(detail.repo || '').split('/');
  const h = el(d, 'h3', '', (nome || detail.repo || '').replace(/-GGUF$/i, '').replace(/-/g, ' ')); h.id = 'hfNome';
  const p = el(d, 'p', 'talos-detail__desc', `Pubblicato da ${autore || 'autore non dichiarato'} · formato GGUF`); p.id = 'hfAutore';
  const kv = (k, v, id) => { const r = el(d, 'div', 'talos-kv'); const val = el(d, 'span', 'talos-kv__v'); if (id) { const s = el(d, 'span', '', v); s.id = id; val.appendChild(s); } else val.textContent = v; r.append(el(d, 'span', 'talos-kv__k', k), val); return r; };
  const revisione = detail.revision ? `${String(detail.revision).slice(0, 12)} · verificata` : 'Da verificare prima del download';
  aside.append(h, p, kv('Licenza', detail.license || 'Non dichiarata', 'hfLicenza'), kv('Revisione', revisione), el(d, 'hr', 'talos-lab__rule'));
  const tutti = el(d, 'button', 'talos-button talos-button--secondary', 'Tutti i file'); tutti.id = 'hfTuttiFile'; tutti.type = 'button'; tutti.dataset.apreVelo = 'veloFileModello';
  if (azioni.tuttiFile) tutti.addEventListener('click', () => azioni.tuttiFile(detail));
  aside.append(tutti, el(d, 'h3', '', 'Scegli il file'));
  const scelto = montaSceltaFileHf(aside, detail, { stima, scelta, azioni, prefissoId: 'hf', conAccesso: true, document: d });
  /* La scheda del README: nella PAGINA del modello è la sua prima linguetta («Scheda Hugging
     Face»); qui resta il disclosure di sempre, perché il pannello non ha linguette. */
  const scheda = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Leggi la scheda del modello'); scheda.type = 'button'; scheda.dataset.c = 'Button'; scheda.dataset.azione = 'scheda'; scheda.setAttribute('aria-expanded', 'false'); scheda.setAttribute('aria-controls', 'hfScheda');
  // stopPropagation: il pulsante ha aria-controls e la regia dei disclosure lo commuterebbe una seconda volta nello stesso clic
  if (azioni.scheda) scheda.addEventListener('click', (event) => { event.stopPropagation(); azioni.scheda(detail, scheda); });
  aside.appendChild(scheda);
  const cont = el(d, 'div', 'talos-card talos-card--pad talos-lab__space'); cont.id = 'hfScheda'; cont.hidden = true; aside.appendChild(cont);
  return scelto;
}

/**
 * LA BARRA DELLA SCOPERTA NEL PANNELLO — costruita UNA volta e riusata.
 *
 * ⛔ SI MONTA APPENA IL PANNELLO ESISTE, non quando arrivano i risultati: con una risposta lenta, un
 *   errore o un catalogo vuoto la superficie resterebbe senza la sua riga di scoperta, e «non c'è la
 *   barra» sarebbe indistinguibile da «non è mai stata montata» (è la stessa lezione del 19/09 che
 *   `catalogo-modelli.js` ha già pagato per la barra del catalogo dei fornitori). I numeri si
 *   riempiono quando arrivano, e nel frattempo NON si scrive nessun numero (vedi `senzaDati`).
 * ⛔ Il posto è subito SOTTO la riga dei comandi che c'è già (`.talos-toolbar--hf`, che porta la
 *   ricerca, l'autore, i tag e l'ordinamento veri, quelli che `app.js` legge): la barra è un secondo
 *   piano di comando, non una testata — e non si tocca quel markup, che non è di questo file.
 */
function barraDelPannello(panel, onCambia) {
  const esistente = panel.querySelector('#modelLabHfScoperta');
  if (esistente && esistente.aggiorna) return esistente;
  const barra = creaBarraScopertaHf(panel.ownerDocument || globalThis.document, { onCambia });
  const dove = panel.querySelector('.talos-toolbar--hf, .talos-toolbar, .model-lab-filters');
  if (dove) dove.after(barra); else panel.prepend(barra);
  return barra;
}

/**
 * Riscrive la barra della scoperta, i gruppi, le righe, lo stato vuoto, «Carica altri» e il
 * dettaglio. Torna l'id scelto.
 *
 * ⛔ I FILTRI NON SONO UNA SECONDA LISTA: si applicano ai risultati che `app.js` ha già chiesto e
 *   pagato, e la testa dei risultati dice quanti sono — «N modelli su M caricati». Un filtro che
 *   chiedesse al server un'altra pagina sarebbe un'altra funzione (utile, ma non questa): qui si
 *   restringe ciò che si ha, e si dice che è ciò che si ha.
 * ⛔ IL CLIC ESCE DALLA RIGA (`creaRigaHf`): `seleziona(repo)` e, sullo stesso nodo,
 *   `data-hf` / `data-hf-revisione` / `data-autore`. Chi vuole agganciare un'altra destinazione ha
 *   due strade, e nessuna delle due passa da questo file: sostituire la callback `seleziona` che
 *   `app.js` già passa a `aggiornaHf` (`renderizzaHfConMockup`), oppure delegare il clic su
 *   `#modelLabHfResults [data-hf]`.
 */
export function aggiornaHf(panel, risultati = [], { selezionato = null, detail = null, stima, scelta, errore = null, caricamento = false, altri = false, seleziona, azioni = {}, document: d = globalThis.document } = {}) {
  if (!panel) return null;
  const lista = panel.querySelector('[data-hf-lista], #listaHf, #modelLabHfResults');
  const vuoto = panel.querySelector('[data-c="EmptyState"]');
  const bottoneAltri = panel.querySelector('#altriHf, #modelLabHfNextButtonControl');
  const aside = panel.querySelector('[data-c="DetailPanel"]');
  panel.setAttribute('aria-busy', String(Boolean(caricamento)));
  if (!lista) return null;
  const scelto = risultati.find((r) => (r.repo || r.id) === selezionato) || risultati[0] || null;
  const senzaDati = !risultati.length && Boolean(errore || caricamento);
  /* I filtri si rileggono SEMPRE dai risultati di adesso: un valore rimasto da una ricerca
     precedente (un autore che non c'è più) verrebbe scartato dalla normalizzazione, invece di
     svuotare la lista senza che nessun controllo a schermo lo mostri. */
  const filtri = normalizzaFiltriHf(panel.__hfFiltri || filtriHfVuoti(), risultati);
  panel.__hfFiltri = filtri;
  const visibili = errore ? [] : filtraRisultatiHf(risultati, filtri);
  /* ⛔ L'ULTIMA ISTANTANEA serve al clic sulle faccette: la barra è costruita una volta e il suo
     ascoltatore non conosce gli argomenti di QUESTA chiamata. È lo stesso patto di
     `panel.__catalogoUltimo` in `catalogo-modelli.js`. */
  panel.__hfUltimo = { risultati, opzioni: { selezionato, detail, stima, scelta, errore, caricamento, altri, seleziona, azioni } };
  const barra = barraDelPannello(panel, (nuovi) => {
    panel.__hfFiltri = nuovi;
    const u = panel.__hfUltimo;
    if (u) aggiornaHf(panel, u.risultati, { ...u.opzioni, document: d });
  });
  barra.aggiorna({ risultati, visibili, filtri, senzaDati, altri });
  if (errore) {
    lista.replaceChildren(el(d, 'p', 'talos-card--pad talos-muted', `Ricerca non disponibile: ${errore.message || errore}`)); if (vuoto) vuoto.hidden = true;
  } else if (caricamento && !risultati.length) {
    lista.replaceChildren(el(d, 'p', 'talos-card--pad talos-muted', 'Ricerca in corso…')); if (vuoto) vuoto.hidden = true;
  } else if (!risultati.length) {
    lista.replaceChildren(); if (vuoto) vuoto.hidden = false;
  } else if (!visibili.length) {
    /* I filtri hanno svuotato la lista: non è il vuoto dell'app (nessuna ricerca ancora fatta), è
       una lista che c'è e non contiene niente. Due stati diversi, due frasi diverse — e la via
       d'uscita si dice, invece di lasciare una schermata muta. */
    lista.replaceChildren(el(d, 'p', 'talos-card--pad talos-muted', 'Nessun repository corrisponde ai filtri scelti. Togli un filtro per rivedere gli altri.'));
    if (vuoto) vuoto.hidden = true;
  } else {
    const nodi = [];
    for (const gruppo of raggruppaRisultatiHf(visibili)) {
      nodi.push(d.createTextNode('\n'), creaGruppoHf(gruppo, { document: d }));
      for (const r of gruppo.righe) nodi.push(d.createTextNode('\n'), creaRigaHf(datiRigaHf(r), { selezionato: r === scelto, seleziona, document: d }));
    }
    nodi.push(d.createTextNode('\n'));
    lista.replaceChildren(...nodi);
    if (vuoto) vuoto.hidden = true;
  }
  if (bottoneAltri) bottoneAltri.hidden = !altri;
  // senza risultati non resta un dettaglio di un repository che non è più in lista
  aggiornaDettaglioHf(aside, risultati.length ? detail : null, { stima, scelta, azioni, document: d });
  return scelto ? (scelto.repo || scelto.id) : null;
}

/**
 * Sposta il pannello del mockup in `#modelLabHfPanel` con gli id che il monolite ascolta.
 *
 * ⛔ 18/09/2026 — IL TRAVASO REGGE ENTRAMBE LE DIREZIONI (corsia 3, il travaso neutro). Chi arriva
 * in `originale` può essere il markup CANONICO (oggi: il mockup scende in Impostazioni) oppure
 * quello LEGACY (destinazione invertita: il laboratorio sale sulla schermata), che porta GIÀ gli id
 * del monolite: `#modelLabHfSearch`, `#modelLabHfResults`, `#modelLabHfDetail`. ⇒ Gli id si
 * rinominano solo se sono ancora canonici, i nodi si cercano nell'una O nell'altra forma, e ciò che
 * manca si salta invece di far esplodere il montaggio (senza il ramo `#modelLabHfDetail`, nella
 * direzione invertita il dettaglio resterebbe APERTO e con dentro i risultati vecchi).
 * ⛔ Il timbro va su ENTRAMBE le radici: `ensureModelLabControls` (app.js) guarda
 * `dataset.hfMontato` sul pannello SVUOTATO, e senza il timbro la sua `insertBefore(controls,
 * hfPanel.querySelector('.model-lab-catalog-layout'))` crea un secondo giro di controlli con gli
 * stessi id — cioè id doppi, e `querySelector('#x')` tornerebbe il primo in ordine d'albero.
 * Fonti consultate il 18/09/2026: MDN `Node.insertBefore` (`NotFoundError` quando il nodo di
 * riferimento non è figlio di quel genitore); HTML, `id` «must be unique amongst all the IDs in the
 * element's tree» (WHATWG DOM issue #1361, feb 2025).
 */
export function montaHf(originale, canonico) {
  if (!originale || !canonico || originale.dataset.hfMontato) return;
  originale.replaceChildren(...canonico.children);
  originale.dataset.hfMontato = 'true';
  canonico.dataset.hfMontato = 'true';
  const ids = { cercaHf: 'modelLabHfSearch', autoreHf: 'modelLabHfAuthorControl', ordineHf: 'modelLabHfSortControl', tagHf: 'modelLabHfFiltersControl', listaHf: 'modelLabHfResults', altriHf: 'modelLabHfNextButtonControl' };
  for (const [prima, dopo] of Object.entries(ids)) {
    const n = originale.querySelector(`#${prima}`) || originale.querySelector(`#${dopo}`); if (!n) continue;
    if (n.id !== prima) continue; // id già quello che il monolite ascolta: non c'è niente da rinominare
    for (const label of originale.querySelectorAll(`label[for="${prima}"]`)) label.htmlFor = dopo;
    n.id = dopo;
  }
  const lista = originale.querySelector('#modelLabHfResults') || originale.querySelector('#listaHf'); if (lista) { lista.dataset.hfLista = ''; lista.replaceChildren(); }
  const aside = originale.querySelector('[data-c="DetailPanel"]') || originale.querySelector('#modelLabHfDetail'); if (aside) { aside.id = 'modelLabHfDetail'; aside.replaceChildren(); aside.hidden = true; }
  const altri = originale.querySelector('#modelLabHfNextButtonControl') || originale.querySelector('#altriHf'); if (altri) altri.hidden = true;
}
