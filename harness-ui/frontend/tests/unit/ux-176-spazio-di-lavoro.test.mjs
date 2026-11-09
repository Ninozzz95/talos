import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AREE } from '../../src/i18n/testi/index.js';
import EN from '../../src/i18n/en.js';
import { frasiItalianeNelSorgente, testiFissiNelSorgente } from '../../scripts/cancello/testi-a-schermo.mjs';

/*
 * Decisione 176 dell'owner (04/11/2026, reperto N8 della revisione UX 1-27): «workspace» nell'interfaccia italiana diventa
 * «spazio di lavoro» ovunque (l'inglese resta «workspace»); la sezione delle Impostazioni si chiama per ciò che contiene,
 * «Diagnosi e configurazione» / «Diagnostics and configuration»; la frase morta di `en.js` se ne va.
 * Scritta rossa sulla candidata c45b49fbb, prima della cura.
 */
const leggi = (percorso) => readFileSync(new URL(percorso, import.meta.url), 'utf8');

/* L'unica eccezione: un indirizzo di OpenRouter, che la persona copia così com'è. */

/*
 * Revisione API delle cure della gemella (05/11/2026 sera): il lettore taglia il testo riportato a 160 caratteri, e il filtro qui
 * sotto lo leggeva tagliato. Un «workspace» o un «worktree» oltre il 160° carattere di un template lungo di legacy/app.js (il foglio
 * Ambiente ne è uno) passava. Si chiede il testo intero.
 */
const INTERO = { lunghezza: Infinity };
const INDIRIZZI = /openrouter\.ai\/workspaces\//u;

/*
 * Revisione del blocco interfaccia (05/11/2026, difetto basso di 632c29466, mutante sopravvissuto (a)): la prova leggeva
 * solo il dizionario. Un «workspace» scritto a mano in un testo italiano fisso di legacy/app.js, o nel testo di riserva del
 * modello (index.template.html, legacy/frammenti.html), passava. Ora si leggono anche quelli: le frasi italiane del sorgente
 * con lo stesso lettore del cancello della lingua (letterali dell'albero sintattico, fuori da t(), commenti esclusi), i testi
 * fissi messi a schermo, e nell'HTML i nodi di testo e gli attributi letti dalla persona, commenti e script esclusi.
 * Come la regola no-literal-string di eslint-plugin-i18next (modo «all»: testi e attributi, letta il 05/11/2026), ma
 * ristretta alla sola parola della decisione.
 */
const senzaCommentiNeScript = (html) => html.replace(/<!--[\s\S]*?-->/gu, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/giu, '');
function workspaceNelModello(html) {
  const pulito = senzaCommentiNeScript(html);
  return [
    ...[...pulito.matchAll(/>([^<>]*workspace[^<>]*)</giu)].map((m) => m[1].trim()).filter(Boolean),
    ...[...pulito.matchAll(/\s(aria-label|title|placeholder|alt)="([^"]*workspace[^"]*)"/giu)].map((m) => `${m[1]}="${m[2]}"`),
  ];
}

test('UX176-1 — nessun testo italiano dice «workspace», salvo un indirizzo da copiare: dizionario, legacy/app.js e testo di riserva', () => {
  const trovati = [];
  for (const [area, testi] of Object.entries(AREE)) {
    for (const [k, v] of Object.entries(testi.it ?? {})) {
      if (/workspace/iu.test(String(v)) && !INDIRIZZI.test(String(v))) trovati.push(`${area}.${k}: ${v}`);
    }
  }
  assert.deepEqual(trovati, []);

  const app = leggi('../../src/legacy/app.js');
  const nelCodice = [...frasiItalianeNelSorgente(app, 'legacy/app.js', INTERO), ...testiFissiNelSorgente(app, 'legacy/app.js', INTERO)]
    .filter(({ testo }) => /workspace/iu.test(testo) && !INDIRIZZI.test(testo))
    .map(({ riga, testo }) => `legacy/app.js:${riga}: ${testo}`);
  assert.deepEqual(nelCodice, [], 'testi italiani fissi di legacy/app.js');

  for (const file of ['../../index.template.html', '../../src/legacy/frammenti.html']) {
    assert.deepEqual(workspaceNelModello(leggi(file)), [], `testo di riserva di ${file}`);
  }
});

test('UX176-1 AL CONTRARIO — il lettore trova un «workspace» in una frase fissa del codice e nel testo di riserva', () => {
  const codice = "el.textContent = 'Nessun file nel workspace';\nconst k = t('app.workspace.title'); // il workspace\n";
  assert.equal(frasiItalianeNelSorgente(codice, 'x.js').filter(({ testo }) => /workspace/iu.test(testo)).length, 1);
  assert.deepEqual(workspaceNelModello('<p>Workspace attivo</p><!-- il workspace --><button aria-label="Comandi del workspace">x</button>'),
    ['Workspace attivo', 'aria-label="Comandi del workspace"']);
});

