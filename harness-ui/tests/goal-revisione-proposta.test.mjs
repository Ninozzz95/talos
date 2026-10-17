/*
 * ⛔ REVISIONE AVVERSARIA del /goal G2c (bugfixer, 14/10/2026) — la PROPOSTA dei criteri: `src/obiettivo/proposta.mjs`.
 *
 * Prove ROSSE apposta sul codice di `feat/goal` (testa `c671bf3b1`); la cura non è qui.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-2026-10-14.md`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { propostaDallaRisposta } from '../src/obiettivo/proposta.mjs';

const OGGETTO = JSON.stringify({ criteria: [{ type: 'command', text: 'I test passano', command: 'npm test' }] });

test('REV-GOAL-09 (S4) — «prose around the object still gives the criteria» fails as soon as the prose has a brace: the answer becomes the floor', () => {
  /* `leggiCriteriProposti` prende dalla PRIMA `{` all'ULTIMA `}`. Una graffa nella frase prima (un ragionamento lasciato nel testo,
     tipico dei motori locali che stampano `<think>` nel contenuto) o dopo (una nota) e il pezzo non è più JSON: pavimento
     «proposal-unreadable» su una risposta che contiene, intatto, l'oggetto chiesto. PROP-02 lo promette per la prosa. */
  const casi = [
    `<think>The project uses {npm test}, so a command fits.</think>\n${OGGETTO}`,
    `${OGGETTO}\nNote: the script is defined as {"test": "node --test"} in package.json.`,
    `Here is the contract for {goal}:\n\`\`\`json\n${OGGETTO}\n\`\`\``,
  ];
  const pavimenti = casi.map((risposta, indice) => [indice + 1, propostaDallaRisposta(risposta)]).filter(([, p]) => p.pavimento).map(([n, p]) => `${n}:${p.motivo}`);
  assert.deepEqual(pavimenti, [], 'the asked object is there, whole, and the person gets the floor');
});

test('REV-GOAL-10 (S3) — a criterion that passes when the command FAILS is kept like any other: green by construction, and nothing marks it for the person', () => {
  /* Il contratto rifiuta «&&» quando si aspetta un errore perché «non si saprebbe quale membro è fallito» (`esitoAttribuibile`).
     Lo stesso vale per UN comando che si aspetta un errore: passa per QUALUNQUE errore — uno script che non esiste (npm esce 1),
     un comando che non esiste (PowerShell esce 1). Un modello che indovina, o un'istruzione nel preambolo del progetto, può
     proporre un criterio verde per costruzione, e la proposta lo tiene senza dirlo. Idem `!` di bash, che inverte l'esito. */
  const risposta = JSON.stringify({ criteria: [
    { type: 'command', text: 'Il vecchio script di build non esiste più', command: 'npm run build-legacy-that-was-never-there', exit_code: 1 },
    { type: 'command', text: 'Il controllo dei tipi non trova errori', command: '! npm run typecheck' },
    { type: 'command', text: 'I test passano', command: 'npm test' },
  ] });
  const proposta = propostaDallaRisposta(risposta);
  const tenutiCheAspettanoUnErrore = proposta.criteri.filter((criterio) => criterio.verifica.uscita !== 0 || criterio.verifica.comando.startsWith('!'));
  assert.deepEqual(tenutiCheAspettanoUnErrore.map((criterio) => criterio.id), [], 'kept silently: green whenever the command fails for any reason');
});
