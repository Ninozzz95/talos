import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, commandById, commandDisabledReason, findCommands, nextCommandIndex, normalizeCommandQuery } from '../../src/services/commands/registry.ts';
import { SCREEN_BY_VIEW } from '../../src/domain/navigation.ts';
import { SCORCIATOIE, riconosci } from '../../src/components/scorciatoie.js';
import { traduzioniMancanti, impostaLingua, t } from '../../src/components/lingua.js';
import WORKSPACE_EN from '../../src/i18n/workspace-en.js';
const empty = { sessionId: null, running: false };
const idle = { sessionId: 'session-real', running: false };
const busy = { sessionId: 'session-real', running: true };
test('NAV-02: stable unique command ids, all routes real and no first-run command', () => {
  assert.equal(COMMANDS.length, 30);
  assert.equal(new Set(COMMANDS.map(c => c.id)).size, COMMANDS.length);
  for (const command of COMMANDS) {
    assert.match(command.id, /^[a-z][a-z-]*$/);
    assert.ok(command.label && command.description && command.group && command.icon);
    if (command.view) assert.ok(Object.hasOwn(SCREEN_BY_VIEW, command.view));
    assert.ok(!/intro|wizard/.test(command.id));
    assert.ok(Object.isFrozen(command));
  }
  assert.equal(commandById('__proto__'), undefined);
});
for (const command of COMMANDS.filter(c => c.requirement)) test(`NAV-02: ${command.id} requires an actual session`, () => {
  assert.equal(commandDisabledReason(command, empty), 'Apri prima una sessione.');
  assert.equal(commandDisabledReason(command, idle), null);
  assert.equal(commandDisabledReason(command, busy), command.requirement === 'idle-session' ? 'Attendi la fine dell’esecuzione.' : null);
});
for (const [query, id] of [['attivita', 'tasks'], ['attività', 'tasks'], ['tasks', 'tasks'], ['gguf locale', 'models'], ['local download', 'models'], ['api chiavi', 'providers'], ['share snapshot', 'share'], ['settings', 'settings'], ['home', 'home']]) test(`NAV-02: search ${query}`, () => {
  assert.ok(findCommands(query, empty).some(item => item.command.id === id));
});
test('NAV-02: exact match ranking and safe unsupported/empty searches', () => {
  assert.equal(findCommands('Home', empty)[0].command.id, 'home');
  assert.equal(findCommands('  ', empty).length, COMMANDS.length);
  assert.equal(findCommands('not-a-real-command', empty).length, 0);
  assert.equal(findCommands('<script>alert(1)</script>', empty).length, 0);
  assert.equal(normalizeCommandQuery('  ÀTTIVITÀ\t REALI '), 'attivita reali');
  assert.ok(normalizeCommandQuery('x'.repeat(10000)).length <= 512);
});
test('NAV-02: search does not silently hide unavailable commands', () => {
  const result = findCommands('esporta', empty);
  assert.equal(result.length, 1); assert.equal(result[0].disabledReason, 'Apri prima una sessione.');
});
test('NAV-02: every advertised shortcut is registered, no decorative hotkeys', () => {
  for (const command of COMMANDS.filter(c => c.shortcut)) assert.ok(SCORCIATOIE.some(s => s.combo === command.shortcut));
});
test('NAV-02: every command and every added workspace string has English coverage', () => {
  assert.deepEqual(traduzioniMancanti('en', COMMANDS.flatMap(c => [c.label,c.description,c.group])), []);
  assert.deepEqual(traduzioniMancanti('en', Object.keys(WORKSPACE_EN)), []);
  impostaLingua('en');
  try { assert.equal(findCommands('Tasks', empty, t)[0].command.id, 'tasks'); }
  finally { impostaLingua('it'); }
});
test('NAV-02: empty results and arrow wrap have deterministic selection', () => {
  assert.equal(nextCommandIndex(0, 0, 1), -1);
  assert.equal(nextCommandIndex(3, -1, -1), 2);
  assert.equal(nextCommandIndex(3, -1, 1), 0);
  assert.equal(nextCommandIndex(3, 2, 1), 0);
  assert.equal(nextCommandIndex(3, 0, -1), 2);
});
for (const patch of [{isComposing:true}, {key:'Process'}, {keyCode:229}, {defaultPrevented:true}, {target:{closest:selector => selector === '.xterm' ? {} : null}}]) test(`NAV-02: global shortcuts preserve composition, consumed events and terminal ${Object.keys(patch)[0]}`, () => {
  assert.equal(riconosci({ key:'k', ctrlKey:true, ...patch }, {apple:false}), null);
});
