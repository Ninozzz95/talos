import assert from 'node:assert/strict';
import test from 'node:test';

import { createShortcutManager, normalizeShortcut } from '../../src/ui/shortcut-manager.js';

test('PHASE2-OVERLAY-FOCUS-07 shortcut normalization maps Mod by platform', () => {
  assert.equal(normalizeShortcut('Mod+K', 'mac'), 'Meta+K');
  assert.equal(normalizeShortcut('Mod+K', 'windows'), 'Control+K');
});

test('PHASE2-OVERLAY-FOCUS-07 printable shortcuts do not hijack text fields', () => {
  let listener;
  const target = {
    addEventListener(_type, value) { listener = value; },
    removeEventListener() { listener = null; },
  };
  const manager = createShortcutManager({ target, platform: 'windows' });
  const seen = [];
  manager.register('K', () => seen.push('plain'));
  manager.register('Mod+K', () => seen.push('mod'));
  listener({ key: 'k', target: { tagName: 'INPUT' }, preventDefault() {}, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
  listener({ key: 'k', target: { tagName: 'INPUT' }, preventDefault() {}, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false });
  assert.deepEqual(seen, ['mod']);
  manager.destroy();
  assert.equal(listener, null);
});

