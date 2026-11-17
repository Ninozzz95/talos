/*
 * Giro di cura unico della riparazione dei permessi (12/11/2026, dopo il secondo ripasso; revisore C, «nati nel giro») — LA LETTURA
 * CHE SEGUE IL `cd` DELLO STESSO COMANDO: che cosa dice la carta, quante cartelle si seguono, e la carta in più di `popd`.
 * Solo `path-policy.mjs` (niente cancellazioni critiche): questo file si porta così com'è sulla CLI.
 *  - CDL-1: la carta nominava come file la parola del comando (`chdir`, `sl`, `cd`, `pushd`…), perché anche quella si guardava
 *    nella cartella in cui il comando si sposta. Ora la parola che sposta non è un percorso: la carta nomina la credenziale.
 *  - CDL-2: il tetto si conta per SPOSTAMENTO, non per lettura: un `cd /c/…` di Git Bash ha due letture (il disco `c:` e la
 *    cartella `\c`), e prima contava due, così con Git Bash bastavano nove `cd` per la carta «troppo complesso».
 *  - CDL-3: spiegato, non curato: la lettura si guarda in OGNI cartella che il comando visita, in qualunque ordine. Dopo
 *    `pushd <casa> && popd` si è tornati nel progetto, ma `.npmrc` si guarda anche nella casa: una carta in più, mai una in meno.
 * Niente viene eseguito: solo le funzioni, su un disco che non esiste (a parole).
 * Fonti (lette il 12/11/2026): learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/set-location (alias
 * `cd`, `chdir`, `sl`); msys2.org/docs/filesystem-paths (`/c/…` è il disco `C:` per i programmi di MSYS2).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { credenzialeDellaCasaLetta } from '../src/path-policy.mjs';

const WINDOWS = process.platform === 'win32';
const BS = String.fromCharCode(92);
const D = WINDOWS ? [...'QZYXWVUTSPONMLK'].find((l) => !existsSync(`${l}:${BS}`)) : null;
const SALTA = !WINDOWS || !D;
const casa = `${D}:${BS}Users${BS}tizio`;
const progetto = `${D}:${BS}lavori${BS}progetto`;
const letta = (comando, cartella = progetto) => credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella, home: casa });

test('CDL-1 — la carta nomina la credenziale, mai la parola che sposta (`cd`, `chdir`, `sl`, `pushd`, `Set-Location`, `Push-Location`)', { skip: SALTA }, () => {
  const ssh = `${casa}${BS}.ssh`;
  for (const [comando, attesa] of [
    [`chdir ${ssh} & type config`, ssh],
    [`sl ${ssh}; Get-Content config`, ssh],
    [`cd ${ssh} && type config`, ssh],
    [`cd /d ${ssh} && type config`, ssh],
    [`pushd ${ssh} && type config && popd`, ssh],
    [`Set-Location -Path ${ssh}; Get-Content config`, ssh],
    [`Push-Location ${ssh}; Get-Content config`, ssh],
    [`cd ${casa} && cd .ssh && type config`, '.ssh'],
    [`cd /d ${casa} && type .npmrc`, '.npmrc'],
  ]) {
    const carta = letta(comando);
    assert.equal(carta?.credenzialeDellaCasa, true, `chiede: ${comando}`);
    assert.equal(carta.percorso, attesa, `la carta nomina ${attesa}: ${comando}`);
  }
  /* al contrario: `chdir` verso una cartella normale, poi `config`: niente */
  assert.equal(letta(`chdir ${D}:${BS}lavori${BS}altro & type config`), null);
});

test('CDL-2 — sedici spostamenti si seguono anche con le cartelle di Git Bash (`/x/…`, due letture per `cd`); il diciassettesimo chiede', { skip: SALTA }, () => {
  const d = D.toLowerCase();
  const gitBash = (n) => Array.from({ length: n }, (_, i) => `cd /${d}/lavori/p${i} && npm test`).join(' && ');
  const annidata = (n) => `bash -c "${gitBash(n)}"`;
  const cmd = (n) => Array.from({ length: n }, (_, i) => `cd /d ${D}:${BS}lavori${BS}p${i} && npm test`).join(' && ');
  for (const comando of [gitBash(9), gitBash(16), annidata(9), annidata(16), cmd(16)]) assert.equal(letta(comando), null, `seguiti: ${comando.slice(0, 60)}…`);
  for (const comando of [gitBash(17), annidata(17), cmd(17)]) assert.equal(letta(comando)?.credenzialeDellaCasa, true, `oltre il tetto: ${comando.slice(0, 60)}…`);
  /* col progetto su un ALTRO disco ogni `cd /x/…` dopo il primo ha tre letture (`\x\…` sui due dischi correnti, e `x:`): sedici si seguono ancora */
  const E = WINDOWS ? [...'QZYXWVUTSPONMLK'].find((l) => l !== D && !existsSync(`${l}:${BS}`)) : null;
  if (E) {
    const altrove = `${E}:${BS}lavori${BS}progetto`;
    assert.equal(letta(gitBash(16), altrove), null, 'sedici spostamenti di Git Bash da un altro disco: si seguono');
    assert.equal(letta(gitBash(17), altrove)?.credenzialeDellaCasa, true, 'diciassette: chiede');
  }
});

