/*
 * R2 gate E10 (d): the acceptance word list is derived from the gate's inventory (§1.0, §1.3, §9): the 8 Italian kernel
 * tool names, the 11 Italian argument keys, `giri`, `detto`, `modello` and the Italian-only words of the §1.0 lexicon.
 * The exit "no Italian word on any acceptance frame" is only as strong as this list, and a list that flags English
 * words or ids would make every frame red; both directions are pinned here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {ITALIAN_WORDS,italianOn} from '../acceptance/checks.ts';

const TOOL_NAMES=['elenca','cerca','leggi','scrivi','prova','naviga','delega_sottotask','carica_skill'];
const ARGUMENT_KEYS=['percorso','contenuto','comando','descrizione','testo','nome','titolo','cartella','parte','affermazioni','fonti'];
const GATE_WORDS=['giri','detto','modello','non','della','fornitore','chiave','sessione','nessuna','può'];

test('R2 E10(d): the 8 tool names, the 11 argument keys and the gate words are in the list and caught as whole words',()=>{
  for(const word of [...TOOL_NAMES,...ARGUMENT_KEYS,...GATE_WORDS]){
    assert.ok(ITALIAN_WORDS.includes(word),`"${word}" is missing from ITALIAN_WORDS`);
    assert.deepEqual(italianOn(`Tool · ${word} · completed`).filter(found=>found===word),[word],`"${word}" is not caught on a frame`);
  }
});

test('R2 E10(d): kernel sentences seen on review frames are caught',()=>{
  assert.ok(italianOn('⛔ giri esauriti: 24 su 24 usati senza chiudere il task.').includes('giri'));
  assert.ok(italianOn('leggi · completed / args {"percorso":"README.md"}').includes('percorso'));
  assert.ok(italianOn('"result":{"detto":"ok"}').includes('detto'));
  assert.ok(italianOn('Writer: modello (persisted)').includes('modello'));
  assert.ok(italianOn('Manca la chiave del fornitore scelto.').includes('chiave'));
  assert.ok(italianOn('la sessione è in sola lettura').includes('sessione'));
});

test('R2 E10(d): English words, compounds, paths and ids are not flagged',()=>{
  const english=[
    'Terminal too small — need 40×12','• main · ready · model openai:gpt-5-mini','mode default · Shift+Tab cycle',
    'non-interactive run · non-zero exit','Usage: /automations serve','Del removes the character','Come back later, per session',
    'solo mode · the owner file · prima facie','C:\\Users\\me\\AppData\\Local\\Temp\\talos-acceptance-s05-nome12\\giro-1',
    'session 3f2a-dei0-9c1e · a1b2c3','Rate limit: try again in 7 s','Provider · OpenRouter · key saved · cloud',
  ];
  for(const text of english)assert.deepEqual(italianOn(text),[],`false positive on ${JSON.stringify(text)}`);
});
