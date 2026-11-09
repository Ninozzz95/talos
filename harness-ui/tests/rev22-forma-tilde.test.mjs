import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createImpostazioniContesto } from '../src/impostazioni-contesto.mjs';
import { formaDiModelloRiconosciuta } from '../src/kernel/catena-del-riassunto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* Revisione avversaria del Blocco 22 (01/11/2026), F4: un alias «~autore/famiglia-latest» è un id vero di OpenRouter (`config.mjs:205`, FORMA_OPENROUTER), e il catalogo lo porta
   nel menu della carta: la carta lo offriva e la scrittura lo rifiutava. */
test('REV22-H — un id del catalogo OpenRouter con la tilde si salva', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'rev22-'));
  try {
    const impostazioni = createImpostazioniContesto({ file: join(cartella, 'context-settings.json'), avvisa: () => {} });
    assert.equal((await impostazioni.scrivi({ modelloDelRiassunto: 'anthropic/claude-sonnet-5' })).modelloDelRiassunto, 'anthropic/claude-sonnet-5', 'premessa: un id normale si salva');
    const salvate = await impostazioni.scrivi({ modelloDelRiassunto: '~anthropic/claude-sonnet-latest' });
    assert.equal(salvate.modelloDelRiassunto, '~anthropic/claude-sonnet-latest');
  } finally { rimuoviCartellaDiProva(cartella); }
});

test('REV22-H2 — la tilde vale solo davanti alla forma `autore/modello`: le forme storte restano rifiutate', () => {
  assert.equal(formaDiModelloRiconosciuta('~deepseek/deepseek-v4-flash-latest'), true);
  for (const storta of ['~nudo', '~/modello', '~~autore/modello', '~', '~:modello', 'nudo', '~-autore/modello']) assert.equal(formaDiModelloRiconosciuta(storta), false, storta);
});
