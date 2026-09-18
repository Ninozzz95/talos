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
    sub1, sub2,
    badge: item.gated ? { testo: 'Accesso richiesto', tono: 'warning' } : (conversione ? null : { testo: 'Autore del modello', tono: 'info' }),
    download: conteggio(item.downloads), likes: conteggio(item.likes), gated: Boolean(item.gated),
  };
}

function el(d, tag, classe, testo) { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; }
function icona(d, nome, classe = 'i') { const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', classe); svg.setAttribute('aria-hidden', 'true'); const use = d.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${nome}`); svg.appendChild(use); return svg; }
function badge(d, testo, tono) { const b = el(d, 'span', `talos-badge talos-badge--sm${tono ? ` talos-badge--${tono}` : ''}`, testo); b.dataset.c = 'Badge'; return b; }

export function creaRigaHf(dati, { selezionato = false, seleziona, document: d = globalThis.document } = {}) {
  const b = el(d, 'button', 'talos-list-row'); b.type = 'button'; b.dataset.c = 'ListRow'; b.dataset.hf = dati.id; b.dataset.author = dati.autore; b.setAttribute('aria-pressed', String(Boolean(selezionato)));
  const ic = el(d, 'span', 'talos-list-row__icon'); ic.appendChild(icona(d, 'i-files'));
  const testo = el(d, 'span', 'talos-list-row__text');
  const sub = el(d, 'span', 'talos-list-row__sub', dati.sub1); sub.appendChild(d.createElement('br')); sub.appendChild(d.createTextNode(dati.sub2));
  testo.append(el(d, 'span', 'talos-list-row__title', dati.titolo), sub);
  /*
   * ⛔ 06/09: `datiRepoHf` calcolava `download` e `likes` da sempre e la riga
   * li BUTTAVA — due dati chiesti al server, pagati, e mai disegnati. Sono
   * l'unico segnale di reputazione che una riga di repository può portare
   * (l'ordinamento della barra ordina proprio per questi due), quindi da oggi
   * si vedono. Restano fuori quando il server non li manda: un trattino al
   * posto di un numero non è informazione.
   */
  const aside = el(d, 'span', 'talos-list-row__aside');
  if (dati.download || dati.likes) {
    const misure = el(d, 'span', 'talos-list-row__misure');
    if (dati.download) misure.appendChild(el(d, 'span', 'talos-list-row__misura', `↓ ${dati.download}`));
    if (dati.likes) misure.appendChild(el(d, 'span', 'talos-list-row__misura', `♥ ${dati.likes}`));
    misure.setAttribute('aria-label', `${dati.download ? `${dati.download} scaricamenti` : ''}${dati.download && dati.likes ? ', ' : ''}${dati.likes ? `${dati.likes} preferiti` : ''}`);
    aside.appendChild(misure);
  }
  if (dati.badge) aside.appendChild(badge(d, dati.badge.testo, dati.badge.tono));
  b.append(ic, testo, aside);
  if (typeof seleziona === 'function') b.addEventListener('click', () => seleziona(dati.id));
  return b;
}

/**
 * Il dettaglio del repository scelto. `stima` = Map chiaveVariante → esito (o { inCorso }).
 * `azioni` = { scarica(gruppo), misura(gruppi), tuttiFile(detail), scheda(detail), apri(detail) }.
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
    aside.appendChild(barra);
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
      aside.appendChild(avviso);
    }
  }
  const radio = el(d, 'div', 'talos-stack'); radio.id = 'hfFileChoices'; radio.setAttribute('role', 'radiogroup'); radio.setAttribute('aria-label', 'File da scaricare');
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
  aside.appendChild(radio);
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
    aside.appendChild(el(d, 'p', 'talos-muted talos-hf-nessuno', 'Nessuna variante consigliabile su questa macchina: quelle che ci starebbero scendono sotto i 4 bit per peso, dove la qualità cala troppo.'));
  }
  const callout = el(d, 'div', 'talos-callout'); callout.id = 'hfAccesso'; callout.dataset.c = 'Callout'; callout.hidden = !detail.gated;
  const cb = el(d, 'div'); cb.append(el(d, 'b', '', "Serve l'accesso al repository"), el(d, 'p', '', 'Apri la pagina del modello, verifica le condizioni e richiedi accesso con il tuo account.')); callout.appendChild(cb);
  aside.appendChild(callout);
  const stimaP = el(d, 'p', 'talos-muted talos-lab__space'); stimaP.id = 'hfStima';
  const voce = scelto ? stima.get?.(scelto.chiave) : null;
  if (scelto && voce && !voce.inCorso && Number.isFinite(voce.memory?.requiredBytes)) {
    const m = el(d, 'span', 'talos-measure talos-measure--estimate', gb(voce.memory.requiredBytes)); m.dataset.c = 'Measure';
    stimaP.append(m, d.createTextNode(` necessari${Number.isFinite(voce.memory?.availableBytes) ? ` · ${gb(voce.memory.availableBytes)} allocabili liberando il modello attuale.` : '.'}`));
  } else stimaP.textContent = scelto ? (voce?.inCorso ? 'Misuro su questo PC…' : 'La misura pesa i file contro memoria e disco liberi adesso; la cache del contesto si somma dopo lo scaricamento.') : '';
  aside.appendChild(stimaP);
  // ⛔ Il pulsante «Misura» NON si ripete qui: dal 06/09 sta sopra la lista (`talos-hf-misura`).
  const scarica = el(d, 'button', 'talos-button talos-button--primary talos-button--block'); scarica.id = 'hfScarica'; scarica.type = 'button'; scarica.dataset.action = 'download';
  scarica.textContent = scelto ? `Scarica sul computer · ${gb(scelto.bytes)}` : 'Scegli un file da scaricare';
  scarica.disabled = !scelto || scelto.incompleto || scelto.senzaHash || Boolean(detail.gated);
  if (azioni.scarica) scarica.addEventListener('click', () => scelto && azioni.scarica(scelto, detail));
  aside.appendChild(scarica);
  const scheda = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Leggi la scheda del modello'); scheda.type = 'button'; scheda.dataset.c = 'Button'; scheda.dataset.azione = 'scheda'; scheda.setAttribute('aria-expanded', 'false'); scheda.setAttribute('aria-controls', 'hfScheda');
  // stopPropagation: il pulsante ha aria-controls e la regia dei disclosure lo commuterebbe una seconda volta nello stesso clic
  if (azioni.scheda) scheda.addEventListener('click', (event) => { event.stopPropagation(); azioni.scheda(detail, scheda); });
  aside.appendChild(scheda);
  const cont = el(d, 'div', 'talos-card talos-card--pad talos-lab__space'); cont.id = 'hfScheda'; cont.hidden = true; aside.appendChild(cont);
  return scelto;
}

/** Riscrive lista, stato vuoto, «Carica altri» e dettaglio. Torna l'id scelto. */
export function aggiornaHf(panel, risultati = [], { selezionato = null, detail = null, stima, scelta, errore = null, caricamento = false, altri = false, seleziona, azioni = {}, document: d = globalThis.document } = {}) {
  if (!panel) return null;
  const lista = panel.querySelector('[data-hf-lista], #listaHf, #modelLabHfResults');
  const vuoto = panel.querySelector('[data-c="EmptyState"]');
  const bottoneAltri = panel.querySelector('#altriHf, #modelLabHfNextButtonControl');
  const aside = panel.querySelector('[data-c="DetailPanel"]');
  panel.setAttribute('aria-busy', String(Boolean(caricamento)));
  if (!lista) return null;
  const scelto = risultati.find((r) => (r.repo || r.id) === selezionato) || risultati[0] || null;
  if (errore) {
    lista.replaceChildren(el(d, 'p', 'talos-card--pad talos-muted', `Ricerca non disponibile: ${errore.message || errore}`)); if (vuoto) vuoto.hidden = true;
  } else if (caricamento && !risultati.length) {
    lista.replaceChildren(el(d, 'p', 'talos-card--pad talos-muted', 'Ricerca in corso…')); if (vuoto) vuoto.hidden = true;
  } else if (!risultati.length) {
    lista.replaceChildren(); if (vuoto) vuoto.hidden = false;
  } else {
    lista.replaceChildren(...risultati.flatMap((r) => [d.createTextNode('\n'), creaRigaHf(datiRepoHf(r), { selezionato: r === scelto, seleziona, document: d })]), d.createTextNode('\n'));
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
