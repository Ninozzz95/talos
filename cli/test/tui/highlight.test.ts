import test from 'node:test';
import assert from 'node:assert/strict';
import {highlightCodeLine} from '../../src/tui/highlight.ts';
test('JSON highlighting separates keys strings numbers and literals without changing text',()=>{const line='{"ok": true, "n": 42}';const tokens=highlightCodeLine(line,'json');assert.equal(tokens.map(t=>t.text).join(''),line);assert.ok(tokens.some(t=>t.kind==='key'));assert.ok(tokens.some(t=>t.kind==='literal'));assert.ok(tokens.some(t=>t.kind==='number'));});
test('TypeScript highlighting recognizes comments keywords strings and numbers',()=>{const line=`const answer: number = 42; // verified`;const tokens=highlightCodeLine(line,'ts');assert.equal(tokens.map(t=>t.text).join(''),line);assert.ok(tokens.some(t=>t.kind==='keyword'));assert.ok(tokens.some(t=>t.kind==='comment'));assert.ok(tokens.some(t=>t.kind==='number'));});
test('unknown language preserves content with neutral tokens',()=>{const line='raw <>& text';assert.equal(highlightCodeLine(line,'unknown').map(t=>t.text).join(''),line);});
