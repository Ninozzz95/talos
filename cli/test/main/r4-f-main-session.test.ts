/*
 * R4 lane F — owner decision Q-R4-17 end to end. An interactive start in the home folder, answered "Trust this folder for this
 * session": the project's hook, MCP server and plugin are honoured while this TALOS runs, nothing is left in the trust store,
 * and a later `talos -p` in that folder (a new process, so no grant) is refused as untrusted with exit 2.
 * The later run is a real child process of the CLI; it is refused before any runtime exists, and every request it could make
 * is pointed at a closed port on 127.0.0.1 (a refusing proxy), so nothing can leave the machine.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,readdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {main} from '../../src/main.ts';
import {resolveCliPaths} from '../../src/paths.ts';
import {assessProjectTrust} from '../../src/security/project-trust-gate.ts';
import {createTrustAuthority} from '../../src/security/trust-authority.ts';

const CLI=fileURLToPath(new URL('../../',import.meta.url));
const roots:string[]=[];after(async()=>{for(const root of roots)await rm(root,{recursive:true,force:true});});
async function filesUnder(root:string):Promise<string[]>{
  try{await stat(root);}catch{return[];}
  return (await readdir(root,{withFileTypes:true,recursive:true})).filter(entry=>entry.isFile()).map(entry=>join(entry.parentPath,entry.name));
}

test('Q-R4-17: a session grant honours the project files while TALOS runs, leaves no fingerprint, and -p there is refused afterwards',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'r4-f-main-session-'));roots.push(parent);
  const home=join(parent,'home');await mkdir(join(home,'.harness-ui-plugins','demo'),{recursive:true});
  await writeFile(join(home,'AGENTS.md'),'rules\n');
  await writeFile(join(home,'.harness-ui-hooks.json'),JSON.stringify({hooks:[{id:'lint',eventi:['pre_tool_call'],comando:'npm test'}]})+'\n');
  await writeFile(join(home,'.harness-ui-mcp.json'),JSON.stringify({server:[{id:'docs',comando:'node',argomenti:['server.js'],allowlist:['read']}]})+'\n');
  await writeFile(join(home,'.harness-ui-plugins','demo','plugin.json'),JSON.stringify({id:'demo',tools:[],hooks:[]})+'\n');
  /* The trust root main uses (the runner gives this process a private profile). */
  const trustRoot=resolveCliPaths(process.env,process.platform,homedir()).trust.projects;
  const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''};
  const honoured:Record<string,boolean>={};let asked:any=null;
  const code=await main(['--project',home],{io,
    /* This folder plays the home folder: the real assessment, told which folder is home. */
    assessProjectTrust:(input:any)=>assessProjectTrust({...input,homeDir:home}),
    promptProjectTrust:async(input:any)=>{asked=input;return'trust';},
    createRuntimeContext:async()=>{
      /* What the composition does: its own authority, asking about each executable scope. */
      const authority=createTrustAuthority({projectRoot:home,trustRoot});
      for(const scope of [{kind:'hook',id:'lint'},{kind:'mcp',id:'docs'},{kind:'plugin',id:'demo'}] as const)honoured[`${scope.kind}:${scope.id}`]=await authority.verifyScope(scope);
      return{runtime:{close:async()=>{}},tuiCatalog:{}};
    },
    runTui:async()=>{},loadedFiles:async()=>[]} as any);
  assert.equal(code,0,io.stderr);
  assert.equal(asked?.assessment?.folder?.sessionOnly,true,'the question was the session-only one');
  assert.deepEqual(honoured,{'hook:lint':true,'mcp:docs':true,'plugin:demo':true},'the project resources are honoured in this session');
  const identity=(await assessProjectTrust({projectRoot:home,trustRoot,homeDir:home})).workspace.identityHash;
  const files=await filesUnder(trustRoot);
  assert.deepEqual(files.filter(file=>file.includes(identity)),[],'no fingerprint record for this folder');
  for(const file of files.filter(file=>file.endsWith('.json')))assert.doesNotMatch(await readFile(file,'utf8'),new RegExp(identity,'u'),`${file} names this folder`);
  /* A later `talos -p` there: a new process, with the same profile, behind a refusing proxy. */
  const refusing='http://127.0.0.1:9';
  const later=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings',join(CLI,'src','main.ts'),'-p','hi','--project',home,'--json','--timeout','5'],
    {cwd:CLI,encoding:'utf8',timeout:60_000,env:{...process.env,NODE_USE_ENV_PROXY:'1',HTTP_PROXY:refusing,HTTPS_PROXY:refusing,http_proxy:refusing,https_proxy:refusing,NO_PROXY:'',no_proxy:''}});
  assert.equal(later.status,2,`-p after the session: ${later.stdout}${later.stderr}`);
  assert.equal(JSON.parse(later.stdout).error.code,'PROJECT_TRUST_REQUIRED');
  /* Control: a child reads the very store this process wrote to. A folder trusted for good here is trusted there. */
  const control=join(parent,'control');await mkdir(control);await writeFile(join(control,'AGENTS.md'),'rules\n');
  const {trustProjectAssessment}=await import('../../src/security/project-trust-gate.ts');
  await trustProjectAssessment({assessment:await assessProjectTrust({projectRoot:control,trustRoot,homeDir:home}),trustRoot,nestedRepositories:[],homeDir:home});
  const status=(folder:string)=>{const run=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings',join(CLI,'src','main.ts'),'--project',folder,'--json','project','status'],{cwd:CLI,encoding:'utf8',timeout:60_000,env:process.env});assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout);};
  const saved=status(control);assert.equal(saved.trusted,true);assert.equal(saved.storeSchema,'v2');
  const nothing=status(home);assert.equal(nothing.trusted,false);assert.equal(nothing.storeSchema,null,'no record for the home folder in that store');
});
