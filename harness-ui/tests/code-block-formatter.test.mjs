import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFile(join(root, file), 'utf8');

/*
 * ⭐⭐⭐ 02/9 — formattatore dei blocchi di codice (owner: "crea un
 * formattatore di blocco codice, ricerca web dei migliori"). Questi test
 * sono HERMETICI apposta: leggono i sorgenti e il file vendorizzato, non
 * passano dal server 4174 — la suite browser condivide lo stato con
 * l'istanza in uso e il suo esito non è ripetibile (vedi
 * LEDGER-STREAMING-SCROLL-TERMINALE-2026-09-02.md, sezione «la suite
 * browser NON è un cancello»).
 */

