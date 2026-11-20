/*
 * 0.2.4 S3 — il cancello delle CHIAVI DOPPIE nei sorgenti di `harness-ui/src`.
 *
 * Perché esiste: in `session-registry.mjs` l'oggetto passato a `portePerLAssistente({...})` aveva la chiave `ricercaWebFn` due volte
 * (commit b604bbff6e dell'11/11 e f5a59b6a2e del 12/11). In un oggetto letterale vince l'ULTIMA, in silenzio: l'unico segno era un avviso
 * «Duplicate key» della build, che nessuno legge. Il progetto non aveva un controllo (niente lint nel giro, nessun cancello a elenco).
 *
 * Come: ogni `.mjs`/`.js` sotto `src/` si legge col parser di TypeScript (già fra le dipendenze di sviluppo), e per ogni oggetto
 * letterale si confrontano i nomi delle proprietà scritte per nome (identificatore, stringa, numero, `['stringa']`). Una coppia
 * get/set dello stesso nome non è un doppione. Una chiave ripetuta anche dopo uno spread (`{ a, ...b, a }`) È un doppione: è proprio la
 * forma del caso S3 (lo spread di `chiediCarta` stava in mezzo). Le chiavi calcolate (`[nome]: …`) non si giudicano.
 *
 * ⛔ Cricchetto nei DUE versi: un doppione NUOVO fa rosso; un doppione elencato qui sotto che non c'è più fa rosso (elenco stantio).
 *   Quelli elencati esistevano già alla base della 0.2.4 (bb6d3799a): stanno «in lista», non si curano in questo giro.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const RADICE = fileURLToPath(new URL('../src/', import.meta.url));

/** I doppioni che c'erano già alla base della 0.2.4, «in lista»: `file|chiave` → quante volte. */
const GIA_NOTI = new Map([
]);

function nomeDellaChiave(nome) {
  if (!nome) return null;
  if (ts.isIdentifier(nome) || ts.isPrivateIdentifier(nome)) return nome.text;
  if (ts.isStringLiteral(nome) || ts.isNoSubstitutionTemplateLiteral(nome)) return nome.text;
  if (ts.isNumericLiteral(nome)) return String(Number(nome.text));
  if (ts.isComputedPropertyName(nome)) {
    const e = nome.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isNumericLiteral(e)) return String(Number(e.text));
  }
  return null;
}

