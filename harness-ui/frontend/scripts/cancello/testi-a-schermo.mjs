/*
 * Cancello della lingua — strato 2: NIENTE TESTO FISSO A SCHERMO (owner 03/10/2026, «ogni singola parola nella app deve essere
 * sia in inglese che in italiano, non negoziabile» e «ci deve essere una guardia/cancello per questa cosa»).
 *
 * Trova i testi scritti nel codice che arrivano alla persona SENZA passare dal dizionario: un `textContent = 'Chiudi'`, un
 * `setAttribute('aria-label', 'Apri il menu')`, un `toast('Salvato', …)`. In una app impostata in inglese quelle parole
 * restano italiane, e non c'è nessun errore da nessuna parte: per questo serve un cancello e non la buona volontà.
 *
 * Ricerca 03/10/2026 (ledger `.claude/LEDGER-I18N-2026-10-03.md`):
 *   · VS Code, `local/code-no-unexternalized-strings` (eslint.config.js:104) e eslint-plugin-i18next `no-literal-string`:
 *     la regola guarda i letterali che arrivano all'utente, e in CI diventa un errore bloccante (OpenMetadata #32770);
 *   · la stessa regola ha un modo «solo i punti di arrivo» (JSX text e attributi come placeholder/alt/title/aria-*): è
 *     quello scelto qui, perché un letterale qualunque nel codice è quasi sempre un nome di cosa (una classe, un evento,
 *     un campo) e un cancello che grida al lupo viene spento. Ciò che arriva a schermo passando da una variabile lo prende
 *     lo strato 3, la pseudo-lingua sul 4174, che guarda la pagina disegnata.
 * Parser: il compilatore TypeScript già fra le dipendenze di sviluppo (`ts.createSourceFile`, ScriptKind dal nome del file).
 *
 * PURO: niente disco. `testiFissiNelSorgente(testo, nomeFile)` → righe `{file, riga, colonna, dove, testo}`.
 */
import ts from 'typescript';

