import assert from 'node:assert/strict';
import {mkdir,mkdtemp,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {inventoryProjectResources} from '../../src/security/project-resource-inventory.ts';
import {resolveWorkspaceIdentity} from '../../src/security/workspace-identity.ts';

async function fixture(){const root=await mkdtemp(join(tmpdir(),'talos-resource-inventory-'));await mkdir(root,{recursive:true});return root;}
async function file(root:string,name:string,content='x'){const target=join(root,name);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,content,'utf8');return target;}

test('inventory fingerprints exact config, instructions, commands, hooks, MCP, and plugins',async()=>{
  const root=await fixture();
  await file(root,'.talos-cli/config.json','{}');await file(root,'AGENTS.md','rules');await file(root,'TALOS.md','context');
  await file(root,'.talos-cli/commands/review.md','review');await file(root,'.talos-cli/commands/nested/test.md','test');
  await file(root,'.harness-ui-hooks.json',JSON.stringify({hooks:[{id:'lint',eventi:['before-run'],comando:'echo lint'}]}));
  await file(root,'.harness-ui-mcp.json',JSON.stringify({server:[{id:'docs',comando:'node',argomenti:['server.js'],allowlist:['read']}]}));
  await file(root,'.harness-ui-plugins/demo/plugin.json','{"id":"demo"}');
  const workspace=await resolveWorkspaceIdentity({projectRoot:root});const resources=await inventoryProjectResources(workspace);
  assert.deepEqual(Object.fromEntries(resources.map(x=>[x.relativePath,x.kind])),{
    '.harness-ui-hooks.json':'hook','.harness-ui-mcp.json':'mcp','.harness-ui-plugins/demo/plugin.json':'plugin',
    '.talos-cli/config.json':'context','.talos-cli/commands/nested/test.md':'command','.talos-cli/commands/review.md':'command',
    'AGENTS.md':'context','TALOS.md':'context'
  });
  assert.equal(resources.find(x=>x.kind==='hook')?.id,'lint','hook trust is keyed by the actual hook id');
  assert.equal(resources.find(x=>x.kind==='mcp')?.id,'docs','MCP trust is keyed by the actual server id');
  assert.ok(resources.every(x=>/^[a-f0-9]{64}$/u.test(x.fingerprint)));
});

/* F-ENG-1 (08/10/2026, found launching the stress test): the kernel writes the output of a background command to `.talos/processi-sfondo/<id>.log`
   (talosHarness.mjs SFONDO_DIR). The inventory took every file under `.talos/` as a resource, so TALOS's own log dropped the project's trust and every later
   headless resume failed with PROJECT_TRUST_INVALIDATED. Runtime state is not configuration; what the kernel reads from `.talos/` stays a resource. */
test('inventory leaves out the background-process logs of the kernel and keeps everything the kernel reads from .talos',async()=>{
  const root=await fixture();
  await file(root,'.talos/hooks.json','{"hooks":[]}');await file(root,'.talos/skills/review/SKILL.md','skill');await file(root,'.talos/notes.md','n');
  await file(root,'.talos/processi-sfondo/call_1.log','output');await file(root,'.talos/processi-sfondo/nested/x.txt','x');
  const workspace=await resolveWorkspaceIdentity({projectRoot:root});
  const paths=(await inventoryProjectResources(workspace)).map(x=>x.relativePath).sort();
  assert.deepEqual(paths,['.talos/hooks.json','.talos/notes.md','.talos/skills/review/SKILL.md']);
});

test('the runtime folder left out of the inventory is the one the kernel writes to (no silent drift)',async()=>{
  const {readFile}=await import('node:fs/promises');
  const kernel=await readFile(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url),'utf8');
  assert.match(kernel,/export const SFONDO_DIR = '\.talos\/processi-sfondo'/u);
});

test('inventory rejects an executable resource junction that escapes the workspace',async()=>{
  const root=await fixture();const outside=await fixture();await file(outside,'plugin.json','{"id":"outside"}');
  await mkdir(join(root,'.harness-ui-plugins'),{recursive:true});await symlink(outside,join(root,'.harness-ui-plugins','demo'),'junction');
  const workspace=await resolveWorkspaceIdentity({projectRoot:root});
  await assert.rejects(()=>inventoryProjectResources(workspace),(error:any)=>error?.code==='RESOURCE_DIRECTORY_SYMLINK_UNSUPPORTED');
});