test('CDL-3 — spiegato: dopo `pushd <casa> && popd` la lettura si guarda anche nella casa (una carta in più); verso una cartella normale niente', { skip: SALTA }, () => {
  assert.equal(letta(`pushd ${casa} && popd && type .npmrc`)?.credenzialeDellaCasa, true, 'una carta in più, dichiarata');
  assert.equal(letta(`pushd ${D}:${BS}lavori${BS}altro && popd && type .npmrc`), null, 'al contrario: una cartella normale');
  assert.equal(letta(`pushd ${casa} && type .npmrc && popd`)?.credenzialeDellaCasa, true, 'la lettura dentro la casa chiede, come deve');
});

/*
 * Cura del ROSSO del revisore (13/11/2026, mutanti K31 e K33 senza prova): il tetto delle CARTELLE (quattro per spostamento) e gli
 * spostamenti già visti che non contano. Misurato dal revisore (`soffitto.log`, dal cancello in Accesso pieno): con ogni `cd /x/…` su
 * un disco diverso la carta arriva a dieci spostamenti; con due dischi che si alternano, come sullo stesso disco, a diciassette.
 */
test('CDL-4 — dischi tutti diversi: nove spostamenti di Git Bash si seguono, al decimo il tetto delle cartelle chiede', { skip: SALTA }, () => {
  const lettere = 'abdeghijmnopqrsuvwxyz'.replace(D.toLowerCase(), '');
  const diversi = (n) => `${Array.from({ length: n }, (_, i) => `cd /${lettere[i]}/x${i}`).join(' && ')} && type .npmrc`;
  assert.equal(letta(diversi(9)), null, 'nove: si seguono');
  assert.equal(letta(diversi(10))?.credenzialeDellaCasa, true, 'dieci: chiede');
});

test('CDL-5 — venti spostamenti avanti e indietro fra due sole cartelle non arrivano al tetto (ripetuti non contano); diciassette nuove sì', { skip: SALTA }, () => {
  const d = D.toLowerCase();
  const avantiIndietro = Array.from({ length: 20 }, (_, i) => `cd /${d}/lavori/p${i % 2}`).join(' && ');
  assert.equal(letta(`${avantiIndietro} && type .npmrc`), null, 'due cartelle, venti spostamenti: si seguono');
  const alternati = (n) => `${Array.from({ length: n }, (_, i) => `cd /${i % 2 ? 'a' : 'b'}/x${i}`).join(' && ')} && type .npmrc`;
  assert.equal(letta(alternati(16)), null, 'due dischi alternati, sedici: si seguono');
  assert.equal(letta(alternati(17))?.credenzialeDellaCasa, true, 'due dischi alternati, diciassette: chiede');
});

test('CDL-6 — seconde prove del tetto: dentro `bash -c` dieci dischi diversi chiedono e nove no; in cmd venti `cd /d` avanti e indietro fra due cartelle si seguono', { skip: SALTA }, () => {
  const lettere = 'abdeghijmnopqrsuvwxyz'.replace(D.toLowerCase(), '');
  const dentroBash = (n) => `bash -c "${Array.from({ length: n }, (_, i) => `cd /${lettere[i]}/y${i}`).join('; ')}; cat .npmrc"`;
  assert.equal(letta(dentroBash(9)), null, 'nove dentro bash -c: si seguono');
  assert.equal(letta(dentroBash(10))?.credenzialeDellaCasa, true, 'dieci dentro bash -c: chiede');
  const cmdAvantiIndietro = Array.from({ length: 20 }, (_, i) => `cd /d ${D}:${BS}lavori${BS}q${i % 2}`).join(' && ');
  assert.equal(letta(`${cmdAvantiIndietro} && type .npmrc`), null, 'cmd, venti spostamenti fra due cartelle: si seguono');
});
