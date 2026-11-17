/*
 * IL CRICCHETTO DELLE TAGLIE «DALLA BASE» — il misuratore: legge git (mai la cartella di lavoro) e misura un file.
 *
 * Tutto si legge dagli OGGETTI di git delle due revisioni (base e testa): niente file non tracciati, niente legami simbolici
 * seguiti, lo stesso esito a ogni corsa. Hermes, `hermes-agent-2026-11-01/scripts/code_health/ts_units.mjs:229-282`: solo il
 * parser di TypeScript, una riga appartiene alla funzione più interna che la copre.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/* ---------------------------------------------------------------- git */

const AMBIENTE_GIT = (() => {
  const e = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_PREFIX']) delete e[k];
  return e;
})();
/** Un comando di git nel repo, uscita in byte. `core.quotepath` non serve: si usa sempre `-z`. */
export function git(repo, args, opzioni = {}) {
  return execFileSync('git', ['-C', repo, ...args], { env: AMBIENTE_GIT, maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, ...opzioni });
}
export const gitTesto = (repo, args, opzioni) => git(repo, args, { encoding: 'utf8', ...opzioni });

/** La revisione risolta in uno SHA intero, o un errore che dice quale non c'è. */
export function risolvi(repo, rev) {
  try { return gitTesto(repo, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]).trim(); } catch { throw new Error(`«${rev}» non è una revisione di ${repo}`); }
}

/** L'albero intero di una revisione: percorso -> { modo, sha }. I sottomoduli (160000) e i legami (120000) restano col loro modo. */
export function leggiAlbero(repo, rev) {
  const out = new Map();
  for (const voce of gitTesto(repo, ['ls-tree', '-r', '-z', rev]).split('\0')) {
    const t = voce.indexOf('\t');
    if (t < 0) continue;
    const [modo, , sha] = voce.slice(0, t).split(' ');
    out.set(voce.slice(t + 1), { modo, sha });
  }
  return out;
}

/** I file che cambiano fra due alberi: percorso -> { prima, dopo } (ognuno `{ modo, sha }` o null). Nessuna rinomina di git: l'abbinamento è nostro. */
export function cambiFra(alberoBase, alberoTesta) {
  const out = new Map();
  for (const [p, dopo] of alberoTesta) {
    const prima = alberoBase.get(p) ?? null;
    if (!prima || prima.sha !== dopo.sha || prima.modo !== dopo.modo) out.set(p, { prima, dopo });
  }
  for (const [p, prima] of alberoBase) if (!alberoTesta.has(p)) out.set(p, { prima, dopo: null });
  return out;
}

/** Più oggetti in una sola chiamata (`git cat-file --batch`): sha -> Buffer. Uno che manca è un errore, mai un file vuoto. */
export function leggiOggetti(repo, shas) {
  const out = new Map();
  const unici = [...new Set(shas)];
  if (!unici.length) return out;
  const buf = git(repo, ['cat-file', '--batch'], { input: `${unici.join('\n')}\n` });
  let i = 0;
  for (const sha of unici) {
    const a = buf.indexOf(10, i);
    const testa = buf.subarray(i, a).toString('utf8');
    if (/ missing$/u.test(testa)) throw new Error(`oggetto ${sha} mancante in ${repo}`);
    const misura = Number(testa.split(' ').pop());
    out.set(sha, buf.subarray(a + 1, a + 1 + misura));
    i = a + 1 + misura + 1;
  }
  return out;
}

/* ---------------------------------------------------------------- il censimento */

/** L'estensione di un percorso (dall'ultimo punto del nome, se non è il primo carattere), in minuscolo; '' se non ne ha. */
export const estensione = (rel) => { const n = rel.slice(rel.lastIndexOf('/') + 1); const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i).toLowerCase() : ''; };
const cartellaDi = (rel) => rel.slice(0, Math.max(0, rel.lastIndexOf('/')));
const nelleCartelle = (dir, cartelle) => cartelle.some((c) => (c.ricorsiva ? dir === c.dir || dir.startsWith(`${c.dir}/`) : dir === c.dir));

