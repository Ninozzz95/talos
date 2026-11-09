// Le parole del catalogo per il modello (interfaccia generativa, catalogo v1, 02/11/2026).
//
// Condizione 2 di Performance: ≤ 1000 token col catalogo v2 a 11 tipi (ledger G-C, UIG-9.4; misurato il 05/11: pieno 983, senza clic 799,
// minimo 725 — il v1 a 7 tipi era pieno 870 sotto il tetto di 900), testo IDENTICO a ogni chiamata con le stesse opzioni (sta nel prefisso fisso
// e resta in cache). Condizione 4 della CLI: riceve i tipi che la superficie sa disegnare e non promette clic dove non ci
// sono (senza clic: niente `modulo`, `scelte` si risponde scrivendo). `minimo: true` è il nucleo per i modelli locali, che per ora
// non lo ricevono: manca la misura del §4 della forma del 02/11.
//
// Le firme si ricavano dallo schema del catalogo (come OpenUI, spec/prompt.md §2.4: «se non vanno d'accordo vince lo
// schema»): un campo nuovo nel catalogo arriva al modello senza toccare questo file. Testo per il modello: inglese.

import { CATALOGO, LINGUA_DEL_RECINTO, SCHEMA_FONTE, TIPI, TIPI_INTERATTIVI } from './catalogo.mjs';

export const TETTO_TOKEN_DEL_PROMPT = 1000;

/**
 * Il valore di `catalogoBlocchi` per chi ospita il PC e per il banco. ACCESO di serie (decisioni 67, 129 e 139 dell'owner, 04/11/2026):
 * come Hermes accende i pezzi in linea solo nella superficie che sa disegnarli (`agent/prompt_builder.py:685-703`, `"desktop"`), l'ospite
 * del PC li accende e il nucleo resta `null` (la CLI non chiama mai questa funzione). `TALOS_CATALOGO_BLOCCHI=0` è l'interruttore di
 * emergenza e il lato A dell'A/B di Performance: un valore vuoto o assente vuol dire acceso, solo `0` spegne.
 * Restano fuori comunque i modelli locali (`!eModelloLocale` nel nucleo), le figlie e le automazioni (il registro), le conversazioni
 * nate dal telefono fino a UI-137 e quelle nate con la preferenza spenta (`blocchiViviAllaNascita` qui sotto).
 * Revisione Z, Z-3.1 (04/11, OK di Mobile, CLI e Performance): il server dell'app del telefono gira lo stesso `server.mjs`, e lì il
 * catalogo resta SPENTO, come i Passi (`listaPassiDelServer`): `telefono: true` (l'ospite locale del telefono, `accessoLocaleOspite.attivo`)
 * o `TALOS_KERNEL_SUL_TELEFONO=1` nell'ambiente (il Codice in casa, che non mette `TALOS_LOCALE_OSPITE_DIR`; correzione del Mobile).
 * Nessuna variabile lo riaccende sul telefono. Sul PC il valore non cambia di un byte.
 * @param {Record<string, string|undefined>} ambiente
 * @param {{ telefono?: boolean }} [dove]
 * @returns {{ clic: true } | null}
 */
export function catalogoBlocchiDaAmbiente(ambiente, { telefono = false } = {}) {
  if (telefono === true || ambiente?.TALOS_KERNEL_SUL_TELEFONO === '1') return null;
  return ambiente?.TALOS_CATALOGO_BLOCCHI === '0' ? null : { clic: true };
}

/**
 * Decisione 140 (04/11/2026): «Blocchi vivi nelle risposte», la preferenza della persona, letta UNA volta alla NASCITA di una
 * conversazione (condizione di Performance: mai a ogni richiesta) e timbrata dal registro, così una chat già aperta non cambia un byte
 * del prefisso (Hermes `_cached_system_prompt`, `agent/chat_completion_helpers.py:1744-1759`; Codex: le funzioni restano
 * «session-static», `core/src/session/mod.rs:2405-2409`).
 * Condizione del Mobile (forma del 04/11, 10:58): una conversazione che NASCE dal telefono (Chat e Codice remoti, `dispositivo` è l'id
 * del dispositivo appaiato) resta senza catalogo finché il telefono non ha i disegnatori (UI-137): riceverebbe JSON grezzo. Una nata sul
 * PC e poi aperta dal telefono tiene il suo timbro (lì i blocchi arrivano come testo leggibile, MCP Apps `docs/overview.md:26-28`).
 * Una lettura che si rompe vale il di serie: acceso.
 * @param {(() => boolean) | null} preferenzaFn
 * @returns {(nascita?: { dispositivo?: string | null }) => boolean}
 */
