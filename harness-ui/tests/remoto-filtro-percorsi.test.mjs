import assert from 'node:assert/strict';
import test from 'node:test';

import { senzaPercorsiAssoluti } from '../src/remoto/operazioni.mjs';

/*
 * D-38 (revisione del blocco 14, 31/10/2026): il filtro guardava il carattere PRIMA di `/home/`, e `\w` fra gli esclusi riapriva `/c/Users/...`, la forma di Git Bash. Ora si tiene
 *   solo ciò che sta davvero dentro un indirizzo http(s) o in un percorso RELATIVO (`../home/x`, `a/home/b`: Mobile). I casi degli indirizzi stanno anche in PERCORSI-URL.
 */
const PULITI = [
  /* la tabella del rapporto */
  ['/c/Users/Mario/Desktop/segreto.txt', '/c…/segreto.txt'],
  ['error: /c/Users/Mario/x', 'error: /c…/x'],
  ['/d/home/mario/x', '/d…/x'],
  ['/cygdrive/c/Users/Mario/x', '/cygdrive/c…/x'],
  ['/Volumes/Mac/Users/mario/x', '/Volumes/Mac…/x'],
  ['/opt/home/mario/x', '/opt…/x'],
  ['/data/home/mario/x', '/data…/x'],
  ['vscode-remote://wsl+ubuntu/home/mario/x', 'vscode-remote://wsl+ubuntu…/x'],
  ['FILE:///home/mario/x', '…/x'],
  ['File:///C:/Users/mario/x', '…/x'],
  ['file:/home/mario/x', 'file:…/x'],
  ['file://localhost/home/mario/x', '…/x'],
  ['-/home/mario/x', '-…/x'],
  ['+/home/mario/x', '+…/x'],
  ['x./home/mario/y', 'x.…/y'],
  /* ciò che teneva già */
  ['(/home/mario/x)', '(…/x)'],
  ['[/home/mario/x]', '[…/x]'],
  ['"/home/mario/x"', '"…/x"'],
  ["'/home/mario/x'", "'…/x'"],
  ['=/home/mario/x', '=…/x'],
  ['a=/Users/mario/x', 'a=…/x'],
  ['--cwd=/home/mario/x', '--cwd=…/x'],
  ['{"p":"/home/mario/x"}', '{"p":"…/x"}'],
  ['@/home/mario/x', '@…/x'],
  ['%/home/mario/x', '%…/x'],
  ['#/home/mario/x', '#…/x'],
  /* un nome con lo spazio (Mobile, 31/10): il nome dell'utente non esce */
  ['C:\\Users\\Mario Rossi\\Desktop\\x.txt', '…/x.txt'],
  ['C:/Users/Mario Rossi/Desktop/x.txt', '…/x.txt'],
  ['/mnt/c/Users/Mario Rossi/x.txt', '…/x.txt'],
  ['/c/Users/Mario Rossi/Desktop/x.txt', '/c…/x.txt'],
  ['\\\\srv\\share\\Mario Rossi\\x.txt', '…/x.txt'],
  ['file:///C:/Users/Mario Rossi/x.txt', '…/x.txt'],
  ['in C:\\Users\\Mario Rossi\\My Documents\\a b.txt fine', 'in …/a b.txt fine'],
];

const INTERI = [
  '../home/x/y.txt', './home/x/y.txt', 'a/home/b/c', 'see/home/x', 'src/tmp/a/b.js', 'feat/home/x/y', 'origin/tmp/foo/bar', 'www.example.com/home/news/a',
  'git@github.com:a/home/b/c.git', 'https://example.com/home/news/a', 'http://localhost:4174/home/x', 'https://www.gov.it/var/storage/doc.pdf', 'HTTPS://EXAMPLE.COM/home/a/b',
  'vedi https://x.it/Users/mario/profilo qui', 'https://example.com/a?x=1#/home/y', 'http://1.2.3.4:80/var/a/b', 'https://home/x/y', 'https://app/#/home/x',
];

test('D38-01 la tabella della revisione: ciò che il filtro di prima puliva si pulisce di nuovo', () => {
  for (const [testo, atteso] of PULITI) assert.equal(senzaPercorsiAssoluti(testo), atteso, testo);
});

test('D38-02 un indirizzo web e un percorso relativo restano interi', () => {
  for (const testo of INTERI) assert.equal(senzaPercorsiAssoluti(testo), testo, testo);
});

test('D38-03 dove un indirizzo finisce, il filtro ricomincia: il testo attorno si pulisce e l\'indirizzo non si rompe', () => {
  assert.equal(senzaPercorsiAssoluti('https://a.it,/home/mario/segreti/x'), 'https://a.it,…/x');
  assert.equal(senzaPercorsiAssoluti('(https://a.it)/home/mario/segreti/x'), '(https://a.it)…/x');
  assert.equal(senzaPercorsiAssoluti('C:\\Users\\Mario\\a.txt e https://x.it/home/a/b'), '…/a.txt e https://x.it/home/a/b');
  assert.equal(senzaPercorsiAssoluti('in /home/mario/a.txt vedi https://x.it/home/a/b'), 'in …/a.txt vedi https://x.it/home/a/b');
  assert.equal(senzaPercorsiAssoluti('/home/mario/a.txt\nhttps://x.it/home/a/b'), '…/a.txt\nhttps://x.it/home/a/b');
});

test('D38-04 un percorso assoluto dopo uno relativo non si nasconde dietro di lui', () => {
  assert.doesNotMatch(senzaPercorsiAssoluti('a/tmp/bin:/home/anna/.local/bin'), /anna/u);
  assert.doesNotMatch(senzaPercorsiAssoluti('a/home/b;C:/Users/Mario/x'), /Mario/u);
  assert.doesNotMatch(senzaPercorsiAssoluti('PATH=/usr/bin:/home/anna/.local/bin:/opt'), /anna/u);
  assert.doesNotMatch(senzaPercorsiAssoluti(`/${'a/'.repeat(40)}home/anna/x`), /anna/u);
});

test('D38-05 ripassare il filtro non cambia niente, e `$` nel testo non è un riferimento', () => {
  for (const [testo] of PULITI) { const una = senzaPercorsiAssoluti(testo); assert.equal(senzaPercorsiAssoluti(una), una, testo); }
  assert.equal(senzaPercorsiAssoluti('https://x.it/$&/a e $1'), 'https://x.it/$&/a e $1');
  assert.equal(senzaPercorsiAssoluti('3 project folders available.'), '3 project folders available.');
});

test('D38-06 un testo lungo pieno di candidati non blocca il filtro: il controllo guarda indietro di un tratto limitato', () => {
  const inizio = performance.now();
  const lungo = 'a/home/'.repeat(100_000);
  assert.equal(senzaPercorsiAssoluti(lungo).length > 0, true);
  assert.ok(performance.now() - inizio < 5_000, 'il filtro gira su ogni stringa di una risposta');
});
