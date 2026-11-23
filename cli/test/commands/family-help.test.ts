/*
 * F-UX-001 / F-UX-002 of the stress-test smoke (rc.1, 08/10/2026), reproduced before the cure:
 * - `--help` worked only at the top: every `talos <family> --help` answered CLI_USAGE_ERROR "Unknown option: --help", and `talos provider --help`
 *   (also `provider login` / `provider remove-key` with no id) answered PROVIDER_REQUIRED worded as a provider failure: "The model provider returned an
 *   error. Try again in a moment, or pick another model with /model."
 * Now `talos <family> --help` (or `-h`, anywhere after the family) prints the family's usage and its operations, and PROVIDER_REQUIRED says what is
 * missing. The table of operations is checked against the code that dispatches them, so the help cannot drift from what the command accepts.
 */
import assert from 'node:assert/strict';import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';import {join} from 'node:path';
import {FAMILY_OPERATIONS,familyHelpText} from '../../src/commands/family-help.ts';
import {runSubcommand} from '../../src/subcommands.ts';
import {renderSafeTalosFailure} from '../../src/errors.ts';

const CLI=join(import.meta.dirname,'..','..');
function operationsInCode():Record<string,string[]>{
  const sub=readFileSync(join(CLI,'src','subcommands.ts'),'utf8');const dispatch:Record<string,string[]>={};
  for(const m of sub.matchAll(/case'([a-z-]+)':return await (run[A-Za-z]+Command)\(/gu))(dispatch[m[2]!]??=[]).push(m[1]!);
  const out:Record<string,string[]>={};
  for(const f of readdirSync(join(CLI,'src','commands')).filter(x=>x.endsWith('.ts'))){
    const s=readFileSync(join(CLI,'src','commands',f),'utf8');const starts=[...s.matchAll(/export async function (run[A-Za-z]+Command)\(/gu)];
    starts.forEach((st,i)=>{const body=s.slice(st.index!,i+1<starts.length?starts[i+1]!.index!:s.length);const ops=[...new Set([...body.matchAll(/op===?'([a-z-]+)'/gu)].map(m=>m[1]!))];for(const family of dispatch[st[1]!]??[])out[family]=ops;});
  }
  return out;
}

test('F-UX-001: the help table names exactly the operations each family dispatches (no drift)',()=>{
  const code=operationsInCode();
  for(const [family,ops] of Object.entries(code)){if(!ops.length)continue;assert.deepEqual([...FAMILY_OPERATIONS[family]!].sort(),[...ops].sort(),family);}
});

test('F-UX-001: `talos <family> --help` and `-h` print the usage of that family, for every family, and exit 0',async()=>{
  for(const family of Object.keys(FAMILY_OPERATIONS)){
    for(const flag of ['--help','-h']){
      const out:string[]=[];const err:string[]=[];
      const code=await runSubcommand({positionals:[family,flag],outputFormat:'text',verbose:false} as any,{io:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s)} as any,createRuntimeContext:async()=>{throw new Error('help must not build a runtime');}});
      assert.equal(code,0,`${family} ${flag}`);
      assert.match(out.join(''),new RegExp(`talos ${family}`,'u'));
      for(const op of FAMILY_OPERATIONS[family]!)assert.ok(out.join('').includes(op),`${family}: ${op}`);
      assert.equal(err.join(''),'');
    }
  }
  const out:string[]=[];
  assert.equal(await runSubcommand({positionals:['provider','login','--help'],outputFormat:'text',verbose:false} as any,{io:{writeOut:(s:string)=>out.push(s),writeErr(){}} as any}),0,'after an operation too');
  assert.match(familyHelpText('provider'),/talos provider <operation>/u);
});

test('F-UX-002: PROVIDER_REQUIRED says a provider id is missing, not that a provider failed',()=>{
  const failure=renderSafeTalosFailure('text',Object.assign(new Error('PROVIDER_REQUIRED'),{code:'PROVIDER_REQUIRED'}),{component:'cli',verbose:false});
  assert.doesNotMatch(failure.text,/returned an error|Try again in a moment|\/model/u);
  assert.match(failure.text,/provider/iu);
  assert.match(failure.text,/talos provider list/u);
});
