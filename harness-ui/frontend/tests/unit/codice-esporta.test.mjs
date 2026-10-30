import test from 'node:test';
import assert from 'node:assert/strict';
import { estensioneDi, nomeDalRecinto, sanificaNomeFile, comeMarkdown, fileDelCodice, marcaTemporale, infoDelFile } from '../../src/components/codice-esporta.js';

/*
 * 23/10/2026 sera (owner, bozzetto approvato): il «⋯» del blocco di codice esporta il codice come file — del linguaggio, Markdown o
 * testo — col nome che il modello scrive nella riga d'apertura, altrimenti `talos-<lingua>-<AAAAMMGG-HHMM>`. Ricerca del 23/10:
 * LibreChat `downloadFile.ts:81-85` (guardia `hasOwnProperty`), Streamdown `download-button.tsx:342-343` (`in`: il difetto da evitare),
 * Streamdown `utils.ts:74-76` (BOM per i CSV).
 */

test('CODICE-ESPORTA-01 — l\'estensione: dalla mappa delle eccezioni, o la lingua stessa se ha la forma di un\'estensione, altrimenti txt', () => {
  assert.equal(estensioneDi('python'), 'py');
  assert.equal(estensioneDi('JavaScript'), 'js');
  assert.equal(estensioneDi('c++'), 'cpp');
  assert.equal(estensioneDi('bash'), 'sh');
  assert.equal(estensioneDi('toml'), 'toml', 'una lingua che è già un\'estensione passa com\'è (LibreChat)');
  assert.equal(estensioneDi('py'), 'py');
  assert.equal(estensioneDi(''), 'txt');
  assert.equal(estensioneDi('objective-c'), 'txt', 'una forma che non è un\'estensione: txt');
  /* AL CONTRARIO del difetto di Streamdown (`in`): una lingua che è il nome di una proprietà del prototipo non pesca una funzione */
  for (const l of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.doesNotMatch(estensioneDi(l), /function|\{|\s/u, `«${l}»: niente codice di una funzione nel nome`);
  }
});

test('CODICE-ESPORTA-02 — il nome che il modello scrive nella riga d\'apertura, solo il nome base; AL CONTRARIO una lingua sola o una versione non sono un file', () => {
  assert.equal(nomeDalRecinto('python sync.py'), 'sync.py');
  assert.equal(nomeDalRecinto('python title="sync.py"'), 'sync.py');
  assert.equal(nomeDalRecinto('ts src/app.ts'), 'app.ts', 'le cartelle no: il nome base');
  assert.equal(nomeDalRecinto('rust {filename="a\\b\\main.rs"}'), 'main.rs');
  assert.equal(nomeDalRecinto('sync.py'), 'sync.py', 'senza lingua, il primo pezzo stesso');
  assert.equal(nomeDalRecinto('js CON.js'), '_CON.js', 'un nome riservato di Windows prende un trattino basso');
  assert.equal(nomeDalRecinto('python'), null);
  assert.equal(nomeDalRecinto('python3.11'), null, 'una versione non è un file');
  assert.equal(nomeDalRecinto('bash --verbose'), null);
  assert.equal(nomeDalRecinto(''), null);
});

test('CODICE-ESPORTA-03 — il nome si sanifica per Windows: caratteri vietati, punti e spazi finali, nomi riservati, al più 100 caratteri con l\'estensione salva', () => {
  assert.equal(sanificaNomeFile('a<b>:c|d?.txt'), 'abcd.txt');
  assert.equal(sanificaNomeFile('nul.txt'), '_nul.txt');
  assert.equal(sanificaNomeFile('com1'), '_com1');
  assert.equal(sanificaNomeFile('fine. . '), 'fine');
  assert.equal(sanificaNomeFile('...'), null);
  assert.equal(sanificaNomeFile('\u0001\u0002'), null);
  const lungo = sanificaNomeFile(`${'x'.repeat(200)}.py`);
  assert.equal(lungo.length, 100);
  assert.ok(lungo.endsWith('.py'));
});

test('CODICE-ESPORTA-04 — il Markdown: il recinto è sempre più lungo della fila di apici più lunga dentro il codice, così un README col suo recinto non rompe il file', () => {
  assert.equal(comeMarkdown('print(1)', 'python'), '```python\nprint(1)\n```\n');
  assert.equal(comeMarkdown('a\n', 'js'), '```js\na\n```\n', 'niente riga vuota in più se il codice finisce già a capo');
  const readme = 'Esempio:\n```bash\nnpm test\n```\n';
  const md = comeMarkdown(readme, 'markdown');
  assert.ok(md.startsWith('````markdown\n') && md.endsWith('\n````\n'), md);
  assert.ok(comeMarkdown('x ````` y', '').startsWith('``````\n'));
});

test('CODICE-ESPORTA-05 — i tre formati: il nome del modello o talos-<lingua>-<data>, il testo GREZZO, il tipo giusto; un CSV col BOM', () => {
  const ora = new Date(2026, 9, 23, 22, 14);
  assert.equal(marcaTemporale(ora), '20261023-2214');
  const codice = 'def f():\n    return 1\n';
  assert.deepEqual(fileDelCodice('sorgente', { testo: codice, linguaggio: 'python', info: 'python sync.py', ora }), { nome: 'sync.py', testo: codice, mime: 'text/plain;charset=utf-8' });
  assert.equal(fileDelCodice('sorgente', { testo: codice, linguaggio: 'python', info: 'python', ora }).nome, 'talos-python-20261023-2214.py');
  assert.equal(fileDelCodice('sorgente', { testo: 'x', linguaggio: '', info: '', ora }).nome, 'talos-code-20261023-2214.txt');
  const md = fileDelCodice('md', { testo: codice, linguaggio: 'python', info: 'python sync.py', ora });
  assert.equal(md.nome, 'sync.md');
  assert.equal(md.testo, `\`\`\`python\n${codice}\`\`\`\n`);
  assert.equal(md.mime, 'text/markdown;charset=utf-8');
  assert.deepEqual(fileDelCodice('txt', { testo: codice, linguaggio: 'python', info: '', ora }), { nome: 'talos-python-20261023-2214.txt', testo: codice, mime: 'text/plain;charset=utf-8' });
  const csv = fileDelCodice('sorgente', { testo: 'a,b\n1,2', linguaggio: 'csv', info: '', ora });
  assert.equal(csv.testo.charCodeAt(0), 0xfeff, 'il BOM davanti a un CSV (Excel su Windows)');
  assert.equal(csv.mime, 'text/csv;charset=utf-8');
  /* AL CONTRARIO: un file che non è CSV non prende il BOM */
  assert.notEqual(fileDelCodice('sorgente', { testo: 'a,b', linguaggio: 'python', info: '', ora }).testo.charCodeAt(0), 0xfeff);
});

test('CODICE-ESPORTA-06 — revisione F5: un\'estensione che Windows esegue passa solo se è quella della lingua; i caratteri di formato (bidi, larghezza zero) se ne vanno', () => {
  const ora = new Date(2026, 9, 23, 22, 14);
  for (const formato of ['sorgente', 'md', 'txt']) {
    const f = fileDelCodice(formato, { testo: 'x', linguaggio: 'text', info: 'text invoice.pdf.exe', ora });
    assert.match(f.nome, /^talos-text-20261023-2214\.(txt|md)$/u, `${formato}: ${f.nome}`);
  }
  assert.equal(fileDelCodice('sorgente', { testo: 'x', linguaggio: 'sh', info: 'sh example.com', ora }).nome, 'talos-sh-20261023-2214.sh', '.com è un eseguibile');
  assert.equal(fileDelCodice('sorgente', { testo: 'x', linguaggio: 'text', info: 'text app.js', ora }).nome, 'talos-text-20261023-2214.txt', 'un .js sotto «text»');
  /* AL CONTRARIO: l'estensione della lingua dichiarata resta */
  assert.equal(fileDelCodice('sorgente', { testo: 'x', linguaggio: 'bat', info: 'bat run.bat', ora }).nome, 'run.bat');
  assert.equal(fileDelCodice('sorgente', { testo: 'x', linguaggio: 'powershell', info: 'powershell setup.ps1', ora }).nome, 'setup.ps1');
  assert.equal(fileDelCodice('sorgente', { testo: 'x', linguaggio: 'javascript', info: 'javascript app.js', ora }).nome, 'app.js');
  assert.equal(sanificaNomeFile('photo\u202egpj.txt'), 'photogpj.txt', 'U+202E via');
  assert.equal(sanificaNomeFile('a\u200bb.py'), 'ab.py', 'lo spazio a larghezza zero via');
});

test('CODICE-ESPORTA-07 — revisione F13: il taglio non spezza un\'emoji; COM0 e lpt¹ riservati; title fra virgolette con lo spazio; python3.11; il BOM dal file finale; un apice inverso nella lingua', () => {
  const ora = new Date(2026, 9, 23, 22, 14);
  const lungo = sanificaNomeFile(`${'😀'.repeat(120)}.py`);
  assert.equal(/[\ud800-\udbff](?![\udc00-\udfff])/u.test(lungo) || /(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(lungo), false, 'nessuna metà di coppia');
  assert.equal(Array.from(lungo).length, 100);
  assert.ok(lungo.endsWith('.py'));
  assert.equal(sanificaNomeFile('COM0.txt'), '_COM0.txt');
  assert.equal(sanificaNomeFile('lpt¹'), '_lpt¹');
  assert.equal(nomeDalRecinto('js title="My File.js"'), 'My File.js');
  assert.equal(nomeDalRecinto("js title='Due parole.ts'"), 'Due parole.ts');
  assert.equal(estensioneDi('python3.11'), 'py');
  assert.equal(estensioneDi('node20'), 'js');
  const csv = fileDelCodice('sorgente', { testo: 'a,b', linguaggio: 'text', info: 'text data.csv', ora });
  assert.equal(csv.nome, 'data.csv');
  assert.equal(csv.testo.charCodeAt(0), 0xfeff, 'un file .csv prende il BOM anche sotto «text»');
  assert.equal(csv.mime, 'text/csv;charset=utf-8');
  assert.ok(comeMarkdown('x', 'js`x').startsWith('```jsx\n'), 'l\'apice inverso nella lingua se ne va');
});

test('CODICE-ESPORTA-08 — revisione F11: il lettore dà il nome VERO del file, anche con gli spazi, e passa dalle stesse difese; AL CONTRARIO un nome che non si può citare non dà niente', () => {
  const ora = new Date(2026, 9, 23, 22, 14);
  assert.equal(infoDelFile('Note di viaggio.md', 'markdown'), 'markdown title="Note di viaggio.md"');
  assert.equal(fileDelCodice('sorgente', { testo: '# x', linguaggio: 'markdown', info: infoDelFile('Note di viaggio.md', 'markdown'), ora }).nome, 'Note di viaggio.md');
  assert.equal(fileDelCodice('sorgente', { testo: 'x', linguaggio: 'javascript', info: infoDelFile('server.mjs', 'javascript'), ora }).nome, 'server.mjs');
  assert.equal(infoDelFile('a"b.js', 'js'), '');
  assert.equal(infoDelFile('', 'js'), '');
  /* il nome vero di un eseguibile mostrato come testo resta comunque fuori */
  assert.equal(fileDelCodice('sorgente', { testo: 'x', linguaggio: 'text', info: infoDelFile('setup.exe', 'text'), ora }).nome, 'talos-text-20261023-2214.txt');
});

test('CODICE-ESPORTA-09 — una «lingua» puramente binaria (```exe) dà un .txt; AL CONTRARIO gli script tengono la loro estensione', () => {
  const ora = new Date(2026, 9, 23, 22, 14);
  for (const l of ['exe', 'EXE', 'com', 'scr', 'msi', 'lnk', 'dll', 'jar']) assert.equal(estensioneDi(l), 'txt', l);
  assert.equal(fileDelCodice('sorgente', { testo: 'MZ', linguaggio: 'exe', info: 'exe', ora }).nome, 'talos-exe-20261023-2214.txt');
  for (const [l, e] of [['bat', 'bat'], ['powershell', 'ps1'], ['javascript', 'js'], ['cmd', 'cmd']]) assert.equal(estensioneDi(l), e, l);
  assert.equal(fileDelCodice('sorgente', { testo: 'x', linguaggio: 'text', info: 'text console.msc', ora }).nome, 'talos-text-20261023-2214.txt', '.msc è un eseguibile');
});

test('CODICE-ESPORTA-10 — riverifica R3-R5: url/scf/inf/hta/application come «lingua» danno .txt; html5, css3, php8, c99, es6 perdono la versione; CONIN$ e CONOUT$ sono riservati', () => {
  for (const l of ['url', 'scf', 'inf', 'hta', 'application']) assert.equal(estensioneDi(l), 'txt', l);
  assert.deepEqual(['html5', 'css3', 'php8', 'c99', 'es6', 'perl5'].map(estensioneDi), ['html', 'css', 'php', 'c', 'js', 'pl']);
  assert.equal(sanificaNomeFile('CONIN$.txt'), '_CONIN$.txt');
  assert.equal(sanificaNomeFile('conout$'), '_conout$');
  /* AL CONTRARIO: un nome che CONTIENE quelle parole non è riservato */
  assert.equal(sanificaNomeFile('console.txt'), 'console.txt');
});
