import assert from 'node:assert/strict';
import test from 'node:test';

import { leggiEsitoComando, dovEGirato, rigaDiStatoComando } from '../../src/components/esito-comando.js';

/*
 * PO-06 — l'esito di un comando scritto dalla persona, detto a una persona.
 * Le forme grezze qui sotto sono quelle MISURATE sul kernel il 10/09/2026, non inventate.
 */

test('PO-06: un comando riuscito dice che è riuscito, e l’output resta intero', () => {
  const e = leggiEsitoComando('exit 0 [sandbox: none]\nciao-po06\n');
  assert.equal(e.uscita, 0);
  assert.equal(e.riuscito, true);
  assert.equal(e.fermato, false);
  assert.equal(e.output, 'ciao-po06\n', 'l’intestazione sparisce, l’output no');
  assert.equal(e.verdetto, 'Riuscito');
});

/*
 * ⛔ IL CASO CHE GIUSTIFICA IL MODULO. Misurato il 10/09 sulla macchina dell'owner: `!npm --version`
 * risponde con l'npm di LINUX. Chi scrive un comando crede di parlare al proprio computer.
 */
test('PO-06: se il comando è girato in Linux invece che su Windows, si dice', () => {
  const e = leggiEsitoComando('exit 0 [sandbox: wsl2]\n11.16.0\n');
  assert.equal(e.livello, 'wsl2');
  assert.equal(e.dove, 'in Linux (WSL), non su Windows');
  assert.match(rigaDiStatoComando(e), /Linux \(WSL\), non su Windows/);
});

/*
 * ⛔ LA BUGIA PEGGIORE DELLA CATENA, misurata: `sleep 300` torna dopo 120.082 ms con codice `null`,
 * testo VUOTO e `outcome:{type:'success'}` — cioè un comando fermato a metà è indistinguibile da uno
 * finito bene e muto. Il kernel è di un'altra lane e non possiamo ripararlo qui; possiamo smettere
 * di ripetere la sua bugia.
 */
test('PO-06, AL CONTRARIO: un comando fermato dal tempo massimo non passa per riuscito', () => {
  const e = leggiEsitoComando('exit null [sandbox: wsl2]\n');
  assert.equal(e.uscita, null);
  assert.equal(e.riuscito, false, '⛔ se questo diventa true, a schermo un comando troncato sembra andato bene');
  assert.equal(e.fermato, true);
  assert.equal(e.verdetto, 'Fermato: ha superato il tempo massimo');
  assert.equal(e.output, '', 'e non c’è output da mostrare: è esattamente ciò che confonde');
});

test('PO-06: un codice diverso da zero è un esito, non un guasto — e porta il suo numero', () => {
  const e = leggiEsitoComando('exit 7 [sandbox: wsl2]\nFUORI\n\nERR');
  assert.equal(e.uscita, 7);
  assert.equal(e.riuscito, false);
  assert.equal(e.fermato, false);
  assert.equal(e.verdetto, 'Non riuscito · codice 7');
  assert.equal(e.output, 'FUORI\n\nERR', 'l’output aggregato si mostra INTERO: un comando fallito scrive spesso su stdout');
});

test('PO-06: senza il livello di isolamento non si inventa un posto', () => {
  const e = leggiEsitoComando('exit 0\nsolo output\n');
  assert.equal(e.uscita, 0);
  assert.equal(e.livello, null);
  assert.equal(e.dove, null);
  assert.equal(rigaDiStatoComando(e), 'Riuscito', 'niente «su ignoto»: si tace');
});

test('PO-06, AL CONTRARIO: un livello che non conosciamo NON si traduce a caso', () => {
  assert.equal(dovEGirato('firecracker-v3'), null);
  assert.equal(dovEGirato(''), null);
  assert.equal(dovEGirato(null), null);
  assert.equal(dovEGirato(undefined), null);
});

test('PO-06, AL CONTRARIO: un testo che non è un esito di comando resta intatto, senza verdetto', () => {
  const e = leggiEsitoComando('REFUSED. Empty html: nothing was created.');
  assert.equal(e.output, 'REFUSED. Empty html: nothing was created.');
  assert.equal(e.verdetto, '', 'nessun verdetto su un testo che non abbiamo capito');
  assert.equal(e.riuscito, false);
});

test('PO-06: il tempo si scrive solo se lo sappiamo davvero', () => {
  const e = leggiEsitoComando('exit 0 [sandbox: none]\n');
  assert.equal(rigaDiStatoComando(e, 131), 'Riuscito · su Windows, senza isolamento · 131 ms');
  assert.equal(rigaDiStatoComando(e, 2091), 'Riuscito · su Windows, senza isolamento · 2.1 s');
  /* ⛔ `Number(null) === 0`: senza la guardia un tempo ASSENTE diventerebbe «0 ms», cioè un dato
     mancante travestito da misura. Stesso difetto già pagato oggi sulla dimensione di un allegato. */
  assert.equal(rigaDiStatoComando(e, null), 'Riuscito · su Windows, senza isolamento');
  assert.equal(rigaDiStatoComando(e), 'Riuscito · su Windows, senza isolamento');
  assert.equal(rigaDiStatoComando(e, NaN), 'Riuscito · su Windows, senza isolamento');
});

test('PO-06: un codice d’uscita negativo non si perde per strada', () => {
  const e = leggiEsitoComando('exit -1 [sandbox: none]\n');
  assert.equal(e.uscita, -1);
  assert.equal(e.verdetto, 'Non riuscito · codice -1');
});
