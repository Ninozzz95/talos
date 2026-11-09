/*
 * ⛔⛔ 04/11/2026 — DECISIONE 179 DELL'OWNER: il telefono entra nel giro di cure del blocco permessi (Accesso pieno, 155-161).
 *   Prove ROSSE del Mobile, scritte PRIMA della cura, per l'agente del giro. Vanno copiate in `harness-ui/tests/` (gli import sono
 *   relativi a quella cartella). Radici A e B: messaggio del Mobile al Desktop delle 18:28, prese dal codice Android della lane:
 *     - HOME del Codice sul telefono = <filesDir>/codice-r4 (`TalosR4Avvio.kt:92`, `:125`);
 *     - cartella dei progetti = <filesDir>/codice/workspace (`TalosR4Avvio.kt:149`, `TalosCodiceInCasa.kt:74`), passata al server come
 *       `TALOS_HARNESS_UI_PROJECT_DIRS` (`TalosR4Avvio.kt:88`);
 *     - chiavi e conversazioni: <HOME>/chiavi e <HOME>/state (`TalosR4Avvio.kt:48-51`, `:86-87`);
 *     - la memoria condivisa e i suoi altri nomi: `/mnt/user/N/emulated/N` lo conosce già `gettone.mjs:135`.
 *   Sulla base 14fcda773 sono rosse le prove «179-N*»; le «AL CONTRARIO» e «179-K1» sono già verdi e devono restarlo.
 *   I nomi dei motivi (`perche`) nuovi li sceglie la cura: dove il motivo non esiste ancora la prova chiede solo che ci sia una carta.
 *
 * Ambiente: nessun disco del telefono, nessun dato dell'owner. I percorsi sono parole; `realpathFn` è l'identità.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';

const critiche = await import('../src/kernel/cancellazioni-critiche.mjs').catch(() => ({}));
const cancellazioneCritica = critiche.cancellazioneCritica ?? (() => null);
const dimenticaPercorsiVeri = critiche.dimenticaPercorsiVeri ?? (() => {});

const PACCHETTO = '/data/user/0/ai.talos.dev';
const FILES = `${PACCHETTO}/files`;
const CASA = `${FILES}/codice-r4`;
const LAVORO = `${FILES}/codice/workspace`;

/** Una sessione del Codice del telefono. `cartella` di serie: un progetto dentro la cartella dei progetti. */
function telefono(cartella = `${LAVORO}/mio-progetto`) {
  dimenticaPercorsiVeri();
  return {
    cartella,
    home: CASA,
    piattaforma: 'android',
    ambiente: { HOME: CASA, TMPDIR: `${PACCHETTO}/cache`, TALOS_HARNESS_UI_PROJECT_DIRS: LAVORO },
    realpathFn: (p) => p,
  };
}

test('179-N1 — `/mnt/user/0/emulated/0` è un altro nome di `/storage/emulated/0` (gettone.mjs:135): carta «telefono»', () => {
  const a = telefono();
  for (const comando of ['rm -rf /mnt/user/0/emulated/0/*', 'rm -rf /mnt/user/0/emulated/0', 'rm -rf /mnt/user/0/emulated/0/']) {
    assert.equal(cancellazioneCritica(comando, a)?.perche, 'telefono', comando);
  }
});

test('179-N2 — gli altri profili (lavoro, di solito 10): `/storage/emulated/N` e `/mnt/user/N/emulated/N` sono radici', () => {
  const a = telefono();
  for (const comando of ['rm -rf /storage/emulated/10', 'rm -rf /storage/emulated/10/*', 'rm -rf /mnt/user/10/emulated/10/*', 'rm -rf /storage/emulated/11/']) {
    assert.notEqual(cancellazioneCritica(comando, a), null, comando);
  }
});