/** Il percorso (relativo alla radice del repo, barre in avanti) è codice contato? */
export function èContato(rel, R) {
  if (!R.ESTENSIONI.includes(estensione(rel)) || R.NON_PRODOTTO.test(rel) || /(^|\/)node_modules\//u.test(rel)) return false;
  if (R.ESCLUSE.some((p) => rel.startsWith(p))) return false;
  return nelleCartelle(cartellaDi(rel), R.CARTELLE);
}
/** Un file di codice non contato che nessuno ha dichiarato fuori (cartella nuova di prodotto). */
export function èFuoriNonDichiarato(rel, R) {
  if (!R.ESTENSIONI.includes(estensione(rel)) || èContato(rel, R) || R.NON_PRODOTTO.test(rel)) return false;
  return !R.FUORI_NOTI.some((p) => rel.startsWith(p)) && !R.FORME_FUORI.some((re) => re.test(rel));
}
export const èDelCancello = (rel, R) => R.FILE_DEL_CANCELLO.some((p) => rel.startsWith(p));

/* ---------------------------------------------------------------- un file */

let tsCache = null;
/** Il parser di TypeScript: dal percorso dato (la coda passa quello delle librerie), poi da `TAGLIE_TYPESCRIPT`, poi dal repo. */
export function typescript(percorso = null, repo = null) {
  if (tsCache) return tsCache;
  const prove = [percorso, process.env.TAGLIE_TYPESCRIPT, repo && join(repo, 'harness-ui', 'node_modules', 'typescript')].filter(Boolean);
  const richiedi = createRequire(import.meta.url);
  for (const p of prove) { try { tsCache = richiedi(p); return tsCache; } catch { /* la prossima */ } }
  try { tsCache = richiedi('typescript'); return tsCache; } catch { throw new Error(`il parser di TypeScript non si trova (provati: ${prove.join(', ') || 'nessun percorso'}, poi «typescript»)`); }
}

const A_CAPO = /\r\n?|[\n\u2028\u2029]/u;
const A_CAPO_G = /\r\n?|[\n\u2028\u2029]/gu;
/** Le righe di un testo con gli stessi a capo di TypeScript; l'a capo finale non apre una riga. */
export function contaRighe(testo) {
  if (testo === '') return 0;
  const n = (testo.match(A_CAPO_G)?.length ?? 0) + 1;
  return /(?:\r\n?|[\n\u2028\u2029])$/u.test(testo) ? n - 1 : n;
}
export const impronta = (s) => createHash('sha1').update(s).digest('hex').slice(0, 20);
export const alfanumerici = (s) => { let n = 0; for (let i = 0; i < s.length; i += 1) { const c = s.charCodeAt(i); if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)) n += 1; } return n; };
const stretto = (s) => s.replace(/\s+/gu, '');

