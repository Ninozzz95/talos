/*
 * F6 della revisione 9 della CLI (23/10/2026): la stima a 4 caratteri per token sottostimava di 4 volte il testo cinese, giapponese e
 * coreano (`review613-9/p3.json`: 30.000 caratteri CJK stimati ~7.500 token, veri ~30.000). La regola N non scattava, il fornitore
 * rispondeva 400, e il messaggio rifiutato restava nella storia a far pagare riassunti e altri 400 ai giri dopo.
 * La cura, come Hermes (`agent/model_metadata.py:2342-2366`): un token per punto di codice CJK/Hangul/Kana, byte UTF-8 / 4 per il resto
 * del testo non ASCII, l'ASCII com'era. Fornitore finto via `fetchDiRete`, cartelle temporanee, nessuna porta.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosLavora as talosLavoraVero } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaToken, stimaTokenConversazione } from '../src/kernel/talosHarness.mjs';
import { CODICE_RICHIESTA_TROPPO_GRANDE } from '../src/kernel/richiesta-troppo-grande.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const talosLavora = (input) => talosLavoraVero({ scartoMisurato: 0, ...input });

test('CJK-STIMA-01 — un token per carattere CJK, Hangul o Kana; byte UTF-8 / 4 per il resto del non ASCII; l\'ASCII com\'era', () => {
  assert.equal(stimaToken('中'.repeat(1_000)), 1_000, 'ideogrammi: uno per carattere');
  assert.equal(stimaToken('한국어'.repeat(100)), 300, 'Hangul');
  assert.equal(stimaToken('ひらがなカタカナ'.repeat(10)), 80, 'Kana');
  assert.equal(stimaToken('ＡＢＣ'), 3, 'forme a larghezza piena');
  assert.equal(stimaToken('привет'.repeat(100)), 300, 'cirillico: 2 byte per carattere ⇒ caratteri / 2');
  assert.equal(stimaToken('中'.repeat(10) + 'abcd'.repeat(10)), 10 + 10, 'misto: 10 ideogrammi + 40 caratteri ASCII');
  /* AL CONTRARIO: l'ASCII non cambia di un token, e nemmeno quasi l'italiano accentato */
  for (const s of ['', 'a', 'abcd', 'abcde', 'x'.repeat(4_001)]) assert.equal(stimaToken(s), Math.ceil(s.length / 4), JSON.stringify(s.slice(0, 8)));
  /* una frase italiana normale (un accento ogni ~70 caratteri): i byte la muovono di poco, come il francese di Hermes (1,02 → 1,03) */
  const italiano = 'Il progetto tiene una cartella per ogni sessione, e la città non c\'entra niente con i file. '.repeat(200);
  const prima = Math.ceil(italiano.length / 4);
  assert.ok(stimaToken(italiano) > prima && stimaToken(italiano) - prima <= prima * 0.03, `l'italiano si muove meno del 3% (${prima} → ${stimaToken(italiano)})`);
  assert.equal(stimaToken(null), 0);
  assert.equal(stimaToken('\ud800'), 1, 'un surrogato solo non lancia');
  assert.equal(stimaTokenConversazione([{ role: 'user', content: '中'.repeat(30_000) }]), 30_000);
});

function fornitore() {
  const corpi = [];
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    corpi.push(corpo);
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: stimaTokenConversazione(corpo.messages), completion_tokens: 1 } });
  };
  return { fetchDiRete, corpi };
}

test('CJK-REGOLA-N-01 — il caso della CLI (p3): 30.000 caratteri CJK su una finestra da 16.384 non partono — REQUEST_TOO_LARGE prima di ogni chiamata, il messaggio fuori dalla storia del giro; AL CONTRARIO 3.000 partono', async (t) => {
  const corsa = async (richiesta) => {
    const cartella = cartellaDiProva('talos-cjk-');
    const copie = cartellaDiProva('talos-cjk-incollati-');
    t.after(() => { rimuoviCartellaDiProva(cartella); rimuoviCartellaDiProva(copie); });
    const f = fornitore();
    let errore = null;
    let esito = null;
    try {
      esito = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, finestraToken: 16_384, cartellaIncollati: copie,
        messaggiIniziali: [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: richiesta }], contestoDelProgetto: 'Project files:\n', fetchDiRete: f.fetchDiRete });
    } catch (e) { errore = e; }
    return { f, errore, esito };
  };
  const grande = '请检查这个日志并告诉我哪里出了问题。'.repeat(1_700); // 30.600 caratteri CJK
  const fermo = await corsa(grande);
  assert.equal(fermo.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `${fermo.errore?.code}: ${fermo.errore?.message}`);
  assert.equal(fermo.errore.dati.fonte, 'stima');
  assert.ok(fermo.errore.dati.tokensRichiesta >= 30_000, `stimato come il vero (${fermo.errore.dati.tokensRichiesta})`);
  assert.equal(fermo.f.corpi.length, 0, 'nessuna chiamata');
  assert.ok(Array.isArray(fermo.errore.messaggiDelGiro) && !JSON.stringify(fermo.errore.messaggiDelGiro).includes('请检查'), 'il messaggio non resta nella storia del giro');
  const piccolo = await corsa('请检查这个日志并告诉我哪里出了问题。'.repeat(170));
  assert.equal(piccolo.errore, null, `AL CONTRARIO: 3.060 caratteri partono (${piccolo.errore?.message})`);
  assert.equal(piccolo.f.corpi.length, 1);
});