test('UX176-2 — le parole nuove, e l\'inglese resta «workspace»', () => {
  const { app, modello, impostazioni, comandi } = AREE;
  assert.equal(impostazioni.it['sections.workspace.title'], 'File e spazio di lavoro');
  assert.equal(impostazioni.en['sections.workspace.title'], 'Files and workspace');
  assert.equal(modello.it['settings.filesAndWorkspace'], 'File e spazio di lavoro');
  assert.equal(app.it['workspace.accessLabel'], 'Accesso allo spazio di lavoro', 'la stessa parola della cura 35 (ramo 28-42)');
  assert.equal(app.it['files.refreshedBody'], 'Lo spazio di lavoro è stato riletto.', 'l\'articolo segue la parola nuova');
  assert.equal(comandi.it['projects.description'], 'Trova gli spazi di lavoro e le sessioni collegate.', 'il plurale');
  for (const [area, testi] of Object.entries(AREE)) {
    const inglesi = Object.values(testi.en ?? {}).filter((v) => /spazio di lavoro/iu.test(String(v)));
    assert.deepEqual(inglesi, [], `${area}: nessun italiano finito nell'inglese`);
  }
});

test('UX176-3 — la sezione si chiama «Diagnosi e configurazione», in ogni chiave e nel testo di riserva', () => {
  const { impostazioni, modello } = AREE;
  assert.equal(impostazioni.it['sections.account.title'], 'Diagnosi e configurazione');
  assert.equal(impostazioni.en['sections.account.title'], 'Diagnostics and configuration');
  for (const k of ['settings.accountDoctorAndBackup', 'frammenti.impostazioni.accountDoctorAndBackup', 'frammenti.guscio.accountDoctorAndBackup']) {
    assert.equal(modello.it[k], 'Diagnosi e configurazione', k);
    assert.equal(modello.en[k], 'Diagnostics and configuration', k);
  }
  const html = leggi('../../index.template.html') + leggi('../../src/legacy/frammenti.html');
  assert.doesNotMatch(html, />(Agente e diagnostica|Account, Doctor e backup)</u);
  assert.match(html, />Diagnosi e configurazione</u);
});

test('UX176-4 — il testo di riserva della pagina dice le stesse parole del dizionario', () => {
  const html = leggi('../../index.template.html');
  const visibili = [...html.matchAll(/>([^<>]*workspace[^<>]*)</giu)].map((m) => m[1]);
  assert.deepEqual(visibili, [], 'nessun «workspace» a schermo prima che il dizionario arrivi');
  assert.match(html, /aria-label="Home dello spazio di lavoro"/u);
});

test('UX176-5 — la frase morta di en.js non c\'è più (N8a), e le chiavi italiane seguono le parole nuove', () => {
  const frasi = Object.values(EN).flatMap((categoria) => (categoria && typeof categoria === 'object' ? Object.keys(categoria) : []));
  assert.ok(!frasi.includes('Account, Doctor e backup'), 'nessuno la chiede: il titolo usa la chiave');
  assert.deepEqual(frasi.filter((f) => /\b(il|del|nel|i) workspace\b|^File e workspace$/u.test(f)), []);
});

/*
 * Revisione del blocco interfaccia (05/11/2026 sera, difetto basso del pezzo 1): il valore inglese di «Diagnosi e configurazione»
 * in en.js non aveva prova (mutante M24 sopravvissuto), e due testi italiani mescolavano ancora l'inglese: «Spazio di lavoro e
 * worktree» e «…dal Context rail…». Prima l'inglese (resta com'è, e si fissa), poi l'italiano piano. «Albero di lavoro» è la
 * parola della traduzione italiana di git per «worktree»; la colonna a destra si dice per ciò che è.
 */
test('UX176-6 — en.js traduce «Diagnosi e configurazione»; il foglio Ambiente e la frase della sezione File sono in italiano piano', () => {
  const voci = Object.values(EN).filter((c) => c && typeof c === 'object' && Object.hasOwn(c, 'Diagnosi e configurazione'));
  assert.equal(voci.length, 1, 'una sola categoria la traduce');
  assert.equal(voci[0]['Diagnosi e configurazione'], 'Diagnostics and configuration');

  const { app, modello } = AREE;
  assert.equal(app.en['sheets.environment.title'], 'Workspace and worktree');
  assert.equal(modello.en['frammenti.impostazioni.theActiveWorkspaceAnd'],
    'The active workspace and the file tree are managed from the Context rail, with real operations and explicit permissions.');
  assert.equal(app.it['sheets.environment.title'], 'Spazio di lavoro e alberi di lavoro');
  const frase = 'Lo spazio di lavoro attivo e l’albero dei file si gestiscono dalla colonna del contesto, con operazioni reali e permessi espliciti.';
  assert.equal(modello.it['frammenti.impostazioni.theActiveWorkspaceAnd'], frase);
  assert.ok(leggi('../../src/legacy/frammenti.html').includes(`>${frase}<`), 'il testo di riserva dice la stessa frase');
  for (const v of [app.it['sheets.environment.title'], modello.it['frammenti.impostazioni.theActiveWorkspaceAnd']]) {
    assert.doesNotMatch(v, /worktree|Context rail/iu, v);
  }
});

