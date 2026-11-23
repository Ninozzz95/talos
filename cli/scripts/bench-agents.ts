/*
 * The agents of the hermetic bench, set up the same way for scripts/bench-harness.ts (one headless turn) and for
 * scripts/ui-frames.ts (the interactive screen): a private temporary profile, the scripted fake of bench-fake.ts as the
 * only model, the refusing sink for everything else. Nothing here reads or writes the person's real profile.
 */
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BENCH_MODEL as MODEL} from './bench-fake.ts';

const CLI=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SECRET=/(KEY|TOKEN|SECRET|PASSW|CRED|AUTH|PRIVATE)/iu;
export const AGENTS=['talos','pi','codex','opencode'] as const;
export type AgentName=typeof AGENTS[number];

/** The folder every agent works in: six small files, two helper scripts, and a tree of `treeFiles` files with four needles. */
export function makeWorkspace(dir:string,treeFiles:number){
  mkdirSync(dir,{recursive:true});
  for(let i=1;i<=6;i++)writeFileSync(join(dir,`f${i}.txt`),`file ${i}\n`+'lorem ipsum dolor sit amet\n'.repeat(150));
  writeFileSync(join(dir,'sleep.cjs'),'setTimeout(()=>console.log("slept"),Number(process.argv[2]||0));\n');
  writeFileSync(join(dir,'cat.cjs'),'process.stdout.write(require("fs").readFileSync(process.argv[2],"utf8"));\n');
  for(let i=0;i<treeFiles;i++){
    const sub=join(dir,'tree',`d${Math.floor(i/100)}`);if(i%100===0)mkdirSync(sub,{recursive:true});
    const needle=i%1500===7?`NEEDLE_${'ABCD'[Math.floor(i/1500)]}\n`:'';
    writeFileSync(join(sub,`m${i}.ts`),`export const v${i}=${i};\n`+'// filler line for the bench\n'.repeat(40)+needle);
  }
}

function baseEnv(home:string,sink:Record<string,string>){
  const out:Record<string,string>={};for(const [k,v] of Object.entries(process.env))if(v!==undefined&&!SECRET.test(k)&&!/^(TALOS_|OLLAMA_|NODE_OPTIONS$|PI_|CODEX_|OPENCODE_|XDG_)/u.test(k))out[k]=v;
  for(const d of ['appdata','localappdata','user','xdg/config','xdg/data','xdg/state','xdg/cache'])mkdirSync(join(home,d),{recursive:true});
  return{...out,APPDATA:join(home,'appdata'),LOCALAPPDATA:join(home,'localappdata'),USERPROFILE:join(home,'user'),HOME:join(home,'user'),
    XDG_CONFIG_HOME:join(home,'xdg/config'),XDG_DATA_HOME:join(home,'xdg/data'),XDG_STATE_HOME:join(home,'xdg/state'),XDG_CACHE_HOME:join(home,'xdg/cache'),...sink};
}
const q=(s:string)=>`"${s}"`;

export type Agent={
  env:Record<string,string>;
  /** One headless turn, as a shell command line (the bench). */
  print:(prompt:string)=>string;
  /** The interactive screen, as a shell command line (the UI frames). */
  interactive:string;
  /** One-time setup in `cwd` (TALOS: select the fake model and trust the folder). */
  setup?:(cwd:string)=>void;
};
export function agent(name:AgentName,home:string,fakeUrl:string,sink:Record<string,string>):Agent{
  const env=baseEnv(home,sink);
  if(name==='talos'){
    const main=join(CLI,'dist','main.js');
    Object.assign(env,{TALOS_TEST_PROFILE:'1',TALOS_CREDENTIAL_STORE:'memory',OLLAMA_BASE_URL:fakeUrl});
    return{env,print:(prompt)=>`${q(process.execPath)} ${q(main)} -p ${q(prompt)} --permission-mode bypassPermissions`,interactive:`${q(process.execPath)} ${q(main)}`,setup:(cwd)=>{
      for(const a of [['model','use',`ollama:${MODEL}`,'--scope','user'],['project','trust','--include-nested']]){const r=spawnSync(process.execPath,[main,...a],{env,encoding:'utf8',cwd});if(r.status!==0)throw new Error(`talos ${a.join(' ')}: ${r.stderr||r.stdout}`);}
    }};
  }
  if(name==='pi'){
    const dir=join(home,'pi');mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'models.json'),JSON.stringify({providers:{bench:{baseUrl:`${fakeUrl}/v1`,api:'openai-completions',apiKey:'bench',models:[{id:MODEL}]}}}));
    Object.assign(env,{PI_CODING_AGENT_DIR:dir,PI_OFFLINE:'1'});
    return{env,print:(prompt)=>`pi -p --provider bench --model ${MODEL} ${q(prompt)}`,interactive:`pi --provider bench --model ${MODEL}`};
  }
  if(name==='codex'){
    const dir=join(home,'codex');mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'config.toml'),`model = "${MODEL}"\nmodel_provider = "bench"\n\n[model_providers.bench]\nname = "bench"\nbase_url = "${fakeUrl}/v1"\nwire_api = "responses"\n`);
    Object.assign(env,{CODEX_HOME:dir});
    /* Codex's Windows sandbox refuses every CreateProcess on this machine without its elevated setup (measured 2026-09-26:
       "exec_command failed: CreateProcess … Rejected"), so it runs unsandboxed here; TALOS runs its shell in its sandbox. */
    return{env,print:(prompt)=>`codex exec --skip-git-repo-check -s danger-full-access ${q(prompt)}`,interactive:'codex -s danger-full-access'};
  }
  const file=join(home,'opencode.json');
  writeFileSync(file,JSON.stringify({$schema:'https://opencode.ai/config.json',model:`bench/${MODEL}`,provider:{bench:{npm:'@ai-sdk/openai-compatible',name:'bench',options:{baseURL:`${fakeUrl}/v1`,apiKey:'bench'},models:{[MODEL]:{name:MODEL,tool_call:true}}}}}));
  Object.assign(env,{OPENCODE_CONFIG:file,OPENCODE_DISABLE_MODELS_FETCH:'1',OPENCODE_DISABLE_AUTOUPDATE:'1',OPENCODE_DISABLE_DEFAULT_PLUGINS:'1',OPENCODE_DISABLE_LSP_DOWNLOAD:'1',OPENCODE_DISABLE_SHARE:'1',OPENCODE_DISABLE_CLAUDE_CODE:'1',OPENCODE_DISABLE_EXTERNAL_SKILLS:'1'});
  return{env,print:(prompt)=>`opencode run -m bench/${MODEL} ${q(prompt)}`,interactive:`opencode -m bench/${MODEL}`};
}
