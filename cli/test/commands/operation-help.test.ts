/*
 * `talos <family> <operation> --help` printed the family's help (measured 14/10/2026 on 07bce984a: `talos provider set-key --help`
 * answered «Usage: talos provider <operation> [options]» and the list of operations, nothing about set-key, nor its `--address`).
 * Each operation now has its own help: its usage line and its options. The family help is unchanged. The options are checked
 * against the code that reads them, so an operation's help cannot drift from what it accepts.
 */
import assert from 'node:assert/strict';import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';import {join} from 'node:path';
import {FAMILY_OPERATIONS,familyHelpText} from '../../src/commands/family-help.ts';
import {runSubcommand} from '../../src/subcommands.ts';

const CLI=join(import.meta.dirname,'..','..');
async function help(...positionals:string[]){
  const out:string[]=[];const err:string[]=[];
  const code=await runSubcommand({positionals,outputFormat:'text',verbose:false} as any,{io:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s)} as any,createRuntimeContext:async()=>{throw new Error('help must not build a runtime');}});
  return{code,out:out.join(''),err:err.join('')};
}
/* the options each operation's code reads, family by family (the same reading as family-help.test.ts) */
function optionsInCode():Record<string,Record<string,string[]>>{
  const sub=readFileSync(join(CLI,'src','subcommands.ts'),'utf8');const dispatch:Record<string,string[]>={};
  for(const m of sub.matchAll(/case'([a-z-]+)':return await (run[A-Za-z]+Command)\(/gu))(dispatch[m[2]!]??=[]).push(m[1]!);
  const out:Record<string,Record<string,string[]>>={};
  for(const f of readdirSync(join(CLI,'src','commands')).filter(x=>x.endsWith('.ts'))){
    const s=readFileSync(join(CLI,'src','commands',f),'utf8');const starts=[...s.matchAll(/export async function (run[A-Za-z]+Command)\(/gu)];
    starts.forEach((st,i)=>{
      const body=s.slice(st.index!,i+1<starts.length?starts[i+1]!.index!:s.length);const hits=[...body.matchAll(/op===?'([a-z-]+)'/gu)];
      for(const family of dispatch[st[1]!]??[]){
        const ops:Record<string,string[]>=out[family]??={};
        hits.forEach((hit,k)=>{
          const next=hits.slice(k+1).find(h=>h[1]!==hit[1]);const segment=body.slice(hit.index!,next?next.index!:hit.index!+1500);
          const found=[...segment.matchAll(/'(--[a-z-]+)'/gu)].map(m=>m[1]!);(ops[hit[1]!]??=[]).push(...found);
        });
      }
    });
  }
  return out;
}

test('`talos provider set-key --help` is set-key\'s own help, with its --address',async()=>{
  const r=await help('provider','set-key','--help');
  assert.equal(r.code,0);assert.equal(r.err,'');
  assert.match(r.out,/^Usage: talos provider set-key <provider> \[--address <address>\]$/mu,r.out);
  assert.match(r.out,/--address <address>.*plan, balance, plan-china, balance-china/u,r.out);
  assert.doesNotMatch(r.out,/Usage: talos provider <operation>|^Operations:/mu,'not the family help');
  assert.match(r.out,/talos provider --help/u,'it says where the other operations are');
});

test('`talos provider configure -h` names --address, --endpoint and --timeout',async()=>{
  const r=await help('provider','configure','-h');
  assert.equal(r.code,0);
  for(const option of ['--address <address>','--endpoint <url>','--timeout <seconds>'])assert.ok(r.out.includes(option),`${option}\n${r.out}`);
});

test('every operation of every family has its own help: its usage line, exit 0, no runtime',async()=>{
  for(const [family,operations] of Object.entries(FAMILY_OPERATIONS)){
    for(const operation of operations){
      const r=await help(family,operation,'--help');
      assert.equal(r.code,0,`${family} ${operation}`);
      assert.match(r.out,new RegExp(`^Usage: talos ${family} ${operation}(\\s|$)`,'mu'),`${family} ${operation}\n${r.out}`);
      assert.doesNotMatch(r.out,/^Operations:/mu,`${family} ${operation}: not the family list`);
    }
  }
});

test('an operation\'s help names every option its code reads (no drift)',async()=>{
  const code=optionsInCode();
  for(const [family,operations] of Object.entries(code)){
    for(const [operation,options] of Object.entries(operations)){
      if(!FAMILY_OPERATIONS[family]?.includes(operation))continue;
      const r=await help(family,operation,'--help');
      for(const option of new Set(options))assert.ok(r.out.includes(option),`${family} ${operation} reads ${option}, its help does not say it\n${r.out}`);
    }
  }
  const prune=await help('checkpoint','prune','--help');
  for(const option of ['--keep','--days','--dry-run'])assert.ok(prune.out.includes(option),prune.out);
  const bundle=await help('diagnostic','bundle','--help');
  for(const option of ['--out','--session','--include-content'])assert.ok(bundle.out.includes(option),bundle.out);
  const trust=await help('project','trust','--help');
  assert.ok(trust.out.includes('--include-nested'),trust.out);
});

test('the family help is unchanged, and an unknown operation still gets it',async()=>{
  for(const args of [['provider','--help'],['provider','-h'],['provider','no-such-operation','--help']]){
    const r=await help(...args);
    assert.equal(r.code,0);assert.equal(r.out,familyHelpText('provider'),args.join(' '));
  }
});