test('179-N3 — le cartelle di primo livello della memoria condivisa contano come quelle di un disco (DCIM, Download, …)', () => {
  const a = telefono();
  for (const comando of ['rm -rf /sdcard/DCIM', 'rm -rf /storage/emulated/0/Download', 'rm -rf /sdcard/Android', 'rm -rf /sdcard/Documents/',
    'rm -rf /storage/emulated/0/Pictures/*', 'rm -rf /mnt/user/0/emulated/0/Music']) {
    assert.notEqual(cancellazioneCritica(comando, a), null, comando);
  }
});

test('179-N4 — dentro la casa del Codice, chiavi e conversazioni sono critiche (sono la «cartella utente» del telefono)', () => {
  const a = telefono();
  for (const comando of ['rm -rf ~/chiavi', `rm -rf ${CASA}/chiavi`, 'rm -rf ~/state', `rm -rf ${CASA}/state/`, 'rm -rf "$HOME/chiavi"']) {
    assert.notEqual(cancellazioneCritica(comando, a), null, comando);
  }
});

test('179-N5 — la cartella di TUTTI i progetti è critica anche quando la sessione lavora altrove', () => {
  const a = telefono('/storage/emulated/0/Progetti/orca');
  for (const comando of [`rm -rf ${LAVORO}`, `rm -rf ${LAVORO}/`, `rm -rf ${LAVORO}/*`]) {
    assert.notEqual(cancellazioneCritica(comando, a), null, comando);
  }
});

test('179-N6 — `/data/data/<pacchetto>` è un altro nome di `/data/user/0/<pacchetto>`: la casa resta la casa', () => {
  const a = telefono();
  assert.equal(cancellazioneCritica(`rm -rf ${CASA}`, a)?.perche, 'casa', 'oggi già verde: la casa col nome vero');
  assert.equal(cancellazioneCritica('rm -rf /data/data/ai.talos.dev/files/codice-r4', a)?.perche, 'casa', 'col nome /data/data');
  assert.notEqual(cancellazioneCritica('rm -rf /data/data/ai.talos.dev/files/codice/workspace', a), null, 'i progetti col nome /data/data');
});

test('179 AL CONTRARIO — il lavoro normale sul telefono non chiede nulla', () => {
  const a = telefono();
  for (const comando of [
    'rm -rf build', 'rm -rf node_modules', `rm -rf ${LAVORO}/mio-progetto/build`, 'rm -rf ./dist/*',
    'rm -rf /sdcard/Download/vecchio', 'rm /storage/emulated/0/DCIM/Camera/IMG_0001.jpg', 'rm -rf /mnt/user/0/emulated/0/Download/vecchio',
    'rm -rf /storage/emulated/0/Progetti/altro', 'rm -rf ~/tmp', `rm -rf ${CASA}/state/cache-vecchia`, 'rm -rf "$TMPDIR/prova"',
  ]) {
    assert.equal(cancellazioneCritica(comando, a), null, comando);
  }
});

test('179-K1 — Accesso pieno SENZA ospite (il telefono passa il livello diretto, `permessiR4.ts:14`): la cancellazione critica chiede', async () => {
  /* la forma A aggiunge `accessoPienoDellOspite`: questa prova fissa che il livello diretto, usato dal telefono, resta coperto */
  const cartella = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-179-')));
  const carte = [];
  const no = await verificaPermessoScrittura({ tipo: 'shell', comando: 'rm -rf .' }, {
    livelloAccesso: 'accesso-pieno', cartella, consensiSessione: {},
    chiediApprovazioneFn: async (carta) => { carte.push(carta); return false; },
  });
  assert.equal(no.consentito, false);
  assert.equal(no.via, 'cancellazione-critica');
  assert.equal(carte.length, 1, 'una carta');
  /* e un comando normale nello stesso livello passa senza carta */
  const si = await verificaPermessoScrittura({ tipo: 'shell', comando: 'rm -rf build' }, {
    livelloAccesso: 'accesso-pieno', cartella, consensiSessione: {}, chiediApprovazioneFn: async () => { throw new Error('nessuna carta attesa'); },
  });
  assert.equal(si.consentito, true);
});
