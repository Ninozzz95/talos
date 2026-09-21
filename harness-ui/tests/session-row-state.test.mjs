import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFile(join(root, file), 'utf8');

/*
 * ⭐⭐⭐ 02/9 — lo stato della riga sessione. Prima la riga diceva solo
 * «concluso» o «in corso»: una sessione FALLITA e una RIUSCITA si
 * leggevano IDENTICHE. Il server mandava già tutto (`ultimoEsito`,
 * `interrotta`, `inAttesaApprovazione`, `modello`, `usage`) e la riga ne
 * usava due campi su otto.
 * Ricerca e confronto completi in
 * `.claude/DOSSIER-LISTA-SESSIONI-CONFRONTO-2026-09-02.md`.
 */

