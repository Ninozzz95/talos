/*
 * F-H-001 (stress test of 0.5.0, 08/10/2026, reproduced 09/10 on the built CLI): with the hook in `.talos/hooks.json`,
 * `talos hook list` showed it (the kernel reads `.talos/hooks.json` first, then `.harness-ui-hooks.json`:
 * harness-ui/src/configurazione-progetto.mjs POSIZIONI_CONFIGURAZIONE, PO-26 of 24/09), but `talos hook trust` failed with
 * HOOK_RESOURCE_NOT_FOUND and the hook never ran: the CLI's trust inventory read only `.harness-ui-hooks.json`, and counted
 * `.talos/hooks.json` as plain context. The same held for `.talos/mcp.json`. The loader and the trust check must read the
 * same places in the same order.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {inventoryProjectResources} from '../../src/security/project-resource-inventory.ts';
import {resolveWorkspaceIdentity} from '../../src/security/workspace-identity.ts';
import {createTrustAuthority} from '../../src/security/trust-authority.ts';
import {PROJECT_CONFIG_FILES} from '../../src/security/project-config-positions.ts';

async function project(files:Record<string,unknown>){
  const root=await mkdtemp(join(tmpdir(),'talos-fh001-'));
  for(const [name,value] of Object.entries(files)){const target=join(root,name);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,typeof value==='string'?value:JSON.stringify(value),'utf8');}
  return root;
}
const hook=(id:string,comando='node -e "process.exit(7)"')=>({id,comando,eventi:['pre_tool_call']});
const server=(id:string)=>({id,comando:'node',argomenti:['server.js'],allowlist:['read']});

test('F-H-001: the CLI reads hooks and MCP servers from the same places as the kernel, in the same order',async()=>{
  const kernel=await import(pathToFileURL(join(import.meta.dirname,'..','..','..','harness-ui','src','configurazione-progetto.mjs')).href);
  assert.deepEqual([...PROJECT_CONFIG_FILES.hooks],[...kernel.POSIZIONI_CONFIGURAZIONE.hooks]);
  assert.deepEqual([...PROJECT_CONFIG_FILES.mcp],[...kernel.POSIZIONI_CONFIGURAZIONE.mcp]);
});

test('F-H-001: a hook and a server in .talos/ are trust resources of their own kind and id',async()=>{
  const root=await project({'.talos/hooks.json':{hooks:[hook('h-block-notes')]},'.talos/mcp.json':{server:[server('docs')]}});
  const resources=await inventoryProjectResources(await resolveWorkspaceIdentity({projectRoot:root}));
  const row=(kind:string,id:string)=>resources.find(x=>x.kind===kind&&x.id===id);
  assert.equal(row('hook','h-block-notes')?.relativePath,'.talos/hooks.json');
  assert.equal(row('mcp','docs')?.relativePath,'.talos/mcp.json');
  assert.ok(resources.some(x=>x.kind==='context'&&x.relativePath==='.talos/hooks.json'),'a change to the file still changes the project');
});

test('F-H-001: the same id in both places is the .talos one, as the kernel loads it',async()=>{
  const root=await project({'.talos/hooks.json':{hooks:[hook('guard','node -e "process.exit(1)"')]},'.harness-ui-hooks.json':{hooks:[hook('guard','echo old'),hook('legacy')]}});
  const resources=await inventoryProjectResources(await resolveWorkspaceIdentity({projectRoot:root}));
  const hooks=resources.filter(x=>x.kind==='hook').map(x=>`${x.id}@${x.relativePath}`).sort();
  assert.deepEqual(hooks,['guard@.talos/hooks.json','legacy@.harness-ui-hooks.json']);
});

test('F-H-001: once the project is trusted, a hook from .talos/hooks.json is trusted where it runs',async()=>{
  const root=await project({'.talos/hooks.json':{hooks:[hook('h-block-notes')]}});
  const trustRoot=await mkdtemp(join(tmpdir(),'talos-fh001-trust-'));
  const authority=createTrustAuthority({projectRoot:root,trustRoot,homeDir:join(trustRoot,'home')});
  await authority.trustProject({expected:await authority.inspect(),includeNested:false});
  assert.equal(await authority.verifyScope({kind:'hook',id:'h-block-notes'}),true);
});
