import test from 'node:test';
import assert from 'node:assert/strict';
import { citaUnaFonte } from '../scripts/cancello/regole-vincolanti.mjs';

/*
 * 17/09/2026 — il cancello dei commit riconosceva una ricerca solo nelle forme ITALIANE («Fonte:», «letto il»,
 * «misurato»), mentre dal 14/09 i messaggi di commit sono in inglese per regola dell'owner: un agente col
 * messaggio giusto e le fonti datate si è visto negare il commit («non cita né una fonte con la data né una
 * misura»). Qui le forme inglesi che una persona scrive davvero devono passare, e un messaggio senza niente
 * deve ancora essere respinto — nei due versi, perché un cancello che passa tutto non è un cancello.
 */
const PASSANO = [
  'Source: Microsoft Learn, "Basic commands for WSL", read 17/09/2026',
  'Sources cited in the lane comments: MDN margin (read on 16/09/2026)',
  'Measured on the base commit: 49 failed, 16 passed',
  'proven live on a fake PTY with clipboard permissions',
  'Research of 17/09/2026: Codex CLI chooses the shell once, never per command',
  'Fonte: Open Group Base Specifications, letto il 17/09/2026',
  'misurato sul banco',
  'see https://learn.microsoft.com/en-us/windows/wsl/basic-commands',
];
const NON_PASSANO = [
  'fix: the panel is wider now',
  'docs: update the roadmap',
  'Measure everything twice',            // «measure» non è «measured»: nessuna misura dichiarata
  'the source of the bug was a typo',    // «source» senza i due punti non è una citazione
];

test('CANCELLO-EN-01 — le forme inglesi di fonte, data e misura passano', () => {
  for (const m of PASSANO) assert.equal(citaUnaFonte(m), true, m);
});

test('CANCELLO-EN-02 — al contrario: un messaggio senza fonte né misura resta respinto', () => {
  for (const m of NON_PASSANO) assert.equal(citaUnaFonte(m), false, m);
});