export function blocchiViviAllaNascita(preferenzaFn) {
  return ({ dispositivo = null } = {}) => {
    if (dispositivo) return false;
    if (typeof preferenzaFn !== 'function') return true;
    try { return preferenzaFn() !== false; } catch { return true; }
  };
}

/** Stima dichiarata dei token: caratteri / 3,5, arrotondata per eccesso. */
export function stimaToken(testo) {
  return Math.ceil(String(testo).length / 3.5);
}

const UNIONI = new Set(['scelta', 'testo-o-numero', 'cella']);

const oggettoDi = (s) => `{${s.campi.map((c) => `${c.nome}${c.obbligatorio ? '' : '?'}: ${tipoDi(c.schema)}`).join(', ')}}`;

function tipoDi(s) {
  if (s === SCHEMA_FONTE) return 'Fonte';
  switch (s.t) {
    case 'testo': return 'string';
    case 'numero': return 'number';
    case 'logico': return 'boolean';
    case 'scelta': return s.valori.map((v) => `"${v}"`).join('|');
    case 'testo-o-numero': return 'string|number';
    case 'cella': return 'string|number|null';
    case 'lista': return UNIONI.has(s.di.t) ? `(${tipoDi(s.di)})[]` : `${tipoDi(s.di)}[]`;
    case 'oggetto': return oggettoDi(s);
    default: return 'unknown';
  }
}

const COMUNI = new Set(['id', 'titolo', 'fonte']);

function firma(tipo) {
  const voce = CATALOGO[tipo];
  // v2 (tetto 1000 con 11 tipi): `id`, `titolo?` e `fonte?` sono di ogni tipo e si dicono UNA volta nella sintassi: qui `id` e
  // `titolo?` restano solo come nomi, al loro posto (gli argomenti sono posizionali), e `fonte` (sempre l'ultimo, sempre facoltativo)
  // non si ripete. Risparmio misurato il 05/11: pieno da 1160 a 1009 token insieme alle descrizioni più corte.
  return `${voce.componente}(${voce.argomenti.filter((a) => a.nome !== 'fonte').map((a) => `${a.nome}${a.obbligatorio ? '' : '?'}${COMUNI.has(a.nome) ? '' : `: ${tipoDi(a.schema)}`}`).join(', ')})`;
}

const DESCRIZIONI = {
  tabella: () => 'max 12 columns, 500 rows, 200 characters per cell; cells in column order.',
  grafico: () => 'descrizione: what it shows, in words. Max 6 series of 60 points; a pie: 1 series, max 8 slices.',
  scelte: (clic) => (clic
    ? 'up to 6 short options (80 characters, one line); the person picks one and it comes back to you as their message.'
    : 'up to 6 short options (80 characters, one line), shown numbered; the person answers by writing the number or the text.'),
  modulo: () => 'max 8 fields; opzioni only for "scelta" and "piu-scelte". The answers come back to you as their message.',
  'chiave-valore': () => 'max 20 pairs.',
  passi: () => 'ordered steps, max 30.',
  avviso: () => 'one notice, max 400 characters.',
  cursore: () => 'a slider; the page computes formula on each row as it moves. formula: numbers, + - * / ( ), the slider id, column ids.',
  metriche: () => '2-6 key numbers.',
  confronto: () => '2-4 options side by side, max 8 pros and 8 cons each.',
  diagramma: () => 'max 12 nodes, 16 arrows between node ids.',
};

const ESEMPI = {
  tabella: 'root = Tabella("sales", "Sales", [{id: "month", titolo: "Month", tipo: "testo"}, {id: "eur", titolo: "Euro", tipo: "soldi"}], [\n  ["January", 1200],\n  ["February", 980]\n])',
  grafico: 'root = Grafico("trend", null, "linee", "Visits grow from 10 to 14.", [{nome: "Visits", punti: [{x: "Mon", y: 10}, {x: "Tue", y: 14}]}])',
  scelte: 'root = Scelte("next", null, "How do we go on?", [{testo: "Continue"}, {testo: "Stop here"}])',
  modulo: 'root = Modulo("trip", null, [{id: "city", etichetta: "City", tipo: "testo"}], "Search")',
  'chiave-valore': 'root = ChiaveValore("server", null, [{chiave: "CPU", valore: "42%", stato: "ok"}])',
  passi: 'root = Passi("plan", null, [{titolo: "Copy the data", stato: "fatto"}, {titolo: "Check", stato: "ora"}])',
  avviso: 'root = Avviso("disk", null, "attenzione", "The disk is almost full.")',
  cursore: 'root = Cursore("tip", null, {id: "pct", etichetta: "Tip %", min: 0, max: 30, passo: 5}, [{id: "item", titolo: "Item"}, {id: "eur", titolo: "Euro"}], [["Dinner", 40]], "eur * pct / 100", "soldi")',
  metriche: 'root = Metriche("month", null, [{nome: "Spend", valore: 675.3, formato: "soldi", verso: "su"}, {nome: "Chats", valore: 214}])',
  confronto: 'root = Confronto("host", null, [{nome: "Cloud", pro: ["Fast"], contro: ["Costs"]}, {nome: "Local", pro: ["Private"]}])',
  diagramma: 'root = Diagramma("flow", null, [{id: "a", testo: "Ask"}, {id: "b", testo: "Answer"}], [{da: "a", a: "b"}])',
};