/** I doppioni di un testo sorgente: [{ riga, chiave }] (riga 1-based della SECONDA scrittura). */
export function doppioniNelTesto(testo, nomeFile = 'x.mjs') {
  const sorgente = ts.createSourceFile(nomeFile, testo, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const trovati = [];
  const visita = (nodo) => {
    if (ts.isObjectLiteralExpression(nodo)) {
      const visti = new Map();
      for (const p of nodo.properties) {
        if (ts.isSpreadAssignment(p)) continue;
        const chiave = nomeDellaChiave(p.name);
        if (chiave === null || chiave === '__proto__') continue;
        const tipo = ts.isGetAccessorDeclaration(p) ? 'get' : ts.isSetAccessorDeclaration(p) ? 'set' : 'valore';
        const prima = visti.get(chiave);
        if (prima && !(prima.size === 1 && ((prima.has('get') && tipo === 'set') || (prima.has('set') && tipo === 'get')))) {
          trovati.push({ riga: sorgente.getLineAndCharacterOfPosition(p.getStart(sorgente)).line + 1, chiave });
        }
        visti.set(chiave, new Set([...(prima ?? []), tipo]));
      }
    }
    ts.forEachChild(nodo, visita);
  };
  visita(sorgente);
  return trovati;
}

/** Il cricchetto: `contati` e `giaNoti` sono mappe `file|chiave` → quante volte. */
export function confrontaColCricchetto(contati, giaNoti) {
  return {
    nuovi: [...contati].filter(([k, n]) => (giaNoti.get(k) ?? 0) < n).map(([k]) => k),
    stantii: [...giaNoti].filter(([k, n]) => (contati.get(k) ?? 0) < n).map(([k]) => k),
  };
}

function sorgenti(cartella) {
  const fuori = [];
  for (const nome of readdirSync(cartella)) {
    const pieno = join(cartella, nome);
    if (statSync(pieno).isDirectory()) { if (nome !== 'node_modules') fuori.push(...sorgenti(pieno)); }
    else if (nome.endsWith('.mjs') || nome.endsWith('.js')) fuori.push(pieno);
  }
  return fuori;
}

test('CHIAVI-DOPPIE-01 il lettore trova la forma del caso S3 (dopo uno spread) e non accusa get/set né le chiavi calcolate', () => {
  assert.deepEqual(doppioniNelTesto('f({ a: 1, b, ...(c ? { c } : {}), a: () => 2 });'), [{ riga: 1, chiave: 'a' }]);
  assert.deepEqual(doppioniNelTesto("x = { 'a': 1, a: 2 }; y = { 1: 0, '1': 0 }; z = { ['k']: 1, k() {} };"),
    [{ riga: 1, chiave: 'a' }, { riga: 1, chiave: '1' }, { riga: 1, chiave: 'k' }]);
  assert.deepEqual(doppioniNelTesto('x = { get a() { return 1; }, set a(v) {}, [b]: 1, [b]: 2, ...o, ...o };'), []);
  assert.deepEqual(doppioniNelTesto('x = { get a() { return 1; }, get a() { return 2; } };'), [{ riga: 1, chiave: 'a' }]);
  assert.deepEqual(doppioniNelTesto('x = { a: 1, b: { a: 2 } };'), [], 'oggetti diversi, chiavi indipendenti');
  assert.deepEqual(doppioniNelTesto('x = { o: { a: 1,\n a: 2 } };'), [{ riga: 2, chiave: 'a' }], 'anche dentro un oggetto annidato');
  /* il cricchetto nei due versi */
  const noti = new Map([['a.mjs|k', 1]]);
  assert.deepEqual(confrontaColCricchetto(new Map([['a.mjs|k', 1]]), noti), { nuovi: [], stantii: [] });
  assert.deepEqual(confrontaColCricchetto(new Map([['a.mjs|k', 2], ['b.mjs|z', 1]]), noti), { nuovi: ['a.mjs|k', 'b.mjs|z'], stantii: [] });
  assert.deepEqual(confrontaColCricchetto(new Map(), noti), { nuovi: [], stantii: ['a.mjs|k'] });
});

test('CHIAVI-DOPPIE-02 nessuna chiave doppia nuova in harness-ui/src; quelle già note restano scritte finché non si curano', () => {
  const file = sorgenti(RADICE);
  assert.ok(file.length > 200, `la scansione ha visto solo ${file.length} file: il giro è rotto, non è un esito`);
  const contati = new Map();
  const dove = [];
  for (const pieno of file) {
    const nome = relative(RADICE, pieno).split(sep).join('/');
    for (const { riga, chiave } of doppioniNelTesto(readFileSync(pieno, 'utf8'), nome)) {
      const k = `${nome}|${chiave}`;
      contati.set(k, (contati.get(k) ?? 0) + 1);
      dove.push(`src/${nome}:${riga} «${chiave}»`);
    }
  }
  const { nuovi, stantii } = confrontaColCricchetto(contati, GIA_NOTI);
  assert.deepEqual(nuovi, [], `Chiave doppia in un oggetto letterale: vince l'ultima, in silenzio. Dove: ${dove.join(' · ')}`);
  assert.deepEqual(stantii, [], 'Doppioni curati: togli la loro riga da GIA_NOTI (il cricchetto scende)');
  console.log(`CHIAVI-DOPPIE: ${file.length} file letti · ${dove.length} doppioni (${GIA_NOTI.size} già noti in lista)`);
});