/* Le proprietà del DOM che sono testo per la persona. */
const PROPRIETA_A_SCHERMO = new Set(['textContent', 'innerText', 'title', 'placeholder', 'ariaLabel', 'alt', 'ariaDescription', 'ariaRoleDescription', 'ariaValueText']);
/* Gli attributi che sono testo per la persona (anche per chi usa un lettore di schermo). */
const ATTRIBUTI_A_SCHERMO = new Set(['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'aria-placeholder']);
/*
 * Gli aiutanti di casa che mettono un testo a schermo, con la posizione dell'argomento che è il testo.
 * Misurati sul codice il 03/10/2026: `textElement(tag, classe, testo)` in app.js, `el(doc, tag, classe, testo)` nei
 * componenti, `make(tag, classe, testo)` nella scheda delle domande, `toast(titolo, corpo)`.
 */
const AIUTANTI = new Map([
  ['textElement', [2]], ['make', [2]], ['toast', [0, 1]], ['createTextNode', [0]], ['alert', [0]], ['confirm', [0]], ['prompt', [0]],
]);
/* `el(doc, tag, classe, testo)` ha quattro argomenti; `el(tag, classe, testo)` tre: il testo è l'ultimo. */
const AIUTANTI_ULTIMO_ARGOMENTO = new Set(['el']);
/* Le chiavi d'oggetto che sono testo per la persona, dentro una chiamata che disegna (`crea…`, `mostra…`, `toast…`). */
const CHIAVI_A_SCHERMO = new Set(['titolo', 'testo', 'badge', 'etichetta', 'label', 'descrizione', 'perche', 'nota', 'placeholder',
  'title', 'frase', 'messaggio', 'sottotitolo', 'conferma', 'annulla', 'vuoto', 'aiuto', 'suggerimento', 'tooltip']);
const CHIAMATE_CHE_DISEGNANO = /^(?:crea|mostra|apri|toast|conferma|disegna|render)/u;
/* Le funzioni del dizionario: ciò che passa di qui è già tradotto (lo controlla lo strato 1). */
const TRADUZIONE = new Set(['t', 'tn', 'tr']);

/*
 * Ciò che NON è una parola da tradurre: nomi propri e marchi (uguali in ogni lingua), sigle, simboli. Lista POSITIVA e
 * dichiarata, come `testo-grezzo.mjs` e jwarby/i18n-lint: un nome si ammette scrivendolo qui, non con un'euristica.
 */
export const NOMI_AMMESSI = Object.freeze(new Set(['TALOS', 'GitHub', 'Hermes', 'MCP', 'WSL', 'Linux', 'Windows', 'macOS', 'PDF', 'URL',
  'HTML', 'CSS', 'JSON', 'Markdown', 'OpenRouter', 'OK', 'Ctrl', 'Shift', 'Alt', 'Esc', 'Enter', 'Tab', 'PowerShell', 'Git', 'npm', 'API']));

/** Un testo fatto di parole? Almeno due lettere di fila, e non solo nomi ammessi o un identificatore. */
export function eTestoDaTradurre(testo) {
  const t = String(testo ?? '').trim();
  if (!/\p{L}{2,}/u.test(t)) return false;
  const parole = t.match(/\p{L}[\p{L}'’]*/gu) || [];
  if (parole.length && parole.every((p) => NOMI_AMMESSI.has(p))) return false;
  /* un identificatore (classe, evento, chiave): niente spazi, e trattini, sottolineature, punti o cifre attaccati */
  if (!/\s/u.test(t) && /^[a-z0-9]+(?:[-_.:/][a-z0-9]+)+$/u.test(t)) return false;
  /* un ELENCO di classi (`talos-button talos-button--ghost`): `el(doc, tag, classe)` ha tre argomenti come `el(tag, classe,
     testo)`, e l'ultimo qui è una classe. Ogni pezzo è un nome in minuscolo, e almeno uno ha il trattino o la sottolineatura. */
  const pezzi = t.split(/\s+/u);
  if (pezzi.every((p) => /^[a-z][a-z0-9]*(?:(?:--?|__?)[a-z0-9]+)*$/u.test(p)) && pezzi.some((p) => /[-_]/u.test(p))) return false;
  return true;
}

function nomeChiamata(chiamata) {
  const e = chiamata.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
}

/** I pezzi di testo fisso dentro un'espressione che finisce a schermo (rami di ?:, ||, +, template, parentesi). */
function testiFissi(espr, fuori) {
  if (!espr) return;
  if (ts.isParenthesizedExpression(espr) || ts.isAsExpression?.(espr)) return testiFissi(espr.expression, fuori);
  if (ts.isStringLiteral(espr) || ts.isNoSubstitutionTemplateLiteral(espr)) { if (eTestoDaTradurre(espr.text)) fuori.push([espr, espr.text]); return; }
  if (ts.isTemplateExpression(espr)) {
    const statico = [espr.head.text, ...espr.templateSpans.map((s) => s.literal.text)].join(' … ');
    /* 03/10/2026: per GIUDICARE, ogni `${…}` diventa una CIFRA (`0`), non uno spazio: `talos-dot--${tono}` è
       `talos-dot--0`, una classe, e l'elenco di classi non conta; `Elimina ${n} file` resta una frase. Si RIPORTA `statico`. */
    const daGiudicare = [espr.head.text, ...espr.templateSpans.map((s) => s.literal.text)].join('0'); // una cifra: vale come pezzo di nome, e non è una parola (una lettera sola lo sarebbe: «TALOS x»)
    if (eTestoDaTradurre(daGiudicare)) fuori.push([espr, statico]);
    return;
  }
  if (ts.isConditionalExpression(espr)) { testiFissi(espr.whenTrue, fuori); testiFissi(espr.whenFalse, fuori); return; }
  if (ts.isBinaryExpression(espr)) {
    const op = espr.operatorToken.kind;
    if (op === ts.SyntaxKind.PlusToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.AmpersandAmpersandToken) {
      if (op !== ts.SyntaxKind.AmpersandAmpersandToken) testiFissi(espr.left, fuori);
      testiFissi(espr.right, fuori);
    }
    return;
  }
  if (ts.isCallExpression(espr) && TRADUZIONE.has(nomeChiamata(espr))) return; // già nel dizionario
}

/*
 * ⛔ Strato 2b (03/10/2026) — le FRASI ITALIANE scritte nel codice, ovunque, fuori dal dizionario. Lo strato 2 guarda i punti
 *   d'arrivo e non vede una frase che arriva a schermo passando da una variabile: `errori.js` restituisce oggetti
 *   `{cosa, perche, rimedi}` tutti in italiano, li disegna un altro file, e lo strato 2 gli dava ZERO. Qui si conta ogni
 *   letterale con almeno uno spazio e una parola che in inglese non esiste (articoli, preposizioni articolate, «che», «non»…).
 * Restano fuori: gli argomenti di `t()`/`tn()` (sono chiavi, le conta lo strato 1), `console.*` (strumenti di sviluppo, non
 *   l'app), gli import. Una frase inglese con «non-» (non-empty) non conta: il trattino la separa.
 */
const PAROLE_ITALIANE = ['il', 'lo', 'gli', 'della', 'delle', 'dello', 'degli', 'del', 'dei', 'nella', 'nelle', 'nel', 'alla', 'alle', 'dal',
  'dalla', 'che', 'non', 'per', 'con', 'una', 'uno', 'sono', 'questo', 'questa', 'quando', 'nessun', 'nessuna', 'ancora', 'già', 'più', 'perché',
  'anche', 'oppure', 'ogni', 'tutti', 'tutte', 'senza', 'dove', 'qui', 'ora', 'puoi', 'devi', 'hai', 'sei', 'tuo', 'tua', 'tuoi'];
const RE_ITALIANO = new RegExp(`(?:^|[^\\p{L}-])(?:${PAROLE_ITALIANE.join('|')})(?=$|[^\\p{L}-])|[àèìòù]`, 'iu');

/** Un letterale che è prosa italiana: almeno uno spazio, e una parola o una vocale accentata che in inglese non c'è. */
export function eFraseItaliana(testo) {
  const t = String(testo ?? '');
  /* 03/10/2026: un ELENCO di classi (`talos-agente__ora talos-mono talos-muted`) non è prosa: «ora», «dove», «quando» dentro un
     nome BEM sembravano parole italiane (4 falsi positivi misurati). Ogni pezzo è un nome in minuscolo col trattino o la
     sottolineatura: più stretto della regola di `eTestoDaTradurre`, perché qui basta UNA parola italiana per contare. */
  const pezzi = t.trim().split(/\s+/u);
  if (pezzi.every((p) => /^[a-z][a-z0-9]*(?:(?:--?|__?)[a-z0-9]+)+$/u.test(p))) return false;
  return /\s/u.test(t.trim()) && RE_ITALIANO.test(t);
}

/*
 * 03/10/2026: un letterale che NON è testo a schermo pur sembrando italiano — un valore del protocollo del kernel
 *   (`'non concluso'`), i termini di ricerca scritti apposta nelle due lingue — si dichiara con un commento subito prima,
 *   `/* lingua: <perché> *\/`. Il perché è obbligatorio: un'eccezione senza motivo nasconde un difetto (stessa regola di
 *   `COMBO_GESTITE_ALTROVE`). Il commento si vede nella revisione, e la prova lo conta.
 */
const RE_DICHIARATO = /^\/\*\s*lingua:\s*\S.{3,}\*\/$/su;
export function dichiaratoNonTesto(sorgente, nodo) {
  /* Sulla stessa riga del token precedente, per TypeScript un commento è «trailing» di quel token (`, /* … *\/ 'x'`): si
     guardano tutti e due, sempre a partire dall'inizio del letterale (`nodo.pos`, prima del suo spazio). */
  const commenti = [...(ts.getTrailingCommentRanges(sorgente, nodo.pos) || []), ...(ts.getLeadingCommentRanges(sorgente, nodo.pos) || [])];
  return commenti.some((c) => RE_DICHIARATO.test(sorgente.slice(c.pos, c.end).trim()));
}

/*
 * 03/10/2026: anche i file TypeScript del frontend (Impostazioni, comandi, barra di navigazione, catalogo: 153 frasi italiane in
 *   7 file) sono testo a schermo, e il cancello leggeva solo i `.js`. Un `.ts` si legge come TypeScript. Misurato sui 7 file:
 *   letti come JS danno le stesse stringhe, ma un cast `<tipo>valore` in modalità JS spezza l'albero (2 frasi → 0).
 */
export function tipoDiScript(file) {
  return /\.tsx$/iu.test(file) ? ts.ScriptKind.TSX : /\.ts$/iu.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
}

/** Le frasi italiane di un sorgente, fuori dagli argomenti del dizionario, da `console.*` e dagli import. */
export function frasiItalianeNelSorgente(sorgente, file = 'sorgente.js') {
  const sf = ts.createSourceFile(file, sorgente, ts.ScriptTarget.Latest, true, tipoDiScript(file));
  const righe = [];
  const escluso = (nodo) => {
    for (let p = nodo.parent; p; p = p.parent) {
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
      if (ts.isCallExpression(p)) {
        if (TRADUZIONE.has(nomeChiamata(p)) && p.arguments.some((a) => a === nodo || (a.pos <= nodo.pos && nodo.end <= a.end && ts.isStringLiteralLike(a)))) return true;
        const e = p.expression;
        if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'console') return true;
      }
    }
    return false;
  };
  const visita = (nodo) => {
    let testo = null;
    if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) testo = nodo.text;
    else if (ts.isTemplateExpression(nodo)) testo = [nodo.head.text, ...nodo.templateSpans.map((s) => s.literal.text)].join(' … ');
    if (testo !== null && eFraseItaliana(testo) && !escluso(nodo) && !dichiaratoNonTesto(sorgente, nodo)) {
      const { line } = sf.getLineAndCharacterOfPosition(nodo.getStart(sf));
      righe.push({ file, riga: line + 1, testo: testo.replace(/\s+/gu, ' ').trim().slice(0, 160) });
    }
    if (!ts.isTemplateExpression(nodo)) ts.forEachChild(nodo, visita);
    else for (const s of nodo.templateSpans) visita(s.expression);
  };
  visita(sf);
  return righe;
}

/**
 * @param {string} sorgente il testo di un file `.js`
 * @param {string} file il nome da riportare
 * @returns {{file: string, riga: number, colonna: number, dove: string, testo: string}[]}
 */
export function testiFissiNelSorgente(sorgente, file = 'sorgente.js') {
  const sf = ts.createSourceFile(file, sorgente, ts.ScriptTarget.Latest, true, tipoDiScript(file));
  const righe = [];
  const segna = (dove, espr) => {
    const trovati = [];
    testiFissi(espr, trovati);
    for (const [nodo, testo] of trovati) {
      const { line, character } = sf.getLineAndCharacterOfPosition(nodo.getStart(sf));
      righe.push({ file, riga: line + 1, colonna: character + 1, dove, testo: testo.replace(/\s+/gu, ' ').trim().slice(0, 160) });
    }
  };
  const visita = (nodo) => {
    if (ts.isBinaryExpression(nodo) && nodo.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(nodo.left) && PROPRIETA_A_SCHERMO.has(nodo.left.name.text)) {
      segna(`.${nodo.left.name.text} =`, nodo.right);
    }
    else if (ts.isCallExpression(nodo)) {
      const nome = nomeChiamata(nodo);
      const arg = nodo.arguments;
      if (nome === 'setAttribute' && arg.length >= 2 && ts.isStringLiteralLike(arg[0]) && ATTRIBUTI_A_SCHERMO.has(arg[0].text)) segna(`setAttribute('${arg[0].text}')`, arg[1]);
      else if (AIUTANTI.has(nome)) for (const i of AIUTANTI.get(nome)) segna(`${nome}(#${i + 1})`, arg[i]);
      else if (AIUTANTI_ULTIMO_ARGOMENTO.has(nome) && arg.length >= 3) segna(`${nome}(testo)`, arg[arg.length - 1]);
      if (nome !== 'setAttribute' && CHIAMATE_CHE_DISEGNANO.test(nome)) {
        for (const a of arg) {
          if (!ts.isObjectLiteralExpression(a)) continue;
          for (const p of a.properties) {
            if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && CHIAVI_A_SCHERMO.has(p.name.text)) segna(`${nome}({${p.name.text}})`, p.initializer);
          }
        }
      }
    }
    ts.forEachChild(nodo, visita);
  };
  visita(sf);
  return righe;
}
