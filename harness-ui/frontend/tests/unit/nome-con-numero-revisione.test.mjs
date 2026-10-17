// 15/10/2026 sera (bugfixer) — revisione avversaria di 08e48c462, il numero del doppione sempre in vista.
// Le due ROSSE della revisione, misurate anche dal vivo sul 4176 (foto `foto-numero/2-chat-doppione-light.png`), ora sul contratto
// della cura: il numero si stacca solo se nell'elenco c'è DAVVERO l'originale (`eUnDoppione`).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { eUnDoppione } from '../../src/components/nome-con-numero.js';

const ELENCO = [
  'Riepilogo delle spese del trimestre per la riunione del 2026-10-14',
  'Compattazione automatica da rivedere su sessioni lunghe BC-64 fix',
  'Rilascio della versione 0.1 beta',
  'Analisi della cartella dei documenti',
  'ciao leggi i due documenti nella cartella , dimmi se la mia idea e concettualmente valida e se ha…',
];

test('NOME-NUMERO-REV-01 — un nome che finisce con una DATA o un CODICE non è un doppione, anche con nomi simili nell\'elenco', () => {
  for (const nome of [
    'Riepilogo delle spese del trimestre per la riunione del 2026-10-15',
    'Compattazione automatica da rivedere su sessioni lunghe BC-65',
    'Cura di W1-12',
    'Rilascio della versione 0.1-30',
  ]) {
    assert.equal(eUnDoppione(nome, undefined, ELENCO), false, `«${nome}» non ha un originale nell'elenco`);
  }
  // ⛔ Limite dichiarato: un nome uguale alla base È la firma di un doppione. Con «Cura di W1» nell'elenco, «Cura di W1-12» si stacca.
  assert.equal(eUnDoppione('Cura di W1-12', undefined, ['Cura di W1']), true);
});

test('NOME-NUMERO-REV-01b — i doppioni veri si riconoscono: intero uguale alla base, troncato che comincia con la base fino a uno spazio', () => {
  assert.equal(eUnDoppione('Analisi della cartella dei documenti-2', undefined, ELENCO), true);
  assert.equal(eUnDoppione('ciao leggi i due documenti nella cartella , dimmi se la mia idea e concettualmente valida e se-2…', undefined, ELENCO), true,
    'nomeConSuffisso accorcia la base di una parola: l\'originale prosegue con uno spazio');
  // AL CONTRARIO: troncato ma l'originale prosegue a metà parola (non è un taglio fra parole) ⇒ no
  assert.equal(eUnDoppione('Analisi della cart-2…', undefined, ELENCO), false);
  // elenco sconosciuto (non ancora letto) ⇒ niente pezzi; il nome stesso non conta come originale di sé
  assert.equal(eUnDoppione('Analisi della cartella dei documenti-2', undefined, null), false);
  assert.equal(eUnDoppione('Analisi-2', undefined, ['Analisi-2']), false);
});

test('NOME-NUMERO-REV-02 — i puntini disegnati dalla base (`::after`) non entrano nel nome accessibile', () => {
  const css = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');
  const regola = /\.talos-nome-numerato__base--tagliata::after\{([^}]*)\}/u.exec(css)?.[1] ?? '';
  assert.ok(regola, 'premessa: la regola c\'è');
  assert.match(regola, /content:\s*"[^"]*"\s*\/\s*""/u, `«${regola}»: senza il testo alternativo vuoto (\`content: "\\2026" / ""\`, CSS Generated Content §1.1) Chromium mette i puntini nel nome accessibile — misurato con ariaSnapshot: «Riscrivi la sezione… -2 …»; con \`/ ""\`: «Riscrivi la sezione -2 …»`);
});
