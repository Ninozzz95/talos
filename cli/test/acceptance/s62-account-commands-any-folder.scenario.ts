/**
 * «Provider commands work from any folder» (0.6.0) and «`talos model list` answers in any folder» (0.6.1), on the BUILT CLI, in a
 * folder nobody trusted. Until 13/10/2026 this was proven only in-process (test/commands/provider-any-folder*.test.ts): the
 * adversarial review of 0.6.0 named it among the surfaces with no scenario on the built program.
 *
 * What this scenario proves: in that folder a turn is refused and the account commands answer; they run on TALOS's own folder
 * (`<data>/no-project`), which exists and stays empty; a folder that is not empty is refused and named; nothing is written in the
 * person's folder, no trust is recorded, nothing leaves the machine.
 *
 * ⛔ What it does NOT prove (review of 0.6.1, 13/10/2026): that the folder's own `.talos-cli/config.json` is not READ. The file is
 * there because it is what makes the real gate refuse the folder, but its content cannot show: the acceptance profile forces the
 * in-memory credential store (`TALOS_CREDENTIAL_STORE=memory`, profile.ts), so `credentials.store: memory` changes nothing whether
 * it is read or not, and — measured in-process the same day — neither a broken file nor a `models` override in it changes what
 * `provider list` or `model list` print even when the folder IS vouched for. That the composition is never given the person's
 * folder is proven in-process, by what the command asks of the runtime (provider-any-folder-real.test.ts: the second and only
 * runtime is built with `projectRoot` = TALOS's own folder).
 */
import assert from 'node:assert/strict';
import {existsSync,lstatSync,mkdirSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {stage} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';

const sink=await startRefusingSink();
const s=stage({name:'s62',files:{'README.md':'# demo\n','.talos-cli/config.json':'{"version":1,"credentials":{"store":"memory"}}\n'},useModel:false,trusted:false,extraEnv:sinkEnv(sink)});
const said=(r:{stdout:string;stderr:string})=>r.stdout+r.stderr;
/* paths.ts on win32: the data root is %LOCALAPPDATA%\TALOS-CLI; provider-cli.ts NEUTRAL_FOLDER */
const neutral=()=>path.join(s.profile.env.LOCALAPPDATA!,'TALOS-CLI','no-project');
const neutralIsRealAndEmpty=(after:string)=>{
  assert.equal(existsSync(neutral()),true,`${after}: TALOS's own folder exists`);
  const found=lstatSync(neutral());
  assert.equal(found.isDirectory()&&!found.isSymbolicLink(),true,`${after}: it is a real folder, not a link`);
  assert.deepEqual(readdirSync(neutral()),[],`${after}: and it is empty`);
};

test('s62 · the folder is not trusted: a turn there is refused, so what follows is not a trusted folder in disguise',async()=>{
  const turn=await s.profile.talos(['-p','say hello']);
  assert.notEqual(turn.status,0);assert.match(said(turn),/PROJECT_TRUST_REQUIRED|not trusted/u,said(turn));
  assert.equal(existsSync(neutral()),false,'a refused turn does not make TALOS\'s own folder: only an account command does');
});

test('s62 · the account commands answer there: provider list, status of the plan, sign-out with nobody signed in',async()=>{
  const list=await s.profile.talos(['provider','list']);
  assert.equal(list.status,0,said(list));
  assert.ok(JSON.parse(list.stdout).find((profile:any)=>profile.id==='chatgpt'),'the real control plane answered');
  neutralIsRealAndEmpty('provider list');
  const status=await s.profile.talos(['provider','status','chatgpt']);
  assert.equal(status.status,0,said(status));assert.match(status.stdout,/ChatGPT plan is not connected\./u);
  const out=await s.profile.talos(['provider','logout','chatgpt']);
  assert.equal(out.status,0,said(out));assert.match(out.stdout,/No ChatGPT account is connected\./u);
  neutralIsRealAndEmpty('status and logout');
});

test('s62 · the command the sign-in sends the person to, `talos model list --provider chatgpt`, answers there too',async()=>{
  const models=await s.profile.talos(['model','list','--provider','chatgpt']);
  assert.equal(models.status,0,said(models));
  assert.doesNotMatch(said(models),/PROJECT_TRUST_REQUIRED|not trusted/u,said(models));
  /* nobody is signed in: the answer is how to sign in, on stdout, where the list would be */
  assert.match(models.stdout,/talos provider login chatgpt/u,said(models));
  /* `--json` (review of 0.6.1): stdout is the rows and nothing else, the same hint is on stderr */
  const json=await s.profile.talos(['model','list','--provider','chatgpt','--json']);
  assert.equal(json.status,0,said(json));
  assert.deepEqual(JSON.parse(json.stdout),[],json.stdout);
  assert.match(json.stderr,/talos provider login chatgpt/u,said(json));
  neutralIsRealAndEmpty('model list');
});

test('s62 · something planted in TALOS\'s own folder: the account commands are refused and name it, and answer again once it is gone',async()=>{
  mkdirSync(path.join(neutral(),'.talos-cli'),{recursive:true});
  writeFileSync(path.join(neutral(),'.talos-cli','config.json'),'{"version":1}\n');
  try{
    for(const args of [['provider','list'],['model','list','--provider','chatgpt']]){
      const refused=await s.profile.talos(args);
      assert.notEqual(refused.status,0,said(refused));
      assert.match(said(refused),/PROVIDER_NEUTRAL_FOLDER_UNSAFE|an empty folder TALOS keeps for them/u,said(refused));
      assert.ok(said(refused).includes(neutral()),`the folder is named: ${said(refused)}`);
    }
    assert.deepEqual(readdirSync(path.join(neutral(),'.talos-cli')),['config.json'],'TALOS did not touch what it found');
  }finally{rmSync(path.join(neutral(),'.talos-cli'),{recursive:true,force:true});}
  const again=await s.profile.talos(['provider','list']);
  assert.equal(again.status,0,said(again));
  neutralIsRealAndEmpty('after the planted file was removed');
});

test('s62 · nothing was written in the folder, it is still not trusted, and nothing left the machine',async()=>{
  assert.deepEqual(readdirSync(s.profile.project).sort(),['.talos-cli','README.md']);
  assert.deepEqual(readdirSync(path.join(s.profile.project,'.talos-cli')),['config.json']);
  assert.equal(existsSync(path.join(s.profile.project,'.talos-cli','config.json')),true);
  const turn=await s.profile.talos(['-p','say hello']);
  assert.notEqual(turn.status,0,'the account commands granted no trust');
  assert.deepEqual(sink.hits.filter(hit=>/openai|chatgpt/iu.test(String(hit.url))),[],JSON.stringify(sink.hits));
});
test.after(async()=>{await sink.close();});
