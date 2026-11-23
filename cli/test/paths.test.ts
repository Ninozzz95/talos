import assert from 'node:assert/strict';
import test from 'node:test';
import {projectId, resolveCliPaths} from '../src/paths.ts';

test('windows keeps roaming config separate from local state', () => {
  const p = resolveCliPaths({APPDATA:'C:\\Roam', LOCALAPPDATA:'C:\\Local'}, 'win32', 'C:\\Users\\u');
  assert.equal(p.configRoot, 'C:\\Roam\\TALOS-CLI');
  assert.equal(p.sessionsRoot, 'C:\\Local\\TALOS-CLI\\sessions');
  assert.equal(p.trust.mcp, 'C:\\Local\\TALOS-CLI\\trust\\mcp');
});

test('linux honors XDG paths with home fallbacks', () => {
  const p = resolveCliPaths({}, 'linux', '/home/u');
  assert.equal(p.configRoot, '/home/u/.config/talos-cli');
  assert.equal(p.dataRoot, '/home/u/.local/state/talos-cli');
  assert.equal(p.cacheRoot, '/home/u/.cache/talos-cli');
});

test('project id is stable and case-insensitive for windows roots', () => {
  assert.match(projectId('C:\\work\\repo', 'win32'), /^[a-f0-9]{32}$/);
  assert.equal(projectId('C:\\work\\repo\\', 'win32'), projectId('c:\\work\\repo', 'win32'));
});
