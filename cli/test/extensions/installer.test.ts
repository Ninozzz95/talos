import assert from 'node:assert/strict';import test from 'node:test';import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {installExtensionDirectory,listInstalledExtensions,removeInstalledExtension} from '../../src/extensions/installer.ts';
async function fixture(){const root=await mkdtemp(join(tmpdir(),'talos-ext-'));const src=join(root,'pkg'),project=join(root,'repo');await mkdir(src,{recursive:true});await writeFile(join(src,'extension.json'),JSON.stringify({schema:'talos.cli.extension.v1',id:'quality',name:'Quality',version:'1.0.0',talosCli:'>=1 <2',components:{mcp:'mcp.json',hooks:'hooks.json',plugin:'plugin.json'}}));await writeFile(join(src,'mcp.json'),JSON.stringify({server:[{id:'lint',comando:'node',argomenti:['x'],allowlist:['check']}]}));await writeFile(join(src,'hooks.json'),JSON.stringify({hooks:[{id:'format',eventi:['post_tool_call'],comando:'node f.js'}]}));await writeFile(join(src,'plugin.json'),JSON.stringify({nome:'Q',descrizione:'x',tools:[],hooks:[]}));return{root,src,project};}
test('install materializes components but does not trust them',async()=>{const f=await fixture();const r=await installExtensionDirectory({sourceDir:f.src,projectRoot:f.project,currentVersion:'1.0.0'});assert.equal(r.id,'quality');assert.equal((await listInstalledExtensions(f.project)).length,1);const mcp=JSON.parse(await readFile(join(f.project,'.harness-ui-mcp.json'),'utf8'));assert.equal(mcp.server[0].id,'lint');await assert.rejects(()=>readFile(join(f.project,'.talos-cli','trust','mcp','lint.json'),'utf8'),{code:'ENOENT'});});
test('remove refuses to destroy manually modified owned component',async()=>{const f=await fixture();await installExtensionDirectory({sourceDir:f.src,projectRoot:f.project,currentVersion:'1.0.0'});const file=join(f.project,'.harness-ui-mcp.json');const mcp=JSON.parse(await readFile(file,'utf8'));mcp.server[0].comando='changed';await writeFile(file,JSON.stringify(mcp));await assert.rejects(()=>removeInstalledExtension({projectRoot:f.project,id:'quality'}),/EXTENSION_COMPONENT_MODIFIED/u);});

import {createStoredZip} from '../../src/diagnostics/zip.ts';
import {installExtension} from '../../src/extensions/installer.ts';

test('zip extension installs without external zip runtime and preserves trust separation',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-ext-zip-'));
  const project=join(root,'repo');
  const archive=join(root,'quality.zip');
  const manifest={schema:'talos.cli.extension.v1',id:'qualityzip',name:'Quality ZIP',version:'1.0.0',talosCli:'>=1 <2',components:{mcp:'mcp.json'}};
  const mcp={server:[{id:'lintzip',comando:'node',argomenti:['x'],allowlist:['check']}]};
  await writeFile(archive,createStoredZip([
    {name:'extension.json',data:JSON.stringify(manifest)},
    {name:'mcp.json',data:JSON.stringify(mcp)}
  ]));
  const installed=await installExtension({source:archive,projectRoot:project,currentVersion:'1.0.0'});
  assert.equal(installed.id,'qualityzip');
  const config=JSON.parse(await readFile(join(project,'.harness-ui-mcp.json'),'utf8'));
  assert.equal(config.server[0].id,'lintzip');
  await assert.rejects(()=>readFile(join(project,'.talos-cli','trust','mcp','lintzip.json'),'utf8'),{code:'ENOENT'});
});

test('zip extension rejects traversal before writing any project file',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-ext-zip-bad-'));
  const project=join(root,'repo');
  const archive=join(root,'bad.zip');
  const hostile=createStoredZip([{name:'xx/escape.txt',data:'no'}]);
  for(let at=hostile.indexOf(Buffer.from('xx/escape.txt'));at>=0;at=hostile.indexOf(Buffer.from('xx/escape.txt'),at+1))Buffer.from('../escape.txt').copy(hostile,at);
  await writeFile(archive,hostile);
  await assert.rejects(()=>installExtension({source:archive,projectRoot:project,currentVersion:'1.0.0'}),/EXTENSION_PATH_TRAVERSAL|ZIP_ENTRY_INVALID/u);
});
