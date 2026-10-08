/*
 * ⛔ K4b (07/10/2026, owner: le frasi del motore locale «adesso, dentro K4b»). Il supervisore scrive in inglese, a forma
 *   stabile, i due errori che la persona legge in una carta (architettura sconosciuta, memoria della scheda piena); le
 *   sessioni salvate prima li hanno in italiano. La carta estrae i VALORI dalle due forme e scrive il perché nella lingua
 *   dell'interfaccia; se la forma non torna, mostra il testo grezzo (mai una frase inventata).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { impostaLingua } from '../../src/components/lingua.js';
import { spiegaErrore } from '../../src/components/errori.js';
import { testoArchitetturaSconosciuta } from '../../../src/motore-architetture.mjs';

const ARCH_EN = `RUNTIME_ARCH_UNSUPPORTED ${testoArchitetturaSconosciuta('spark2_5', 'b10517')}`;
const ARCH_IT = 'RUNTIME_ARCH_UNSUPPORTED Il modello usa l’architettura «spark2_5», che il motore installato (llama.cpp b10517) non sa leggere: serve una versione più recente del motore, e riprovare non cambia niente.';
const MEM_EN = 'RUNTIME_OUT_OF_MEMORY The model (15.7 GB) does not fit in the graphics card memory (Radeon RX 9070: 16.0 GB, 14.2 GB free).';
const MEM_IT = 'RUNTIME_OUT_OF_MEMORY Il modello (15,7 GB) non entra nella memoria della scheda grafica (Radeon RX 9070: 16,0 GB, liberi 14,2 GB).';

test('K4B-MOTORE-01 — architettura sconosciuta: dalle due forme del server, il perché nella lingua dell\'interfaccia', () => {
  try {
    impostaLingua('it');
    for (const grezzo of [ARCH_EN, ARCH_IT]) {
      const s = spiegaErrore(grezzo, 'RUNTIME_ARCH_UNSUPPORTED');
      assert.equal(s.perche, 'Il modello usa l’architettura «spark2_5», che il motore installato (llama.cpp b10517) non sa leggere: serve una versione più recente del motore, e riprovare non cambia niente.');
    }
    impostaLingua('en');
    for (const grezzo of [ARCH_EN, ARCH_IT]) {
      const s = spiegaErrore(grezzo, 'RUNTIME_ARCH_UNSUPPORTED');
      assert.match(s.perche, /^The model uses the architecture “spark2_5”, which the installed engine \(llama\.cpp b10517\) cannot read/u);
    }
  } finally { impostaLingua('it'); }
});

test('K4B-MOTORE-02 — memoria piena: numeri nella forma della lingua (15,7 / 15.7), parole nella lingua dell\'interfaccia', () => {
  try {
    impostaLingua('it');
    for (const grezzo of [MEM_EN, MEM_IT]) {
      const s = spiegaErrore(grezzo, 'RUNTIME_OUT_OF_MEMORY');
      assert.match(s.perche, /^Il modello \(15,7 GB\) non entra nella memoria della scheda grafica \(Radeon RX 9070: 16,0 GB, liberi 14,2 GB\)\./u);
    }
    impostaLingua('en');
    for (const grezzo of [MEM_EN, MEM_IT]) {
      const s = spiegaErrore(grezzo, 'RUNTIME_OUT_OF_MEMORY');
      assert.match(s.perche, /^The model \(15\.7 GB\) does not fit in the graphics card memory \(Radeon RX 9070: 16\.0 GB, 14\.2 GB free\)\./u);
    }
  } finally { impostaLingua('it'); }
});

/*
 * Review del bugfixer (07/10/2026): i nomi VERI delle schede hanno parentesi — «AMD Radeon(TM) 780M Graphics», «Intel(R) Arc(TM)
 *   A770 Graphics», e con Mesa su Linux il driver fra parentesi, «Radeon 8060S Graphics (RADV GFX1151)» (llama.cpp, issue #16659
 *   e #18946, lette l'08/10/2026). La regola leggeva il nome fino alla prima parentesi: la carta perdeva memoria totale e libera
 *   proprio sulle schede integrate, dove il caso è più frequente.
 */
const SCHEDE_CON_PARENTESI = ['AMD Radeon(TM) 780M Graphics', 'Intel(R) Arc(TM) A770 Graphics', 'Radeon 8060S Graphics (RADV GFX1151)'];
test('K4B-MOTORE-04 — memoria piena: il nome della scheda può avere parentesi, e la carta dice lo stesso totale e liberi', () => {
  try {
    for (const nome of SCHEDE_CON_PARENTESI) {
      const en = `RUNTIME_OUT_OF_MEMORY The model (15.7 GB) does not fit in the graphics card memory (${nome}: 8.0 GB, 0.5 GB free).`;
      const it = `RUNTIME_OUT_OF_MEMORY Il modello (15,7 GB) non entra nella memoria della scheda grafica (${nome}: 8,0 GB, liberi 0,5 GB).`;
      impostaLingua('it');
      for (const grezzo of [en, it]) {
        assert.equal(spiegaErrore(grezzo, 'RUNTIME_OUT_OF_MEMORY').perche.split(' Il motore')[0],
          `Il modello (15,7 GB) non entra nella memoria della scheda grafica (${nome}: 8,0 GB, liberi 0,5 GB).`, `${nome}, interfaccia italiana`);
      }
      impostaLingua('en');
      for (const grezzo of [en, it]) {
        assert.equal(spiegaErrore(grezzo, 'RUNTIME_OUT_OF_MEMORY').perche.split(' The engine')[0],
          `The model (15.7 GB) does not fit in the graphics card memory (${nome}: 8.0 GB, 0.5 GB free).`, `${nome}, interfaccia inglese`);
      }
    }
  } finally { impostaLingua('it'); }
});

test('K4B-MOTORE-05 — memoria piena senza la riga della scheda (il server non l\'ha letta): il perché non inventa una scheda', () => {
  try {
    impostaLingua('it');
    for (const grezzo of ['RUNTIME_OUT_OF_MEMORY The model (15.7 GB) does not fit in the graphics card memory.',
      'RUNTIME_OUT_OF_MEMORY Il modello (15,7 GB) non entra nella memoria della scheda grafica.']) {
      assert.equal(spiegaErrore(grezzo, 'RUNTIME_OUT_OF_MEMORY').perche.split(' Il motore')[0], 'Il modello (15,7 GB) non entra nella memoria della scheda grafica.');
    }
  } finally { impostaLingua('it'); }
});

test('K4B-MOTORE-03 — al contrario: una forma che non torna non inventa — resta il testo grezzo', () => {
  try {
    impostaLingua('it');
    const s = spiegaErrore('RUNTIME_ARCH_UNSUPPORTED something else entirely', 'RUNTIME_ARCH_UNSUPPORTED');
    assert.equal(s.perche, 'something else entirely');
  } finally { impostaLingua('it'); }
});
