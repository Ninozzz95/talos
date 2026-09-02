import assert from 'node:assert/strict';
import test from 'node:test';

import { TALOS_DESKTOP_ROUTES, normalizeRoute, routeHref } from '../../src/contracts/routes.js';

test('le route desktop sono esplicite e normalizzate', () => {
  assert.deepEqual([...TALOS_DESKTOP_ROUTES], ['chat', 'diff', 'terminal', 'browser', 'dashboard', 'automations', 'settings']);
  assert.equal(normalizeRoute('#/terminal'), 'terminal');
  assert.equal(normalizeRoute('sconosciuta'), 'chat');
  assert.equal(routeHref('settings'), '#/settings');
});
