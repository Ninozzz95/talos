// BOLLA-03 (02/11/2026, owner sceglie B: le schede dei file sopra la bolla con «tipo · peso · token»): il peso del file (`byte`) deve
// sopravvivere al passaggio dal server, sennò dopo una ricarica la scheda perde il peso. Stessa regola di `caratteri`: intero ≥ 0, se no via.
import assert from 'node:assert/strict'
import test from 'node:test'

import { bollaValida } from '../src/bolla-della-persona.mjs'

const allegato = (extra) => ({ tipo: 'testo', nome: 'nota.txt', percorso: 'C:\\progetto\\allegati\\nota.txt', ...extra })
const primo = (a) => bollaValida({ testo: 'guarda', allegati: [a] })?.allegati?.[0]

test('BOLLA-03 the file size (byte) survives the server, like caratteri', () => {
  assert.equal(primo(allegato({ byte: 2048 })).byte, 2048)
  assert.equal(primo(allegato({ byte: 0 })).byte, 0)
})

test('BOLLA-03 a size that is not a non-negative safe integer is dropped, the rest stays', () => {
  for (const cattivo of [-1, 1.5, '2048', Number.MAX_SAFE_INTEGER + 1, NaN, null, {}]) {
    const a = primo(allegato({ byte: cattivo }))
    assert.equal(a.nome, 'nota.txt')
    assert.equal('byte' in a, false, `byte=${String(cattivo)} doveva sparire`)
  }
})