function tipiDellaSuperficie(tipi, clic) {
  const chiesti = Array.isArray(tipi) ? new Set(tipi) : new Set(TIPI);
  // ordine del catalogo, mai quello di chi chiama: lo stesso insieme dà lo stesso testo
  return TIPI.filter((t) => chiesti.has(t) && (clic || (t !== 'modulo' && t !== 'cursore')));
}

function componi(tipi, clic, minimo) {
  const recinto = '```';
  const righe = [
    '## Blocks',
    `To show structured content, you may write a block: a fenced code block with the language \`${LINGUA_DEL_RECINTO}\`. Use one only when it reads better than prose; explanations stay in prose outside the fence.`,
    '',
    'Syntax (OpenUI Lang 1.0, data only):',
    '- One block per fence, one statement: `root = Type(arguments)`.',
    '- Arguments are positional, in the order shown. Write `null` to skip an optional one; leave out optional ones at the end.',
    '- Strings in double quotes, one line each; plain numbers; `true`/`false`; lists `[a, b]`; objects `{key: value}`.',
    '- No operators, variables ($), functions (@) or a Type inside another.',
    '- `id`: short unique string. `titolo`: optional title string. Write text in the person\'s language; keep type and field names as shown.',
  ];
  if (!minimo) righe.push('- An unknown type, an extra field or a value over a limit breaks the block: the person sees raw text.');
  righe.push(`- \`fonte\` = ${oggettoDi(SCHEMA_FONTE)}: optional last argument of every Type: the file, tool or web page the data came from.`);
  if (tipi.some((t) => TIPI_INTERATTIVI.includes(t))) {
    const interattivi = tipi.filter((t) => TIPI_INTERATTIVI.includes(t)).map((t) => CATALOGO[t].componente).join(' or ');
    righe.push(`- Never use ${interattivi} for content taken from a web page, file or tool output.`);
  }
  righe.push('', 'Types:');
  for (const tipo of tipi) {
    righe.push(minimo ? `- ${firma(tipo)}` : `- ${firma(tipo)}: ${DESCRIZIONI[tipo](clic)}`);
  }
  // il nucleo minimo (modelli locali) prende l'esempio più corto: la tabella a più righe da sola vale ~65 token
  const esempio = minimo && tipi.includes('avviso') ? 'avviso' : tipi.includes('tabella') ? 'tabella' : tipi[0];
  righe.push('', 'Example:', `${recinto}${LINGUA_DEL_RECINTO}`, ESEMPI[esempio], recinto);
  return righe.join('\n');
}

const MEMORIA = new Map();

/**
 * Il testo del catalogo per il prompt di sistema.
 * @param {{ tipi?: string[], clic?: boolean, minimo?: boolean }} [opzioni]
 *   `tipi`: i tipi che la superficie sa disegnare (di serie tutti); `clic: false` per una superficie senza clic (CLI);
 *   `minimo: true` per il nucleo minimo dei modelli locali.
 * @returns {string} '' se la superficie non disegna nessun tipo
 */
export function promptDelCatalogo(opzioni) {
  const clic = !(opzioni && opzioni.clic === false);
  const minimo = Boolean(opzioni && opzioni.minimo);
  const tipi = tipiDellaSuperficie(opzioni && opzioni.tipi, clic);
  const chiave = `${tipi.join(',')}|${clic}|${minimo}`;
  if (!MEMORIA.has(chiave)) MEMORIA.set(chiave, tipi.length === 0 ? '' : componi(tipi, clic, minimo));
  return MEMORIA.get(chiave);
}
