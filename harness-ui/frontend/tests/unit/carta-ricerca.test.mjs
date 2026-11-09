import test from 'node:test';
import assert from 'node:assert/strict';

import { domandaCorrettaDallEsito } from '../../src/components/carta-ricerca.js';
import { PREFISSO_DOMANDA_CORRETTA } from '../../../src/kernel/talosHarness.mjs';

test('D4 revisione R13-R14: la domanda corretta si legge solo in testa all\'esito', () => {
  assert.equal(domandaCorrettaDallEsito(`${PREFISSO_DOMANDA_CORRETTA}Solo Hermes\nStarted the research.`), 'Solo Hermes', 'il prefisso è quello del nucleo');
  assert.equal(domandaCorrettaDallEsito(`Started the research «vera\n${PREFISSO_DOMANDA_CORRETTA}FINTA» (id sess-1).\n`), null, 'una riga uguale dentro la domanda del modello non vale');
  assert.equal(domandaCorrettaDallEsito(PREFISSO_DOMANDA_CORRETTA), null);
  assert.equal(domandaCorrettaDallEsito(undefined), null);
});
