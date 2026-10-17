/*
 * Riverifica di a4dfea6df (16/10/2026 notte): la cura di SEG-DOC-REV-01 sulle forme che il brief chiede di attaccare. Generatore,
 * verifica e scrittura VERI in un progetto temporaneo; il kernel è il finto (chiama `onDocumento` come il vero dopo il cancello).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function documento(t, argomenti, { livelloAccesso = 'Workspace write', prepara = () => {} } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'seg-doc-ri-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  prepara(cartella);
  const d = { argomenti };
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, livelloAccesso,
    talosLavoraFn: async (input) => { d.esito = await input.onDocumento?.(d.argomenti); return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], usage: {} }; },
    salvaVoceLibreriaFn: async () => ({ id: 'lib-finto' }) });
  return { cartella, esito: d.esito };
}

test('SEG-DOC-RI-01 — titolo con sottocartella: config/credentials (json) non si scrive', async (t) => {
  const { cartella, esito } = await documento(t, { format: 'json', title: 'config/credentials', body: '{"a":1}' });
  assert.equal(esito?.ok, false, JSON.stringify(esito));
  assert.equal(existsSync(join(cartella, 'config', 'credentials.json')), false);
});

test('SEG-DOC-RI-02 — il nome cambia con la sanificazione: «Credentials» e « credentials » finiscono comunque su un segreto?', async (t) => {
  for (const title of ['Credentials', ' credentials ', 'credentials.json', 'secrets']) {
    const { esito } = await documento(t, { format: title === 'secrets' ? 'yaml' : 'json', title, body: 'x: 1' });
    assert.equal(esito?.ok, false, `${JSON.stringify(title)} → ${JSON.stringify(esito)?.slice(0, 160)}`);
  }
});

test('SEG-DOC-RI-03 — un .env NUOVO con un formato: .env.yaml / .env.toml non si creano', async (t) => {
  for (const format of ['yaml', 'toml', 'ini']) {
    const { cartella, esito } = await documento(t, { format, title: '.env', body: 'A=1' });
    assert.equal(esito?.ok, false, `${format} → ${JSON.stringify(esito)?.slice(0, 160)}`);
    assert.equal(existsSync(join(cartella, `.env.${format}`)), false);
  }
});

test('SEG-DOC-RI-04 — un collegamento SIMBOLICO col nome innocuo verso il .env: accodare non tocca il segreto', async (t) => {
  const segreto = 'API_KEY=sk-vero\n';
  let simbolico = true;
  const { cartella, esito } = await documento(t, { format: 'md', title: 'appunti', body: 'riga', mode: 'append' }, {
    prepara: (c) => { writeFileSync(join(c, '.env'), segreto); try { symlinkSync(join(c, '.env'), join(c, 'appunti.md'), 'file'); } catch { simbolico = false; } },
  });
  if (!simbolico) { t.skip('collegamenti simbolici non permessi a questo utente (serve la modalità sviluppatore)'); return; }
  assert.equal(readFileSync(join(cartella, '.env'), 'utf8'), segreto, `il .env è cambiato attraverso il collegamento: ${JSON.stringify(esito)?.slice(0, 160)}`);
});

test('SEG-DOC-RI-05 — un collegamento FISICO (hard link) col nome innocuo verso il .env: accodare non tocca il segreto', { todo: 'preesistente, fuori da questo ramo (riverifica del bugfixer 16/10): un hard link scavalca ogni classe di segreto — leggi, scrivi, file_edit e la shell compresi; la cura (dev/ino per i file con nlink > 1) è in coda nella tabella di marcia' }, async (t) => {
  const segreto = 'API_KEY=sk-vero\n';
  const { cartella, esito } = await documento(t, { format: 'md', title: 'appunti', body: 'riga', mode: 'append' }, {
    prepara: (c) => { writeFileSync(join(c, '.env'), segreto); linkSync(join(c, '.env'), join(c, 'appunti.md')); },
  });
  assert.equal(readFileSync(join(cartella, '.env'), 'utf8'), segreto, `il .env è cambiato attraverso un collegamento fisico: ${JSON.stringify(esito)?.slice(0, 160)}`);
});

test('SEG-DOC-RI-06 — AL CONTRARIO: con la parola dell interfaccia «Full access» si scrive (livelloLetto), con «Workspace write» no', async (t) => {
  const pieno = await documento(t, { format: 'json', title: 'credentials', body: '{"a":1}' }, { livelloAccesso: 'Full access' });
  assert.equal(pieno.esito?.ok, true, JSON.stringify(pieno.esito));
  const area = await documento(t, { format: 'json', title: 'credentials', body: '{"a":1}' }, { livelloAccesso: 'Workspace write' });
  assert.equal(area.esito?.ok, false);
});