/*
 * Revisione API delle cure della gemella (05/11/2026 sera, difetto basso): il titolo del foglio Ambiente era già «Spazio di
 * lavoro e alberi di lavoro», ma la sua regola diceva ancora «Crea worktree per task» e le quattro etichette (Ispettore, scheda
 * Git, foglio Ambiente, frammento dell'Ispettore) dicevano «Worktree». Prima l'inglese, che è già coerente col suo titolo e si
 * fissa; poi l'italiano con la parola del titolo. «Non osservato» al maschile perché accanto c'è «Albero di lavoro». Le chiavi
 * non cambiano, e niente di ciò che riceve il modello.
 */
function worktreeNelModello(html) {
  const pulito = senzaCommentiNeScript(html);
  return [
    ...[...pulito.matchAll(/>([^<>]*worktree[^<>]*)</giu)].map((m) => m[1].trim()).filter(Boolean),
    ...[...pulito.matchAll(/\s(aria-label|title|placeholder|alt)="([^"]*worktree[^"]*)"/giu)].map((m) => `${m[1]}="${m[2]}"`),
  ];
}

test('UX176-7 — nessun testo italiano dice «worktree»: la regola e le etichette parlano come il titolo «Spazio di lavoro e alberi di lavoro»', () => {
  const { app, modello, processi } = AREE;
  assert.equal(app.en['sheets.environment.ruleWorktree'], 'Create a worktree per task');
  for (const [area, k] of [[modello, 'frammenti.inspector.worktree'], [modello, 'inspector.worktree'], [modello, 'environment.worktree'], [processi, 'inspector.envWorktree']]) {
    assert.equal(area.en[k], 'Worktree', k);
    assert.equal(area.it[k], 'Albero di lavoro', k);
  }
  assert.equal(app.it['sheets.environment.ruleWorktree'], 'Crea un albero di lavoro per ogni attività');
  assert.equal(modello.it['environment.notObserved'], 'Non osservato');

  const trovati = [];
  for (const [area, testi] of Object.entries(AREE)) {
    for (const [k, v] of Object.entries(testi.it ?? {})) if (/worktree/iu.test(String(v))) trovati.push(`${area}.${k}: ${v}`);
  }
  assert.deepEqual(trovati, []);
  const sorgente = leggi('../../src/legacy/app.js');
  const nelCodice = [...frasiItalianeNelSorgente(sorgente, 'legacy/app.js', INTERO), ...testiFissiNelSorgente(sorgente, 'legacy/app.js', INTERO)]
    .filter(({ testo }) => /worktree/iu.test(testo)).map(({ riga, testo }) => `legacy/app.js:${riga}: ${testo}`);
  assert.deepEqual(nelCodice, [], 'testi italiani fissi di legacy/app.js');
  for (const file of ['../../index.template.html', '../../src/legacy/frammenti.html']) {
    assert.deepEqual(worktreeNelModello(leggi(file)), [], `testo di riserva di ${file}`);
  }
  const html = leggi('../../index.template.html');
  assert.match(html, /data-t="modello\.environment\.notObserved" id="ambienteWorktree" class="talos-kv__v">Non osservato</u);
});

test('UX176-7 AL CONTRARIO — i lettori trovano un «worktree» oltre il 160° carattere di un template, in un nodo e in un attributo', () => {
  const lungo = `const h = \`<div class="${'sezione-'.repeat(25)}">\${x}<span>Crea worktree per ogni attività</span></div>\`;`;
  assert.deepEqual(frasiItalianeNelSorgente(lungo, 'x.js').filter(({ testo }) => /worktree/iu.test(testo)), [], 'tagliato a 160 non si vede');
  assert.equal(frasiItalianeNelSorgente(lungo, 'x.js', INTERO).filter(({ testo }) => /worktree/iu.test(testo)).length, 1, 'intero si vede');
  const fisso = `el.textContent = 'Questa sessione ${'lavora su un ramo, '.repeat(10)}ed è il worktree della attività';`;
  assert.deepEqual(testiFissiNelSorgente(fisso, 'x.js').filter(({ testo }) => /worktree/iu.test(testo)), [], 'testo fisso tagliato a 160');
  assert.equal(testiFissiNelSorgente(fisso, 'x.js', INTERO).filter(({ testo }) => /worktree/iu.test(testo)).length, 1, 'testo fisso intero');
  assert.deepEqual(worktreeNelModello('<span>Worktree</span><!-- worktree --><i title="Il worktree">x</i>'), ['Worktree', 'title="Il worktree"']);
});
