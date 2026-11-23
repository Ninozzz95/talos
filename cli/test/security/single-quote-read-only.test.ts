/*
 * 0.7.0 (row 216): on Windows cmd.exe and the programs it starts take a single quote as a plain character, while the evaluator reads it
 * as a quote. Where a blank (space or tab) stands between single quotes, or after an unclosed one, the words a program receives are not
 * the ones the evaluator judged: such a line of a read-only command asks, with or without a verb-only rule. Without a blank inside the
 * quotes the words are the same, and the line stays free. Windows only; nothing runs: the evaluator only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

const WINDOWS=process.platform==='win32';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'talos-single-quote-'));
fs.writeFileSync(path.join(root,'a.txt'),'x\n');
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const decide=async(command:string,allow:string[])=>(await createPermissionEngine({projectRoot:root,rules:{allow,ask:[],deny:[]}}).decide({tool:'Bash',command},{interactive:true,mode:'default',sessionId:'s'})).kind;
const verbRule=(command:string)=>[`Bash(${command.split(' ')[0]}:*)`];

const NOT_ALLOWED=[
  "rg x' --pre=calc '",
  "rg x' ..\\..\\segreto.txt '",
  "findstr x' /f:..\\..\\elenco.txt '",
  "findstr x' ..\\..\\segreto.txt '",
  ...['cat','head','tail','grep','wc','diff','stat'].map(verb=>`${verb} x' ..\\..\\segreto.txt '`),
  "du x' ..\\.. '",
  "ls x' ..\\.. '",
  "sed -n 1p x' ..\\..\\segreto.txt '",
  "cat x'\t..\\..\\segreto.txt '",// a tab splits too
  "cat x' ..\\..\\segreto.txt",// an unclosed quote
];
/* as today: cmd's own type and dir already ask (cmd-reading.ts); more is no read-only command, so only a rule naming it lets it pass */
const AS_TODAY:[string,string[],'allow'|'ask'][]=[
  ["type x' ..\\..\\segreto.txt '",[],'ask'],["type x' ..\\..\\segreto.txt '",['Bash(type:*)'],'ask'],
  ["dir x' ..\\.. '",[],'ask'],["dir x' ..\\.. '",['Bash(dir:*)'],'ask'],
  ["more x' ..\\..\\segreto.txt '",[],'ask'],["more x' ..\\..\\segreto.txt '",['Bash(more:*)'],'allow'],
];
const STAY_FREE=[
  "rg 'x'",
  "grep -n 'TODO' a.txt",
  "cat 'a.txt'",
  'findstr /s "x y" a.txt',
  'type a.txt',
  'dir',
];

test('single quote: a read-only line that cmd splits elsewhere asks, with and without a verb-only rule',{skip:!WINDOWS},async()=>{
  const allowed:string[]=[];
  for(const command of NOT_ALLOWED)for(const allow of [[],verbRule(command)])if(await decide(command,allow)==='allow')allowed.push(`${allow.length?allow[0]:'no rule'}: ${command}`);
  assert.deepEqual(allowed,[],`allowed without a card:\n${allowed.join('\n')}`);
});

test('single quote: type, dir and more are judged as today',{skip:!WINDOWS},async()=>{
  for(const [command,allow,kind] of AS_TODAY)assert.equal(await decide(command,allow),kind,`${allow[0]??'no rule'}: ${command}`);
});

test('single quote: quotes with no blank inside, and plain read-only lines, stay free',{skip:!WINDOWS},async()=>{
  const asked:string[]=[];
  for(const command of STAY_FREE)for(const allow of [[],verbRule(command)])if(await decide(command,allow)!=='allow')asked.push(`${allow.length?allow[0]:'no rule'}: ${command}`);
  assert.deepEqual(asked,[],`asks now:\n${asked.join('\n')}`);
});
