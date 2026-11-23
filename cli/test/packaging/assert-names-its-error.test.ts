/*
 * 08/10/2026, an observation of the desktop's bugfixer (ASSERT-ERRORE ratchet in harness-ui/tests/assert-errore-cricchetto.test.mjs): an `assert.throws(fn)` or
 * `assert.rejects(promise)` without the expected error passes with ANY error, even the ReferenceError of a function that was never imported - the test is green
 * for the wrong reason. It happened to the CLI's copy of a kernel test the same day (a quarantine test that never wrote its header). Nine CLI tests did it; each
 * now names its error. This keeps the count at zero. The census is the desktop's (the string/comment/regex mask and the comma counter), pointed at the CLI's
 * test folder and at .ts files (theirs only reads .js/.mjs).
 */
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const census:any=await import('../../../harness-ui/tests/aiuto/censimento-assert-errore.mjs');
const TESTS=fileURLToPath(new URL('..',import.meta.url));

function* testFiles(folder:string):Generator<string>{
  for(const entry of readdirSync(folder,{withFileTypes:true})){
    const path=join(folder,entry.name);
    if(entry.isDirectory()){if(!/^(node_modules|dist|fixtures)$/u.test(entry.name))yield*testFiles(path);}
    else if(/\.test\.(?:m?js|ts)$/u.test(entry.name))yield path;
  }
}
function bareCalls(source:string):number{
  const masked:string=census.mascheraStringheECommenti(source);
  let bare=0;
  for(const match of masked.matchAll(/\bassert\.(?:throws|rejects)\s*\(/gu))if(census.virgoleDiPrimoLivello(masked,match.index+match[0].length)===0)bare+=1;
  return bare;
}

test('the census tells a bare assert.throws/rejects from one that names its error',()=>{
  assert.equal(bareCalls('assert.throws(()=>f());'),1);
  assert.equal(bareCalls('await assert.rejects(()=>readFile(path));'),1);
  assert.equal(bareCalls('assert.throws(()=>f(),/boom/u);'),0);
  assert.equal(bareCalls('await assert.rejects(()=>readFile(path),{code:"ENOENT"});'),0);
  assert.equal(bareCalls('assert.throws(()=>f(1,2),TypeError);'),0,'commas inside the function do not count');
  assert.equal(bareCalls("assert.throws(()=>f('a, b'));"),1,'nor commas inside a string');
  assert.equal(bareCalls('// assert.throws(()=>f())\nassert.equal(1,1);'),0,'nor a call in a comment');
});

test('no test of the CLI passes an assert.throws/rejects without saying which error it expects',()=>{
  const offenders:string[]=[];
  for(const file of testFiles(TESTS)){
    const bare=bareCalls(readFileSync(file,'utf8'));
    if(bare>0)offenders.push(`${relative(TESTS,file).split(sep).join('/')}: ${bare}`);
  }
  assert.deepEqual(offenders,[],`assert.throws/rejects without the expected error (they pass even with a ReferenceError): ${offenders.join('; ')}`);
});
