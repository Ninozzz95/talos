/*
 * The kernel's cures of the permissions block (04/11/2026, RAPPORTO-CURE-PERMESSI §«Motivi nuovi»): a critical deletion card can now
 * come with `percorso: null` (`perche: 'troppo-annidato'`, a command inside more than four nested shells, failed closed as Codex
 * is_dangerous_command.rs:35-58), and with three more reasons (`cartella-del-telefono`, `dati-dell-app`, `tutti-i-progetti`). The CLI
 * draws the kernel's sentence; when a card comes without one, its own fallback said «the command deletes , a critical folder Only the
 * person…»: an empty path and no full stop. Source: Hermes tools/approval.py:563 (the reason is the pattern's description, whole).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {t} from '../../src/i18n/index.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
const card=(c:Record<string,unknown>)=>permissionActionFromApproval({azione:{tipo:'shell',toolCallId:'c',comando:'bash -c "bash -c \\"bash -c \\\\\\"bash -c rm -rf x\\\\\\"\\""',cancellazioneCritica:c}} as any);
const engine=()=>createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny:[]},mode:'bypassPermissions'} as any);
const NESTED='This command deletes something inside too many nested shells to check it first.';

test('a card too nested to read, with no path and no sentence, says so in the kernel\'s words',async()=>{
  for(const why of ['troppo-annidato','tooNested']){
    const asked:any=await engine().decide(card({percorso:null,perche:why}),{interactive:true,mode:'bypassPermissions'} as any);
    assert.equal(asked.kind,'ask');
    assert.equal(asked.reason,NESTED,why);
    const refused:any=await engine().decide(card({percorso:null,perche:why}),{interactive:false,mode:'bypassPermissions'} as any);
    assert.equal(refused.kind,'deny');
    assert.ok(refused.message.startsWith(`${NESTED} Only the person`),refused.message);
  }
});

test('a card with a path and no sentence reads as a whole sentence',async()=>{
  const asked:any=await engine().decide(card({percorso:ROOT,perche:'tutti-i-progetti'}),{interactive:true,mode:'bypassPermissions'} as any);
  assert.equal(asked.reason,`This command deletes ${ROOT}, a critical folder.`);
  const refused:any=await engine().decide(card({percorso:ROOT,perche:'tutti-i-progetti'}),{interactive:false,mode:'bypassPermissions'} as any);
  assert.ok(refused.message.includes('a critical folder. Only the person'),refused.message);
});

test('on the contrary: the kernel\'s sentence still wins, and no reason draws an empty path',async()=>{
  const SENTENCE=`This command deletes ${ROOT}, the folder that holds all your projects. Even with Full access this needs your yes, every time.`;
  assert.equal(((await engine().decide(card({percorso:ROOT,perche:'tutti-i-progetti',frase:SENTENCE}),{interactive:true,mode:'bypassPermissions'} as any)) as any).reason,SENTENCE);
  for(const why of ['cartella-del-telefono','dati-dell-app','tutti-i-progetti','qualcosa-di-nuovo']){
    const asked:any=await engine().decide(card({percorso:null,perche:why}),{interactive:true,mode:'bypassPermissions'} as any);
    assert.doesNotMatch(asked.reason,/deletes ,|deletes  /,why);
    assert.match(asked.reason,/\.$/,why);
  }
});

test('the error page names every kind of critical folder the kernel asks about',()=>{
  const what=t('error.code.CRITICAL_DELETE_NEEDS_PERSON.what');
  for(const words of ['the root of a disk','a top-level folder','your user folder','the project','a main folder of the phone',"the app's data",'the folder of all your projects','too many nested shells'])assert.ok(what.includes(words),words);
  assert.match(what,/only a person can allow that\.$/);
});

/* 0.6.16 (the permissions repair of desktop 36c386138): a command too complex to read before it runs (`perche: 'troppo-complesso'`,
   `percorso: null`) is a critical deletion card too. With no sentence, the CLI says it in the kernel's words, never «a critical folder». */
const COMPLEX='This command is too complex to read before it runs, and it may delete something.';
test('a card too complex to read, with no path and no sentence, says so in the kernel\'s words',async()=>{
  for(const why of ['troppo-complesso','tooComplex']){
    const asked:any=await engine().decide(card({percorso:null,perche:why}),{interactive:true,mode:'bypassPermissions'} as any);
    assert.equal(asked.kind,'ask');
    assert.equal(asked.reason,COMPLEX,why);
    const refused:any=await engine().decide(card({percorso:null,perche:why}),{interactive:false,mode:'bypassPermissions'} as any);
    assert.equal(refused.kind,'deny');
    assert.ok(refused.message.startsWith(`${COMPLEX} Only the person`),refused.message);
  }
  assert.ok(t('error.code.CRITICAL_DELETE_NEEDS_PERSON.what').includes('a command too complex to read first'));
});
