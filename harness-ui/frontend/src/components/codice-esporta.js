/*
 * ⭐ 23/10/2026 sera (owner, bozzetto approvato: «come fa ChatGPT e Claude… un comando copia oppure esporta come documento») —
 *   L'ESPORTAZIONE DI UN BLOCCO DI CODICE: il nome del file, l'estensione e i tre formati del menu «⋯» (file del linguaggio,
 *   Markdown, testo). Funzioni pure, provate da sole (`tests/unit/codice-esporta.test.mjs`); lo scaricamento vero è l'ultima.
 *
 * Ricerca del 23/10/2026 (`Downloads/handoff-talos-2026-09-27/RICERCA-BLOCCHI-CODICE-2026-10-23.md`), letta nel codice:
 * - LibreChat `client/src/utils/downloadFile.ts:81-85`: mappa delle sole eccezioni con `Object.prototype.hasOwnProperty.call`, e
 *   un'indicazione che sembra già un'estensione (`/^[a-z0-9]{1,11}$/`) passa così com'è; ignoto ⇒ `txt`. ⛔ Streamdown
 *   (`lib/code-block/download-button.tsx:342-343`) usa `language in languageExtensionMap`: una lingua «constructor» trova una
 *   proprietà del prototipo e il nome diventa «file.function Object()…». Qui la guardia è quella di LibreChat.
 * - Streamdown `lib/utils.ts:74-76`: il BOM UTF-8 davanti a un CSV «so Excel on Windows correctly detects the encoding».
 * - Il nome: Streamdown `file.<ext>` e LibreChat `code.<ext>` sono anonimi e si sovrascrivono in Download. Owner 23/10: si usa il
 *   nome che il modello scrive nella riga d'apertura (```python sync.py, ```python title="sync.py"), altrimenti
 *   `talos-<lingua>-<AAAAMMGG-HHMM>.<ext>`. Nessuno dei concorrenti offre il Markdown del singolo blocco: è il passo in più.
 * - Windows è la piattaforma principale: via `<>:"/\|?*` e i caratteri di controllo, via punti e spazi finali, i nomi riservati
 *   (CON, PRN, AUX, NUL, COM1-9, LPT1-9) prendono un `_` davanti (Microsoft, «Naming Files, Paths, and Namespaces»).
 */

/** Le sole lingue la cui estensione non è il nome stesso (le chiavi sono quelle dichiarate o quelle di Prism, in minuscolo). */
const ESTENSIONI = Object.freeze({
  javascript: 'js', node: 'js', es6: 'js', es2015: 'js', ecmascript: 'js', typescript: 'ts', python: 'py', python3: 'py', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh',
  powershell: 'ps1', pwsh: 'ps1', markup: 'html', markdown: 'md', yaml: 'yml', csharp: 'cs', 'c#': 'cs', 'c++': 'cpp',
  golang: 'go', rust: 'rs', ruby: 'rb', kotlin: 'kt', perl: 'pl', haskell: 'hs', elixir: 'ex', erlang: 'erl', objectivec: 'm',
  text: 'txt', plaintext: 'txt', plain: 'txt', makefile: 'mk', dockerfile: 'dockerfile', protobuf: 'proto', graphql: 'graphql',
});

/** L'estensione per una lingua dichiarata: dalla mappa, o la lingua stessa se ha già la forma di un'estensione, o `txt`. */
export function estensioneDi(linguaggio) {
  const l = String(linguaggio ?? '').trim().toLowerCase();
  if (!l) return 'txt';
  if (Object.prototype.hasOwnProperty.call(ESTENSIONI, l)) return ESTENSIONI[l];
  /* «python3.11», «node20»: la lingua con la versione attaccata (revisione F13) è la lingua */
  const senzaVersione = l.replace(/[\d.]+$/u, '');
  if (senzaVersione !== l && Object.prototype.hasOwnProperty.call(ESTENSIONI, senzaVersione)) return ESTENSIONI[senzaVersione];
  /* «html5», «css3», «php8», «c99»: la versione non è parte dell'estensione (riverifica R4) */
  if (senzaVersione !== l && VERSIONATE.has(senzaVersione)) return senzaVersione;
  /* una «lingua» che è un formato puramente BINARIO (```exe) non è codice da salvare con quel nome: un testo resta un testo
     (d'accordo col Mobile, 23/10); gli script (bat, ps1, js…) tengono la loro estensione */
  if (BINARI.has(l)) return 'txt';
  return /^[a-z0-9]{1,11}$/u.test(l) ? l : 'txt';
}
/** «html5» → «html», «c99» → «c»: solo le lingue versionate note (le stesse dell'estensione); le altre restano come sono. Per
 *  l'etichetta della barra (revisione del 24/10: la barra mostrava «html5», «c99»). */
