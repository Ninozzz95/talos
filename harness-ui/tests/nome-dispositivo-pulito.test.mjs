/*
 * 27/10/2026 — revisione del blocco 10, E-R1, la metà del Desktop: il nome che il dispositivo dà a sé stesso si pulisce dove si salva
 * (accoppiamento, rinomina) e quando si rilegge un elenco salvato prima. Lo stesso filtro della CLI (`cleanDeviceName`).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pulisciNomeDispositivo } from '../src/remoto/nome-dispositivo.mjs';
import { creaElencoDispositivi } from '../src/remoto/dispositivi.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const RLO = String.fromCharCode(0x202e);
const BEL = String.fromCharCode(7);
const LS = String.fromCharCode(0x2028);

test('NOME-01 controllo, formato e separatori di riga diventano uno spazio, gli spazi si stringono, 64 punti di codice', () => {
  assert.equal(pulisciNomeDispositivo(`Pad${RLO}di${BEL}Nino`), 'Pad di Nino');
  assert.equal(pulisciNomeDispositivo(`Pad${LS}${LS}di   Nino  `), 'Pad di Nino');
  assert.equal(pulisciNomeDispositivo('🙂'.repeat(70)).length, 128, '64 emoji = 128 unità UTF-16: mai a metà di un carattere');
  assert.equal(Array.from(pulisciNomeDispositivo('🙂'.repeat(70))).length, 64);
  assert.equal(pulisciNomeDispositivo(`${BEL}${RLO}`), '');
  assert.equal(pulisciNomeDispositivo(null), '');
  assert.equal(pulisciNomeDispositivo('Pad di Nino'), 'Pad di Nino', 'un nome normale resta com\'è');
});

test('NOME-02 un elenco salvato PRIMA della pulizia esce pulito; la rinomina pulisce', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-nome-disp-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const file = join(cartella, 'remoto', 'telefoni.json');
  mkdirSync(join(cartella, 'remoto'), { recursive: true });
  writeFileSync(file, JSON.stringify({ v: 1, dispositivi: [{ id: 'abcd1234efgh5678', endpointId: 'E', nome: `Pixel${RLO}evil`, piattaforma: `Android${BEL}` }] }));
  const elenco = creaElencoDispositivi({ file });
  const voci = await elenco.elenca();
  assert.equal(voci[0]?.nome, 'Pixel evil', JSON.stringify(voci));
  assert.equal(voci[0]?.piattaforma, 'Android');
  const rinominato = await elenco.rinomina('abcd1234efgh5678', `Nuovo${BEL}${LS}nome`);
  assert.equal(rinominato.nome, 'Nuovo nome');
});