/** Di un `.vue` restano solo i blocchi `<script>`: il resto diventa spazi (le righe restano al loro posto). */
function soloScript(testo) {
  let out = '';
  let fine = 0;
  let ts = false;
  let tsx = false;
  const bianco = (s) => s.replace(/[^\r\n\u2028\u2029]/gu, ' ');
  for (const m of testo.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)) {
    const inizio = (m.index ?? 0) + m[0].indexOf('>') + 1;
    out += bianco(testo.slice(fine, inizio)) + m[2];
    fine = inizio + m[2].length;
    if (/\blang\s*=\s*["']?tsx/iu.test(m[1])) tsx = true; else if (/\blang\s*=\s*["']?ts/iu.test(m[1])) ts = true;
  }
  return { testo: out + bianco(testo.slice(fine)), ts: ts || tsx, tsx };
}

function tipoDiScript(ts, nome, vue) {
  if (vue) return vue.tsx ? ts.ScriptKind.TSX : vue.ts ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  if (/\.tsx$/u.test(nome)) return ts.ScriptKind.TSX;
  if (/\.jsx$/u.test(nome)) return ts.ScriptKind.JSX;
  if (/\.[mc]?ts$/u.test(nome)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** Toglie i commenti (le righe restano): `protetti` sono gli intervalli di stringhe, modelli, espressioni regolari e testo JSX. */
function senzaCommenti(testo, protetti) {
  protetti.sort((a, b) => a[0] - b[0]);
  const pezzi = [];
  const n = testo.length;
  let da = 0;
  let p = 0;
  let i = testo.indexOf('/');
  while (i >= 0 && i < n) {
    while (p < protetti.length && protetti[p][1] <= i) p += 1;
    if (p < protetti.length && protetti[p][0] <= i) { i = testo.indexOf('/', protetti[p][1]); continue; }
    const d = testo.charCodeAt(i + 1);
    if (d === 47) {
      pezzi.push(testo.slice(da, i));
      A_CAPO_G.lastIndex = i;
      const m = A_CAPO_G.exec(testo);
      da = m ? m.index : n;
      i = testo.indexOf('/', da);
    } else if (d === 42) {
      pezzi.push(testo.slice(da, i));
      const fine = testo.indexOf('*/', i + 2);
      const fino = fine < 0 ? n : fine + 2;
      pezzi.push(testo.slice(i, fino).replace(/[^\r\n\u2028\u2029]/gu, ''));
      da = fino;
      i = testo.indexOf('/', da);
    } else i = testo.indexOf('/', i + 1);
  }
  pezzi.push(testo.slice(da));
  return pezzi.join('');
}

const NOMI_INTERNI = new Set(['_load', '_compile', '_extensions', '_resolveFilename', 'dlopen', '_linkedBinding']);
const NOMI_PER_NOME = new Set(['eval', 'Function', 'constructor', 'require', 'createRequire', 'getBuiltinModule', ...NOMI_INTERNI]);

/**
 * Misura un file: righe, caratteri, controllo dei tipi, funzioni (righe e caratteri PROPRI, corpo normalizzato), righe
 * normalizzate (senza commenti né spazi), stringhe letterali con la forma in cui stanno e forme che caricano codice.
 * Un file che non si analizza porta `errore` e le sole misure del testo: non è mai una misura parziale presa per buona.
 */
export function analizza(ts, testo, nome, R) {
  const K = ts.SyntaxKind;
  const vue = nome.endsWith('.vue') ? soloScript(testo) : null;
  const sorgente = vue ? vue.testo : testo;
  const sf = ts.createSourceFile(nome.replace(/\.vue$/u, '.vue.ts'), sorgente, ts.ScriptTarget.Latest, true, tipoDiScript(ts, nome, vue));
  const righeGrezze = sorgente.split(A_CAPO);
  const somma = (righe) => { let n = 0; for (const r of righe) n += r.length; return n; };
  const base = { righe: contaRighe(testo), caratteri: 0 };
  const diag = sf.parseDiagnostics?.[0];
  if (diag) {
    const riga = sf.getLineAndCharacterOfPosition(diag.start ?? 0).line + 1;
    const letterali = [...sorgente.matchAll(/(['"`])([^'"`\r\n\\]{1,300})\1/gu)].map((m) => ({ testo: m[2], forma: 'altro' }));
    return { ...base, errore: `non si analizza (riga ${riga}): ${ts.flattenDiagnosticMessageText(diag.messageText, ' ')}`, tipi: false, funzioni: [],
      righeN: righeGrezze.map(stretto), letterali, carichi: [], caratteri: somma(righeGrezze.map(stretto)) };
  }
  const haFigli = /child_process|cluster/u.test(sorgente);
  const haModulo = /['"`](?:node:)?module['"`]|getBuiltinModule/u.test(sorgente);
  const FUNZIONI = new Set([K.FunctionDeclaration, K.MethodDeclaration, K.ArrowFunction, K.FunctionExpression, K.Constructor, K.GetAccessor, K.SetAccessor]);
  const nomeProprietà = (n) => (n && (ts.isIdentifier(n) || ts.isPrivateIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) ? n.text : null);
  const nomeLegato = (node, ancheChiamate) => {
    let c = node.parent;
    while (c && ((ancheChiamate && ts.isCallExpression(c)) || ts.isParenthesizedExpression(c) || ts.isAsExpression(c) || ts.isSatisfiesExpression?.(c))) c = c.parent;
    return c && (ts.isVariableDeclaration(c) || ts.isPropertyAssignment(c) || ts.isPropertyDeclaration(c)) ? nomeProprietà(c.name) : null;
  };
  const nomeDi = (node) => {
    if (node.kind === K.Constructor) return 'constructor';
    const n = nomeProprietà(node.name);
    if (n) return node.kind === K.GetAccessor ? `get ${n}` : node.kind === K.SetAccessor ? `set ${n}` : n;
    return nomeLegato(node, true);
  };
  const ultimoNome = (e) => (ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null);
  /* `createRequire` anche sotto un altro nome (`import { createRequire as cr }`, `const { createRequire: cr } = …`) */
  const creatori = new Set(['createRequire']);
  const èCreateRequire = (e) => (ts.isCallExpression(e) && creatori.has(ultimoNome(e.expression) ?? ''));
  /* i nomi legati a `createRequire(…)`: chiamarli è un `require` */
  const richiedenti = new Set();
  if (sorgente.includes('createRequire')) {
    const alias = (node) => {
      if ((ts.isImportSpecifier(node) || ts.isBindingElement(node)) && node.propertyName && nomeProprietà(node.propertyName) === 'createRequire' && ts.isIdentifier(node.name)) creatori.add(node.name.text);
      ts.forEachChild(node, alias);
    };
    alias(sf);
    const cerca = (node) => {
      if (ts.isVariableDeclaration(node) && node.initializer && èCreateRequire(node.initializer) && ts.isIdentifier(node.name)) richiedenti.add(node.name.text);
      else if (ts.isBinaryExpression(node) && node.operatorToken.kind === K.EqualsToken && èCreateRequire(node.right) && ts.isIdentifier(node.left)) richiedenti.add(node.left.text);
      ts.forEachChild(node, cerca);
    };
    cerca(sf);
  }
  const protetti = [];
  const letterali = [];
  const carichi = [];
  const carico = (tipo, node) => carichi.push({ tipo, impronta: `${tipo}:${stretto(node.getText(sf)).slice(0, 240)}`, riga: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
  const visti = new Map();
  const unico = (q) => { const n = (visti.get(q) ?? 0) + 1; visti.set(q, n); return n === 1 ? q : `${q}#${n}`; };
  const funzioni = [];
  const padrone = new Map(); // riga -> funzione più interna che la copre
  /** La forma di carico aperta da una chiamata, per le stringhe scritte nei suoi argomenti; '' se non carica niente. */
  const formaDellaChiamata = (node) => {
    const e = node.expression;
    const nomeU = ultimoNome(e);
    const nuova = node.kind === K.NewExpression;
    const primo = node.arguments?.[0];
    const scritto = primo && (ts.isStringLiteral(primo) || ts.isNoSubstitutionTemplateLiteral(primo));
    if (e.kind === K.ImportKeyword) { if (!scritto) carico('import-calcolato', node); return 'import()'; }
    if (nomeU === 'importScripts') { carico('importScripts', node); return 'import()'; }
    if ((nomeU === 'resolve' && ts.isPropertyAccessExpression(e) && /^(?:require|import\.meta)$/u.test(e.expression.getText(sf)))) { if (!scritto) carico('resolve-calcolato', node); return 'require'; }
    if (nomeU === 'require' || èCreateRequire(e) || (ts.isIdentifier(e) && richiedenti.has(e.text))) { if (!scritto) carico('require-calcolato', node); return 'require'; }
    if (creatori.has(nomeU ?? '')) { carico('createRequire', node); return ''; }
    if (nomeU === 'getBuiltinModule') { carico('getBuiltinModule', node); return 'require'; }
    if ((nomeU === 'register' || nomeU === 'registerHooks') && haModulo) { carico('register', node); return 'register'; }
    if (nuova && (nomeU === 'Worker' || nomeU === 'SharedWorker')) { carico('Worker', node); return 'Worker'; }
    if (nomeU === 'fork' && haFigli) return 'fork';
    if (haFigli && primo && /process\.execPath|process\.argv\[0\]|^['"`]node(?:\.exe)?(?:['"`]|\s)/u.test(primo.getText(sf))) { carico('spawn-node', node); return ''; }
    if (nomeU === 'constructor' && ts.isPropertyAccessExpression(e)) { carico('constructor()', node); return ''; }
    if ((nomeU === 'setTimeout' || nomeU === 'setInterval') && scritto) { carico('timer-stringa', node); return ''; }
    if (nomeU === 'createElement' && scritto && primo.text.toLowerCase() === 'script') { carico('script-tag', node); return ''; }
    return '';
  };
  const identificatore = (node) => {
    const p = node.parent;
    const nome = node.text;
    if (nome === 'eval') { carico('eval', p ?? node); return; }
    if (nome === 'WebAssembly') { carico('wasm', p ?? node); return; }
    /* `fork` sotto qualunque forma (importato con un altro nome, chiamato, passato): ogni riferimento conta */
    if (nome === 'fork' && haFigli) { carico('fork', p ?? node); return; }
    if (ts.isPropertyAccessExpression(p) && p.name === node) {
      if (NOMI_INTERNI.has(nome) || (nome === 'binding' && p.expression.getText(sf) === 'process')) carico('interno', p);
      return;
    }
    if (nome === 'Function') {
      if (ts.isPropertyAccessExpression(p) || ts.isTypeReferenceNode(p) || ts.isExpressionWithTypeArguments?.(p) || ts.isQualifiedName(p)) return;
      carico('Function', p ?? node);
      return;
    }
    if (nome === 'require') {
      if ((ts.isCallExpression(p) && p.expression === node) || ts.isTypeOfExpression(p)) return;
      if (ts.isPropertyAccessExpression(p) && p.expression === node && (p.name.text === 'resolve' || p.name.text === 'main')) return;
      if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isPropertyAssignment(p) || ts.isImportSpecifier(p)) && p.name === node) return;
      carico('require-riferimento', p ?? node);
    }
  };
  const cammina = (node, pila, forma) => {
    let dopo = pila;
    let formaSotto = forma;
    const k = node.kind;
    if (k === K.StringLiteral || k === K.NoSubstitutionTemplateLiteral) {
      protetti.push([node.getStart(sf), node.getEnd()]);
      const p = node.parent;
      let f = forma || 'altro';
      if ((ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) && p.moduleSpecifier === node) f = (p.importClause?.isTypeOnly || p.isTypeOnly) ? 'tipo' : 'import';
      else if (ts.isExternalModuleReference(p)) f = 'require';
      else if (ts.isLiteralTypeNode(p)) f = 'tipo';
      else if (ts.isElementAccessExpression(p) && p.argumentExpression === node && NOMI_PER_NOME.has(node.text)) carico('accesso-per-nome', p);
      if (f !== 'tipo') letterali.push({ testo: node.text, forma: f });
      return;
    }
    if (k === K.TemplateHead || k === K.TemplateMiddle || k === K.TemplateTail || k === K.RegularExpressionLiteral || k === K.JsxText) { protetti.push([node.getStart(sf), node.getEnd()]); return; }
    if (k === K.Identifier) { identificatore(node); return; }
    if (k === K.CallExpression || k === K.NewExpression) {
      const f = formaDellaChiamata(node);
      /* la funzione chiamata non è un argomento: si visita con la forma di fuori */
      cammina(node.expression, pila, forma);
      for (const a of node.typeArguments ?? []) cammina(a, pila, forma);
      /* solo la stringa scritta come argomento è lo specificatore; ciò che sta più dentro (`new URL('./x', …)`, `join(a, 'src')`) è un pezzo di percorso */
      for (const a of node.arguments ?? []) cammina(a, pila, !f ? forma : (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? f : `${f}-dentro`);
      return;
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) dopo = [...pila, nomeProprietà(node.name) ?? '<classe>'];
    else if (ts.isObjectLiteralExpression(node)) { const n = nomeLegato(node, false); if (n) dopo = [...pila, n]; }
    else if (FUNZIONI.has(k) && node.body) {
      const q = unico([...pila, nomeDi(node) ?? '<anonima>'].join('.'));
      const inizio = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const fine = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      const f = { q, riga: inizio, righe: 0, caratteri: 0, proprie: [] };
      for (let r = inizio; r <= fine; r += 1) padrone.set(r, f);
      funzioni.push(f);
      dopo = [...pila, q.split('.').pop()];
      formaSotto = '';
    }
    ts.forEachChild(node, (figlio) => cammina(figlio, dopo, formaSotto));
  };
  cammina(sf, [], '');
  const righeN = senzaCommenti(sorgente, protetti).split(A_CAPO).map(stretto);
  for (const [r, f] of padrone) { f.righe += 1; f.caratteri += righeN[r - 1]?.length ?? 0; f.proprie.push(r); }
  for (const f of funzioni) {
    f.proprie.sort((a, b) => a - b);
    const corpo = f.proprie.map((r) => righeN[r - 1] ?? '').join('');
    f.alfanumerici = alfanumerici(corpo);
    /* l'impronta non porta il nome della funzione: rinominata sul posto con lo stesso corpo, resta lei */
    const suo = f.q.split('.').pop().replace(/#[0-9]+$/u, '').replace(/^(?:get|set) /u, '');
    f.impronta = impronta(suo && suo !== '<anonima>' ? corpo.split(suo).join(String.fromCharCode(0)) : corpo);
  }
  /* un modulo sensibile importato è una forma di carico: chi lo usa sotto un altro nome non scappa */
  const sensibili = new Set();
  for (const l of letterali) {
    if (l.forma !== 'import' && l.forma !== 'require' && l.forma !== 'import()') continue;
    const nomeM = l.testo.replace(/^node:/u, '');
    if (R.MODULI_SENSIBILI.includes(nomeM) && !sensibili.has(nomeM)) { sensibili.add(nomeM); carichi.push({ tipo: 'modulo', impronta: `modulo:${nomeM}`, riga: 0 }); }
  }
  const direttiva = sf.checkJsDirective?.enabled;
  const èTs = vue ? vue.ts : /\.(?:[mc]?ts|tsx)$/u.test(nome);
  return { ...base, caratteri: somma(righeN), tipi: èTs ? direttiva !== false : direttiva === true, funzioni, righeN, letterali, carichi };
}

/** Il corpo (righe normalizzate proprie, senza le vuote) di una funzione misurata da `analizza`. */
export const corpoDi = (misura, f) => f.proprie.map((r) => misura.righeN[r - 1] ?? '').filter(Boolean);

/** Il «peso di codice» di un file non contato raggiunto da un arco: istruzioni, funzioni e chiamate. Un dizionario di testi che cresce non pesa di più. */
export function pesoDiCodice(ts, testo, nome) {
  if (!/\.(?:[mc]?[jt]s|[jt]sx)$/u.test(nome)) return { peso: testo.length, come: 'caratteri' };
  const sf = ts.createSourceFile(nome, testo, ts.ScriptTarget.Latest, false, tipoDiScript(ts, nome, null));
  if (sf.parseDiagnostics?.length) return { peso: testo.length, come: 'caratteri' };
  let peso = 0;
  const K = ts.SyntaxKind;
  const visita = (node) => {
    const k = node.kind;
    if ((k >= K.FirstStatement && k <= K.LastStatement) || k === K.CallExpression || k === K.NewExpression || k === K.ArrowFunction || k === K.FunctionExpression
      || k === K.FunctionDeclaration || k === K.MethodDeclaration || k === K.ClassDeclaration || k === K.ClassExpression) peso += 1;
    ts.forEachChild(node, visita);
  };
  visita(sf);
  return { peso, come: 'istruzioni' };
}
