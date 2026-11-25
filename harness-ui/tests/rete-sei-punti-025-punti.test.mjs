/*
 * Riga 199, giro unico (punto 6; nota di C e reperto A-R2) — `.` e `..` nel testo GREZZO dopo il prefisso. Il lettore delle scritture e
 *   quello delle cancellazioni passano a `portaInRete` il testo espanso, non risolto: `\\.\C:\..\UNC\H\c\x` per Win32 è `\??\UNC\H\c\x`
 *   (la radice di `\\.\` è `\\.\`, e `..` toglie anche `C:`), mentre Node lo legge `C:\UNC\H`. Ora `.` si toglie e `..` toglie il pezzo
 *   prima, dopo `\\.\` e dopo `\\?\` (Node fa lo stesso aprendo): dice «rete» più spesso, mai meno. Spia chiusa, ospite inventato.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { portaInRete } = await import('../src/kernel/file-namespace-contract.mjs');
const { verificaPermessoScrittura } = await import('../src/kernel/talosHarness.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
const { B, OSPITE } = S;
const W = { platform: 'win32' };
const solo = { skip: process.platform !== 'win32' && 'solo Windows' };
const GREZZE = [`${B}${B}.${B}C:${B}..${B}UNC${B}${OSPITE}${B}c${B}x`, `${B}${B}?${B}x${B}..${B}UNC${B}${OSPITE}${B}c`, `${B}${B}.${B}pipe${B}..${B}UNC${B}${OSPITE}${B}c`,
  `${B}${B}?${B}GLOBALROOT${B}Device${B}.${B}Mup${B}${OSPITE}${B}c`, `${B}${B}?${B}.${B}UNC${B}${OSPITE}${B}c`, `${B}${B}.${B}UNC${B}.${B}${OSPITE}${B}c`,
  `${B}${B}?${B}GLOBALROOT${B}??${B}x${B}..${B}UNC${B}${OSPITE}${B}c`];

test('R199-PUNTI-F: sul testo grezzo `.` e `..` dopo il prefisso non nascondono la rete; i dischi locali restano locali', () => {
  const locali = GREZZE.filter((p) => portaInRete(p, W) === null);
  assert.deepEqual(locali, []);
  for (const p of [`${B}${B}.${B}C:${B}..${B}C:${B}x`, `${B}${B}?${B}C:${B}x${B}..${B}y`, `${B}${B}.${B}UNC${B}..${B}..${B}C:${B}x`]) assert.equal(portaInRete(p, W), null, p);
});

test('R199-PUNTI-SHELL: `copy a.txt \\\\.\\C:\\..\\UNC\\H\\c\\x` chiede con la carta di rete, mai «per la sessione»; in Accesso pieno non tocca', solo, async (t) => {
  const c = mkdtempSync(join(tmpdir(), 'talos-r199-punti-'));
  mkdirSync(join(c, 'src'));
  t.after(() => rimuoviCartellaDiProva(c));
  S.azzera();
  const chieste = [];
  await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando: `copy a.txt ${GREZZE[0]}` }, { livelloAccesso: 'scrittura-progetto', cartella: c, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
  assert.equal(chieste.length, 1);
  assert.equal(chieste[0].fuoriDalProgetto?.fraseChiave, 'server.approval.network.open');
  assert.equal(chieste[0].fuoriDalProgetto?.chiave, undefined);
  assert.deepEqual(S.elencoDeiTocchi(), []);
});
