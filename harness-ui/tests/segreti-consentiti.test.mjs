/*
 * BUG-A (owner 04/10/2026, «Aggiungi Consenti per la sessione davanti ai segreti»): il sì dato con
 * `ambito: 'percorso'` finisce in `consensiSessione.segretiConsentiti` e QUEL percorso smette di
 * chiedere fino a fine sessione; gli altri segreti continuano a chiedere; senza `consensiSessione`
 * (TALOS-BANCO, CLI) non cambia niente.
 *
 * ⛔ AGGIORNAMENTO BUG-17 (owner 05/10/2026): con «Accesso pieno» la SHELL non chiede più NEMMENO sui
 * segreti (zero carte per i comandi terminale). Il meccanismo `segretiConsentiti` si prova quindi al
 * livello «Scrive nel progetto» (nessun livello al kernel), dove F15 resta in piedi; la lettura di un
 * segreto in Accesso completo chiede ancora (tests/bug17-full-access-shell-senza-carte.test.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';

const CART = mkdtempSync(join(tmpdir(), 'segreti-consentiti-'));
const COMANDO = 'cat ~/.npmrc';

function chiediFinto(registro) {
  return async (azione) => { registro.push(azione); return true; };
}

test('BUG-A KERNEL-1: un segreto chiede con «Scrive nel progetto» (in Accesso completo BUG-17 non chiede più)', async () => {
  const domande = [];
  const esito = await verificaPermessoScrittura(
    { tipo: 'shell', comando: COMANDO },
    { chiediApprovazioneFn: chiediFinto(domande), cartella: CART },
  );
  assert.equal(domande.length, 1, 'il cancello segreti chiede con la politica di serie');
  assert.equal(esito.via, 'segreto-forza-conferma');
  assert.ok(domande[0].segreto?.percorso, 'la domanda porta il percorso del segreto');
});

test('BUG-A KERNEL-2: il percorso consentito NON ridomanda; gli altri sì', async () => {
  const domande = [];
  const consensiSessione = { segretiConsentiti: ['~/.npmrc'] };
  const esito = await verificaPermessoScrittura(
    { tipo: 'shell', comando: COMANDO },
    { chiediApprovazioneFn: chiediFinto(domande), cartella: CART, consensiSessione },
  );
  assert.equal(domande.length, 0, 'il percorso consentito non chiede più');
  assert.equal(esito.consentito, true);
  assert.equal(esito.via, 'nessun-vincolo');

  const domande2 = [];
  await verificaPermessoScrittura(
    { tipo: 'shell', comando: 'cat ~/.pgpass' },
    { chiediApprovazioneFn: chiediFinto(domande2), cartella: CART, consensiSessione },
  );
  assert.equal(domande2.length, 1, 'un ALTRO segreto continua a chiedere');
});

test('BUG-A KERNEL-3: senza consensiSessione non cambia niente (BANCO/CLI)', async () => {
  const domande = [];
  await verificaPermessoScrittura(
    { tipo: 'shell', comando: COMANDO },
    { chiediApprovazioneFn: chiediFinto(domande), cartella: CART },
  );
  assert.equal(domande.length, 1);
});

test.after?.(() => rimuoviCartellaDiProva(CART));