export function linguaSenzaVersione(linguaggio) {
  const l = String(linguaggio ?? '').trim().toLowerCase();
  const s = l.replace(/[\d.]+$/u, '');
  return s !== l && VERSIONATE.has(s) ? s : l;
}
/** Un formato che Windows esegue e che si salva come testo (`url`, `hta`…): non è una lingua da mostrare (revisione del 24/10). */
export function eFormatoEseguibileComeTesto(linguaggio) {
  return BINARI.has(String(linguaggio ?? '').trim().toLowerCase());
}
/* le lingue che si scrivono con la versione attaccata e la cui estensione è il nome senza versione */
const VERSIONATE = new Set(['html', 'css', 'php', 'c', 'cpp', 'java', 'lua', 'perl', 'sql']);
/* più i formati che Windows apre ed ESEGUE senza essere codice da leggere (scorciatoie, applicazioni HTML, installazioni: riverifica R3) */
const BINARI = new Set(['exe', 'com', 'scr', 'msi', 'msp', 'lnk', 'pif', 'cpl', 'dll', 'jar', 'appx', 'msix', 'url', 'scf', 'inf', 'hta', 'application', 'gadget']);

/* Windows 11 tratta come riservati anche COM0/LPT0 e le cifre in apice (Microsoft, «Naming Files, Paths, and Namespaces») */
const RISERVATI = /^(?:con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])$/iu;
const ESTENSIONE_FINALE = /\.([A-Za-z0-9]{1,10})$/u;

