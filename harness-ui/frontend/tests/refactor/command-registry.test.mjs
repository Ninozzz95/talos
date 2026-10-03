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
  // 03/10/2026: il motivo è una chiave del dizionario (area `comandi`); la voce italiana dice la stessa cosa di prima.
  assert.equal(commandDisabledReason(command, empty), 'comandi.reason.openSessionFirst');
  assert.equal(t(commandDisabledReason(command, empty)), 'Apri prima una sessione.');
  assert.equal(commandDisabledReason(command, idle), null);
  assert.equal(commandDisabledReason(command, busy), command.requirement === 'idle-session' ? 'comandi.reason.waitForRun' : null);
  if (command.requirement === 'idle-session') assert.equal(t(commandDisabledReason(command, busy)), 'Attendi la fine dell’esecuzione.');
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
  assert.equal(result.length, 1); assert.equal(t(result[0].disabledReason), 'Apri prima una sessione.');
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
test('NAV-02: the label is searched in both languages, whatever the UI language (03/10/2026, area `comandi`)', () => {
  impostaLingua('en');
  try {
    assert.ok(findCommands('libreria', empty, t).some(item => item.command.id === 'library'), 'Italian label with the UI in English');
    assert.equal(t(findCommands('Library', empty, t)[0].command.label), 'Library and documents');
  } finally { impostaLingua('it'); }
  assert.ok(findCommands('documents', empty).some(item => item.command.id === 'library'), 'English label with the UI in Italian');
  assert.ok(!/^comandi\./u.test(t(commandById('library').label)), 'never a raw key');
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
/*
 * 23/09/2026, decisione owner — il comando «providers» e l'azione `openProviders` aprivano
 * «Account» (un difetto), «Collega un modello» apriva il velo «Fornitori e accessi» (tolto).
 * Ogni strada ora passa dalla stessa funzione, e quella funzione atterra su Laboratorio modelli →
 * scheda «Provider». Questa è la metà statica; la metà viva è `tests/browser/velo-fornitori.spec.mjs`.
 */
test('NAV-02: every provider entry point lands on Model laboratory → Provider, never on Account or the removed velo', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const corpo = /function apriProviderDelLaboratorio\(\) \{([\s\S]*?)\n  \}/.exec(app)?.[1] ?? '';
  assert.match(corpo, /setView\('settings', \{ dallInizio: true \}\);\s*setSettingsSection\('models'\);\s*setModelLabSection\('providers'\);/);
  assert.match(app, /case 'providers': apriProviderDelLaboratorio\(\); break;/);
  assert.match(app, /openProviders: apriProviderDelLaboratorio,/);
  assert.match(app, /\[TESTI_MESSAGGIO\.collegaModello, apriProviderDelLaboratorio\]/);
  assert.doesNotMatch(app, /case 'providers':[^\n]*setSettingsSection\('account'\)/);
  // Il CODICE del velo è sparito (le note datate che lo nominano restano, e non contano).
  assert.doesNotMatch(app, /\$\('#veloFornitori'\)|popolaVeloFornitori\(|apriFornitoreDelVelo\(|apriVeloMockup\('veloFornitori'\)|id === 'veloFornitori'/);
  assert.equal(t(commandById('providers').description), 'Chiavi e indirizzi dei fornitori, nel Laboratorio modelli.');
});
