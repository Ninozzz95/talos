import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {permissionActionToRule} from '../../src/security/persist.ts';
import {validateForgeOwnerPackage} from '../../src/security/forge-scan.ts';
import {assertValidKeymap} from '../../src/tui/keymap-resolver.ts';
import {toTalosErrorEnvelope} from '../../src/errors.ts';

/* R2 lane E (gate E6, review D-06): a code travels on `error.code` and is printed once by the renderer; a message that
   starts with its own code printed it twice (`Error [X]: X: …`). The owner approved removing the prefix at all 8 sites. */
const SRC=fileURLToPath(new URL('../../src/',import.meta.url));
function files(dir:string):string[]{return readdirSync(dir).flatMap(name=>{const full=join(dir,name);return statSync(full).isDirectory()?files(full):/\.ts$/u.test(name)?[full]:[];});}

/* Sites outside lane E's files that still carry the prefix (measured 2026-09-24). The renderer strips a leading `CODE:` so
   the screen prints the code once anyway (`describeError`); this count may only go down as their owners remove it. */
const ELSEWHERE:Readonly<Record<string,number>>={'security/trust-authority.ts':10};
test('no CLI source builds an Error whose message starts with its own UPPER_SNAKE code (outside the counted leftovers)',()=>{
  const offenders=files(SRC).flatMap(file=>readFileSync(file,'utf8').split(/\r?\n/u).flatMap((line,index)=>
    /(?:Error|ruleError|\bfail)\(\s*(?:'[A-Z][A-Z0-9_]*',\s*)?(?:'|`)[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+: /u.test(line)?[`${file.slice(SRC.length).replace(/\\/gu,'/')}:${index+1}`]:[]));
  const byFile=new Map<string,number>();for(const site of offenders){const file=site.slice(0,site.lastIndexOf(':'));byFile.set(file,(byFile.get(file)??0)+1);}
  for(const [file,count] of byFile)assert.ok(count<=(ELSEWHERE[file]??0),`${file}: ${count} messages start with their code: ${offenders.filter(s=>s.startsWith(file+':')).join(', ')}`);
});

test('the de-prefixed sites keep their codes on error.code, so the envelope and the exit code do not change',()=>{
  const project=process.cwd();
  const cases:[string,()=>unknown][]=[
    ['RULE_COMPOUND_COMMAND',()=>permissionActionToRule({tool:'Bash',command:'npm test && npm publish'},project)],
    ['RULE_MATCHES_NOTHING',()=>permissionActionToRule({tool:'Bash',command:'echo a^&b'},project)],
    ['FORGE_PACKAGE_SCHEMA_INVALID',()=>validateForgeOwnerPackage({schemaVersion:1,revision:0,manifest:{},simulation:{input:{}}})],
    ['KEYMAP_INVALID',()=>assertValidKeymap({interrupt:[]} as any)],
  ];
  for(const [code,run] of cases){
    let thrown:any=null;try{run();}catch(error){thrown=error;}
    assert.ok(thrown,`${code}: nothing was thrown`);
    assert.equal(thrown.code,code);
    assert.equal(String(thrown.message).startsWith(code),false,`${code}: the message still starts with the code: ${thrown.message}`);
    assert.equal(toTalosErrorEnvelope(thrown).code,code);
  }
});