/** Un nome di file che Windows accetta, o null se non resta niente. Al più 100 caratteri, l'estensione salva. */
export function sanificaNomeFile(nome) {
  /* ⛔ revisione F5: anche i caratteri di FORMATO (\p{Cf}: i comandi bidi come U+202E, lo spazio a larghezza zero): con U+202E
     «photo‮gpj.exe» si legge «photoexe.jpg» nella finestra «Salva con nome» */
  // eslint-disable-next-line no-control-regex
  let n = String(nome ?? '').replace(/[\u0000-\u001f\u007f<>:"/\\|?*\p{Cf}]/gu, '').replace(/[. ]+$/u, '').trim();
  if (!n || /^\.+$/u.test(n)) return null;
  const base = n.split('.')[0];
  if (RISERVATI.test(base)) n = `_${n}`;
  /* il taglio conta i caratteri veri, non le metà di una coppia surrogata (un'emoji tagliata a metà lascia un `\ud83d` orfano) */
  const caratteri = Array.from(n);
  if (caratteri.length > 100) {
    const ext = ESTENSIONE_FINALE.exec(n)?.[0] ?? '';
    n = `${caratteri.slice(0, 100 - ext.length).join('')}${ext}`;
  }
  return n;
}

/*
 * ⛔ revisione F5: il nome lo scrive il modello, e il testo del modello può venire da una pagina letta in rete. Un'estensione che
 *   Windows ESEGUE (doppio clic) passa solo se è quella della lingua dichiarata (```bat run.bat, ```powershell x.ps1); altrimenti
 *   (```text invoice.pdf.exe, ```sh example.com) il file prende il nome di serie con l'estensione della lingua.
 */
const ESEGUIBILI = new Set(['exe', 'com', 'scr', 'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta', 'msi', 'msp',
  'lnk', 'pif', 'reg', 'cpl', 'jar', 'dll', 'scf', 'url', 'application', 'gadget', 'inf', 'appx', 'msix', 'msc']);

/* l'estensione comincia con una lettera: «python3.11» o «v1.2» non sono file, «sync.py» e «src/app.ts» sì */
const SEMBRA_UN_FILE = /^[^\s"'`{}=]+\.[A-Za-z][A-Za-z0-9]{0,9}$/u;
/* fra virgolette (title="My File.js") lo spazio fa parte del nome */
const SEMBRA_UN_FILE_FRA_VIRGOLETTE = /^[^"'`{}=\r\n]+\.[A-Za-z][A-Za-z0-9]{0,9}$/u;

/**
 * Il nome che il modello ha scritto nella riga d'apertura del recinto (tutto ciò che segue i backtick): `python sync.py`,
 * `python title="sync.py"`, `ts src/app.ts`, `python {filename="x.py"}`. Il nome BASE, senza cartelle; null se non c'è.
 */
export function nomeDalRecinto(info) {
  const testo = String(info ?? '').trim();
  if (!testo) return null;
  const chiave = /(?:^|[\s{,])(?:title|file|filename|name|path)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^"'\s},]+))/iu.exec(testo);
  const fraVirgolette = Boolean(chiave && (chiave[1] ?? chiave[2]));
  const pezzi = testo.split(/\s+/u);
  /* prima i pezzi DOPO la lingua; poi il primo pezzo stesso (```sync.py senza lingua), se ha la forma di un file */
  const candidati = chiave ? [(chiave[1] ?? chiave[2] ?? chiave[3]).trim()] : [...pezzi.slice(1), pezzi[0]];
  for (const c of candidati) {
    if (!(fraVirgolette ? SEMBRA_UN_FILE_FRA_VIRGOLETTE : SEMBRA_UN_FILE).test(c) || c.startsWith('-')) continue;
    const base = c.split(/[\\/]/u).pop();
    const pulito = sanificaNomeFile(base);
    if (pulito) return pulito;
  }
  return null;
}

/**
 * La riga d'apertura per un file VERO (il lettore conosce il nome): fra virgolette, così un nome con spazi resta intero e passa dalla
 * stessa strada (e dalle stesse difese) del nome scritto dal modello. Vuota se il nome non si può citare.
 */
export function infoDelFile(nome, linguaggio = '') {
  const n = String(nome ?? '').trim();
  if (!n || /["\r\n]/u.test(n)) return '';
  return `${String(linguaggio ?? '').trim()} title="${n}"`.trim();
}

const due = (n) => String(n).padStart(2, '0');
/** `AAAAMMGG-HHMM` nell'ora locale: due scaricamenti dello stesso minuto si distinguono dal numero che il sistema aggiunge. */
export function marcaTemporale(ora = new Date()) {
  const d = ora instanceof Date ? ora : new Date(ora);
  return `${d.getFullYear()}${due(d.getMonth() + 1)}${due(d.getDate())}-${due(d.getHours())}${due(d.getMinutes())}`;
}

/** La riga più lunga di backtick dentro il codice decide il recinto del Markdown: sempre uno di più, almeno tre. */
export function comeMarkdown(testo, linguaggio = '') {
  const corpo = String(testo ?? '');
  const piuLunga = Math.max(0, ...[...corpo.matchAll(/`+/gu)].map((m) => m[0].length));
  const recinto = '`'.repeat(Math.max(3, piuLunga + 1));
  /* un apice inverso nella riga d'apertura la rompe per CommonMark («```js`x» non apre un recinto): via (revisione F13) */
  const lingua = (String(linguaggio ?? '').trim().split(/\s+/u)[0] ?? '').replace(/`/gu, '');
  return `${recinto}${lingua}\n${corpo}${corpo.endsWith('\n') ? '' : '\n'}${recinto}\n`;
}

export const FORMATI_CODICE = Object.freeze(['sorgente', 'md', 'txt']);

/**
 * Il file di UN formato: `{ nome, testo, mime }`. `formato`: 'sorgente' (l'estensione della lingua), 'md' o 'txt'.
 * Il testo è quello GREZZO del blocco, come la copia (mai il DOM evidenziato).
 */
export function fileDelCodice(formato, { testo = '', linguaggio = '', info = '', ora = new Date() } = {}) {
  const ext = estensioneDi(linguaggio);
  const proposto = nomeDalRecinto(info);
  const extProposta = proposto ? ESTENSIONE_FINALE.exec(proposto)?.[1]?.toLowerCase() : null;
  const dalModello = proposto && extProposta && ESEGUIBILI.has(extProposta) && extProposta !== ext ? null : proposto;
  const lingua = String(linguaggio ?? '').trim().toLowerCase().replace(/[^a-z0-9]/gu, '') || 'code';
  const radice = dalModello ? dalModello.replace(ESTENSIONE_FINALE, '') || dalModello : `talos-${lingua}-${marcaTemporale(ora)}`;
  if (formato === 'md') return { nome: sanificaNomeFile(`${radice}.md`), testo: comeMarkdown(testo, linguaggio), mime: 'text/markdown;charset=utf-8' };
  if (formato === 'txt') return { nome: sanificaNomeFile(`${radice}.txt`), testo: String(testo ?? ''), mime: 'text/plain;charset=utf-8' };
  /* il file del linguaggio: il nome del modello tiene la SUA estensione (sync.py), altrimenti quella della lingua */
  const nome = sanificaNomeFile(dalModello && ESTENSIONE_FINALE.test(dalModello) ? dalModello : `${radice}.${ext}`);
  /* il BOM segue il file che parte davvero (```text data.csv è un CSV), non solo la lingua (revisione F13) */
  const csv = /\.csv$/iu.test(nome ?? '');
  return { nome, testo: `${csv ? '﻿' : ''}${String(testo ?? '')}`, mime: csv ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' };
}

/**
 * Lo scaricamento nel browser e nel guscio Electron (che, senza un gestore `will-download`, segue la sua strada di serie: di
 * solito la finestra «Salva con nome», doc Electron `DownloadItem.setSavePath`). Il blob si revoca DOPO, mai subito dopo il
 * clic (LibreChat 1 s, `sezioni-adattatori.js` 5 s): in alcuni motori una revoca immediata annulla lo scaricamento.
 */
export function scaricaFile(doc, { nome, testo, mime }) {
  const finestra = doc.defaultView ?? globalThis;
  const url = finestra.URL.createObjectURL(new finestra.Blob([testo], { type: mime }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  a.hidden = true;
  doc.body.append(a);
  a.click();
  a.remove();
  finestra.setTimeout(() => finestra.URL.revokeObjectURL(url), 5000);
}
