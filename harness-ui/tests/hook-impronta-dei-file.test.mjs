/*
 * ⛔⛔⛔ 17/09/2026 — la fiducia di una guardia è legata al CONTENUTO dei file che il suo comando nomina.
 *
 * Il difetto, misurato prima della cura con queste stesse funzioni: `node guardia.mjs` approvato,
 * `guardia.mjs` riscritto, e l'hook restava approvato (stessa impronta) ed eseguiva la versione
 * sostituita. Queste prove usano i file VERI e il processo VERO (`node`): la guardia sostituita
 * lascia un file-spia sul disco se gira, quindi «non è girata» si legge dal disco, non da un esito.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { caricaHooks, eseguiHook, fidaHook, improntaHook, verificaTrust } from '../src/hook-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function scena(t, comando = 'node guardia.mjs') {
  const cartella = mkdtempSync(join(tmpdir(), 'hook-impronta-'));
  const cartellaTrust = mkdtempSync(join(tmpdir(), 'hook-impronta-trust-'));
  t.after(() => { rimuoviCartellaDiProva(cartella); rimuoviCartellaDiProva(cartellaTrust); });
  writeFileSync(join(cartella, 'guardia.mjs'), "console.log(JSON.stringify({ consentito: true, motivo: 'APPROVATA' }));\n");
  writeFileSync(join(cartella, '.harness-ui-hooks.json'), JSON.stringify({ hooks: [{ id: 'guardia', eventi: ['pre_tool_call'], comando }] }));
  return { cartella, cartellaTrust };
}
const SOSTITUITA = "import { writeFileSync } from 'node:fs';\nwriteFileSync('SPIA-HO-GIRATO.txt', 'x');\nconsole.log(JSON.stringify({ consentito: true, motivo: 'SOSTITUITA' }));\n";

test('HOOK-IMPRONTA-01 — riscritto il file della guardia, al prossimo caricamento NON è più approvata', async (t) => {
  const { cartella, cartellaTrust } = scena(t);
  const [prima] = (await caricaHooks({ cartella })).hooks;
  await fidaHook({ cartellaTrust, hookId: prima.id, hash: prima.hash });
  assert.equal(await verificaTrust({ cartellaTrust, hookId: prima.id, hash: prima.hash }), true, 'premessa: approvata');
  writeFileSync(join(cartella, 'guardia.mjs'), SOSTITUITA);
  const [dopo] = (await caricaHooks({ cartella })).hooks;
  assert.notEqual(dopo.hash, prima.hash, '⛔ il contenuto è cambiato e l’impronta no: la fiducia è legata al NOME del file');
  assert.equal(await verificaTrust({ cartellaTrust, hookId: dopo.id, hash: dopo.hash }), false);
});

test('HOOK-IMPRONTA-02 — a SESSIONE VIVA (foto presa all’avvio) la guardia sostituita non gira, e nega', async (t) => {
  const { cartella } = scena(t);
  const [fotoDiAvvio] = (await caricaHooks({ cartella })).hooks;
  const buono = await eseguiHook({ hook: fotoDiAvvio, evento: { tipo: 'pre_tool_call' }, cartella });
  assert.deepEqual({ consentito: buono.consentito, motivo: buono.motivo }, { consentito: true, motivo: 'APPROVATA' }, 'premessa: la guardia vera gira');
  writeFileSync(join(cartella, 'guardia.mjs'), SOSTITUITA);
  const esito = await eseguiHook({ hook: fotoDiAvvio, evento: { tipo: 'pre_tool_call' }, cartella });
  assert.equal(esito.consentito, false, '⛔ una guardia sostituita che «consente» è peggio di nessuna guardia');
  assert.equal(esito.codice, 'HOOK_CHANGED_SINCE_TRUST');
  assert.doesNotMatch(esito.motivo, /hash|sha|hook\b/i, 'la frase arriva a schermo: niente parole tecniche');
  assert.equal(existsSync(join(cartella, 'SPIA-HO-GIRATO.txt')), false, '⛔ il file sostituito È STATO ESEGUITO: la spia è sul disco');
});

test('HOOK-IMPRONTA-03 — un comando che non nomina file conserva l’impronta di sempre (nessuno deve riapprovare)', async (t) => {
  const { cartella } = scena(t);
  for (const comando of ['echo ciao', 'node -e "process.exit(0)"', 'node file-che-non-esiste.mjs']) {
    assert.equal(await improntaHook({ comando, cartella }), createHash('sha256').update(comando).digest('hex'), comando);
  }
});

test('HOOK-IMPRONTA-04 — entrano i file del PROGETTO, non quelli fuori; e l’ordine degli argomenti non cambia il fatto che ognuno conti', async (t) => {
  const { cartella } = scena(t, 'node guardia.mjs regole.json');
  writeFileSync(join(cartella, 'regole.json'), '{"a":1}');
  const uno = await improntaHook({ comando: 'node guardia.mjs regole.json', cartella });
  writeFileSync(join(cartella, 'regole.json'), '{"a":2}');
  const due = await improntaHook({ comando: 'node guardia.mjs regole.json', cartella });
  assert.notEqual(uno, due, '⛔ anche il SECONDO file nominato deve contare');
  const fuori = join(tmpdir(), `fuori-${process.pid}.txt`);
  writeFileSync(fuori, 'x');
  t.after(() => rimuoviCartellaDiProva(fuori));
  const conFuori = `echo ${fuori.split('\\').join('/')}`;
  assert.equal(await improntaHook({ comando: conFuori, cartella }), createHash('sha256').update(conFuori).digest('hex'));
});

test('HOOK-IMPRONTA-05 — un collegamento non si segue e non si salta: si rifiuta', async (t) => {
  const { cartella } = scena(t);
  try { symlinkSync(join(cartella, 'guardia.mjs'), join(cartella, 'alias.mjs'), 'file'); }
  catch (errore) { t.skip(`questa macchina non lascia creare collegamenti a file (${errore.code})`); return; }
  await assert.rejects(() => improntaHook({ comando: 'node alias.mjs', cartella }), { code: 'HOOK_FILE_LINK' });
});
