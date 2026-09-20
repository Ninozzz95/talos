// Release qualification on a disposable source copy, never on the owner profile.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, readFileSync, writeFileSync, readdirSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { creaEsecuzione, creaSnapshot, creaAmbienteIsolato } from '../../frontend/scripts/ripresa-run.mjs';

const source = fileURLToPath(new URL('..', import.meta.url));
const run = creaEsecuzione('desktop');
const snapshot = creaSnapshot(run);
const desktop = join(snapshot, 'harness-ui/desktop');
symlinkSync(join(source, 'node_modules'), join(desktop, 'node_modules'), 'junction');
const json = (name, data) => writeFileSync(join(run.output, name), JSON.stringify(data, null, 2)+'\n', {flag:'wx'});
const hashes = [];
function instrument(file, transform) {
  const before = readFileSync(file, 'utf8'), after = transform(before);
  if (before === after) throw Error('Instrumentation not applied: '+file);
  writeFileSync(file, after);
  const hash = text => createHash('sha256').update(text).digest('hex');
  hashes.push({file, before:hash(before), after:hash(after), testOnly:true});
}
const preload = pathToFileURL(join(snapshot, 'harness-ui/frontend/tests/fixtures/ripresa-keyring-preload.mjs')).href;
instrument(join(desktop,'child-bootstrap.mjs'), text => `process.env.TALOS_RIPRESA_ISOLATED = '1';\nawait import(${JSON.stringify(preload)});\n`+text);
instrument(join(desktop,'tests/support.mjs'), text => text.replace("TALOS_INTRO: '0'", "TALOS_INTRO: '0', TALOS_DESKTOP_PROFILE: 'preview'"));
json('instrumentation.json', {hashes, limitation:'Real Electron and backend; OS credential store replaced by in-memory adapter. Installer and provider credentials are not exercised.'});
const env = creaAmbienteIsolato(run);
json('configuration.json', {...env, Path:undefined, PATH:undefined});
console.log('Desktop gate '+run.id+'\nEvidence: '+run.output+'\nSnapshot: '+snapshot);
async function execute(name, args, cwd) {
  const log = createWriteStream(join(run.output,name+'.log'),{flags:'wx'});
  const started = new Date().toISOString();
  const code = await new Promise((done,reject)=>{
    const p = spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    p.stdout.pipe(log,{end:false});p.stderr.pipe(log,{end:false});
    p.on('error',reject);p.on('close',(code,signal)=>log.end(()=>done(signal?1:code??1)));
  });
  json(name+'-result.json',{started,finished:new Date().toISOString(),code,args});
  console.log(name+': '+code);
  return code;
}
if (!process.argv.includes('--prepare-only')) {
  const pure = readdirSync(join(desktop,'tests')).filter(n=>n.endsWith('.test.mjs')).map(n=>join('tests',n));
  json('test-files.json',{pure,shell:['tests/backend.spec.mjs','tests/guscio.spec.mjs']});
  let code=await execute('pure',['--test','--test-concurrency=1','--test-reporter=tap',...pure],desktop);
  if (!code) code=await execute('shell',['--test','--test-concurrency=1','--test-reporter=tap','tests/backend.spec.mjs','tests/guscio.spec.mjs'],desktop);
  json('result.json',{code,proofs:join(desktop,'.prove'),snapshot,live4174Touched:false});
  process.exitCode=code;
}
