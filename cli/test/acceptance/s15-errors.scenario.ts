/**
 * s15 — R2 lane E: every provider failure frame says what happened · what to do · where to look, in English, with the code
 * once (gate E6/E7, Q-R2-4, review D-05/D-06). One turn per status the fake provider can return (401, 403, 404, 429, 500).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertEnglishOnly} from './checks.ts';
import {looksItalian} from '../../src/i18n/kernel-map.ts';
import {stage,toComposer,turn} from './harness.ts';
import type {TerminalSession} from './terminal.ts';

const s=stage({name:'s15',files:{'README.md':'# demo\n'}});
let t:TerminalSession;
const tails=new Map<string,string>();

/** The rows the turn added below the person's prompt: where the failure is written. */
/* the mockup's prompt row is ` › <prompt>` on the band */
function tailAfter(lines:readonly string[],prompt:string){const at=lines.map(line=>line.trim()).lastIndexOf(`› ${prompt}`);return lines.slice(Math.max(0,at)).join('\n');}

test('s15 · TALOS opens at the composer',async()=>{
  t=s.launch([],{cols:120,rows:40});
  await toComposer(t);
});

/* 401 and 403 last: a refused key is benched by the kernel, and later turns of the same provider would not reach it. */
for(const status of ['404','429','500','401','403']){
  test(`s15 · HTTP ${status} ends the turn with an English three-part error`,async()=>{
    const prompt=`ERR${status} please`;
    const end=await turn(t,s.fake,prompt);
    const tail=tailAfter(end.lines,prompt);tails.set(status,tail);
    assertEnglishOnly(tail);
    // The shared word list is lane D's; this scenario also applies lane E's own guard, line by line (kernel notices included).
    assert.deepEqual(tail.split('\n').filter(line=>looksItalian(line)),[],`Italian on the error frame:\n${tail}`);
    const details=tail.split('\n').filter(line=>/Details: /u.test(line));
    assert.ok(details.length>=1,`no "Details:" line (the code and where to look):\n${tail}`);
    const code=/\(([A-Z][A-Z0-9_]+)\)/u.exec(details.join(' '))?.[1];
    assert.ok(code,`no code in the details line:\n${tail}`);
    assert.equal(tail.split(code!).length-1,1,`the code ${code} is not printed exactly once:\n${tail}`);
    assert.match(tail,/talos (provider|doctor|logs|model)|\/model/u,`no "where to look" or next command:\n${tail}`);
  });
}

test('s15 · the rate limit says to wait or try again; a server error blames the provider, not the person',()=>{
  assert.match(tails.get('429')??'',/wait|try again/iu);
  assert.match(tails.get('500')??'',/provider/iu);
  assert.doesNotMatch(tails.get('403')??'',/key is (wrong|invalid)|invalid key/iu,'E7: a 403 never says the key is wrong');
});

test('s15 · close',async()=>{await t.close();});
