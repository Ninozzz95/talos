/*
 * ⛔ Il testo per il MODELLO quando la guardia dei biglietti chiede e nessuno è davanti (forma del 03/11/2026, OK di Performance,
 *   CLI e Mobile: in-corso/FORMA-BIGLIETTI-TESTO-PER-IL-MODELLO-2026-11-03.md). Prima il modello leggeva
 *   «the path "biglietto-talos" belongs to the class of reserved files»: falso due volte, perché non è un percorso, e per un comando
 *   troppo complesso non si tratta nemmeno dei biglietti. Ora il testo segue il PERCHÉ della segnalazione, come la carta della persona.
 *   · nessun nome di file nel testo (Mobile: un percorso nel rifiuto invita a cercarlo, e sul telefono può non esistere);
 *   · la frase si confronta INTERA (CLI: nessuna pista falsa);
 *   · al contrario: un segreto vero (`.env`) dice ancora il suo percorso;
 *   · la chiave del consenso NON cambia (decisione 107): i sì già dati restano.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { chiaveDelConsensoDi, motivoDaChiedere } from '../src/path-policy.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-biglietti-testo-')));
const casa = join(radice, 'casa');
const progetto = join(radice, 'progetto');
mkdirSync(casa, { recursive: true });
mkdirSync(progetto, { recursive: true });
writeFileSync(join(progetto, '.env'), 'X=1\n');
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
process.env.USERPROFILE = casa;
process.env.HOME = casa;
assert.equal(homedir(), casa, 'premessa: la casa è quella finta');
test.after(async () => {
  for (const [k, v] of Object.entries(prima)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await rimuoviCartellaDiProvaAttesa(radice);
});

const BIGLIETTI = 'node harness-ui/scripts/biglietto-talos.mjs --apri';
const COMPLESSO = 'bash -c '.repeat(20) + 'ls';
const ANNIDATO_CON_ENV = 'bash -c "'.repeat(6) + 'cat .env' + '"'.repeat(6);
const CODA = ', but this session has no active approval channel.';
const FRASE_BIGLIETTI = `the tool "shell" requires approval (this command prints an entry ticket for the TALOS server: a human confirmation is needed even with an "always" permission)${CODA}`;
const FRASE_COMPLESSO = `the tool "shell" requires approval (this command is too complex to check safely (nested shells, or past a limit of the guard): a human confirmation is needed even with an "always" permission)${CODA}`;
const FRASE_ENV = `the tool "file_edit" requires approval (the path ".env" belongs to the class of reserved files (keys, credentials, keychains): a human confirmation is needed even with an "always" permission)${CODA}`;

/** Nessuno davanti: niente `chiediApprovazioneFn`, come un'automazione o un modello locale senza canale. */
/* 155 (owner 04/11/2026): in Accesso pieno la guardia dei biglietti non chiede più; il testo per il modello si prova dove chiede ancora, in «Su richiesta» */
const senzaCanale = (comando, livelloAccesso = 'su-richiesta') => verificaPermessoScrittura({ tipo: 'shell', comando }, { livelloAccesso, cartella: progetto, consensiSessione: {} });

test('BIGLIETTI-TESTO-01: il comando dei biglietti dice che cosa fa, per intero, senza nomi di file', async () => {
  const esito = await senzaCanale(BIGLIETTI);
  assert.equal(esito.consentito, false);
  assert.equal(esito.motivo, FRASE_BIGLIETTI);
  assert.doesNotMatch(esito.motivo, /biglietto-talos|\.mjs|the path/u);
});

test('BIGLIETTI-TESTO-02: un comando troppo complesso dice che è troppo complesso, non che è un file riservato', async () => {
  const esito = await senzaCanale(COMPLESSO);
  assert.equal(esito.consentito, false);
  assert.equal(esito.motivo, FRASE_COMPLESSO);
  assert.doesNotMatch(esito.motivo, /biglietto-talos|reserved files|the path/u);
});

test('BIGLIETTI-TESTO-03: AL CONTRARIO — un segreto vero dice ancora il suo percorso, col testo di prima', async () => {
  /* il caso che oggi chiede davvero per un .env (SEGRETI-SCRITTURA-04): una modifica, nessuno davanti */
  const esito = await verificaPermessoScrittura({ tipo: 'file_edit', percorso: '.env' }, { livelloAccesso: 'scrittura-progetto', cartella: progetto, consensiSessione: {} });
  assert.equal(esito.consentito, false);
  assert.equal(esito.motivo, FRASE_ENV);
});

test('BIGLIETTI-TESTO-04 (Mobile): un .env vero dentro shell annidate dice il perché che il kernel tiene, e uno solo', async () => {
  const segnalazione = motivoDaChiedere({ tipo: 'shell', comando: ANNIDATO_CON_ENV }, { cartella: progetto });
  const esito = await senzaCanale(ANNIDATO_CON_ENV);
  assert.equal(esito.consentito, false);
  /* vince la segnalazione che il kernel tiene, ed è «troppo complesso» (sei shell annidate oltre il tetto della guardia):
     si fissa qui, così un tetto spostato non passa in silenzio (revisione della CLI, 03/11 21:10) */
  assert.equal(segnalazione?.perche, 'troppo-complesso', `perché tenuto dal kernel: ${segnalazione?.perche ?? segnalazione?.classe}`);
  assert.equal(esito.motivo, FRASE_COMPLESSO);
});

test('BIGLIETTI-TESTO-05: la chiave del consenso dei biglietti porta il motivo (decisione 107) e l\'impronta del comando (S2 della PR 20)', () => {
  const segnalazione = motivoDaChiedere({ tipo: 'shell', comando: BIGLIETTI }, { cartella: progetto });
  assert.match(String(chiaveDelConsensoDi(segnalazione, 'shell', BIGLIETTI)), /^lettura:biglietti:sha256:[0-9a-f]{64}$/u);
});

test('BIGLIETTI-TESTO-06 (155): in Accesso pieno, senza nessuno davanti, il comando dei biglietti e quello troppo complesso passano; la chiave letta no', async () => {
  for (const comando of [BIGLIETTI, COMPLESSO]) assert.equal((await senzaCanale(comando, 'accesso-pieno')).consentito, true, comando);
  const chiave = await senzaCanale('cat ~/.talos-biglietti/4174.chiave', 'accesso-pieno');
  assert.equal(chiave.consentito, false, 'leggere la chiave dei biglietti è una credenziale di casa (161)');
});
