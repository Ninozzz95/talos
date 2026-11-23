/*
 * F-H-001 (stress test of 0.5.0, 08/10/2026): where a project keeps its hooks and its MCP servers. The kernel reads
 * `.talos/<file>` first and the older name at the project root second, and the first entry with an id wins
 * (harness-ui/src/configurazione-progetto.mjs POSIZIONI_CONFIGURAZIONE and primaPerId, PO-26 of 24/09/2026). The CLI's
 * trust inventory read only the older name, so a hook in `.talos/hooks.json` was listed and loaded but could never be
 * trusted (HOOK_RESOURCE_NOT_FOUND). The loader and the trust check read the same places in the same order; a test
 * compares this list with the kernel's.
 */
import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const PROJECT_CONFIG_FILES=Object.freeze({
 hooks:Object.freeze(['.talos/hooks.json','.harness-ui-hooks.json'] as const),
 mcp:Object.freeze(['.talos/mcp.json','.harness-ui-mcp.json'] as const),
});

/** The file a hook or a server with this id comes from, as the kernel loads it (the first that lists it); the older name when none does. */
export async function projectConfigFileFor(root:string,kind:'hooks'|'mcp',id:string):Promise<string>{
 const list=kind==='hooks'?'hooks':'server';
 for(const relative of PROJECT_CONFIG_FILES[kind]){
  let data:any=null;try{data=JSON.parse(await readFile(path.join(root,relative),'utf8'));}catch{continue;}
  if(Array.isArray(data?.[list])&&data[list].some((row:any)=>row?.id===id))return path.join(root,relative);
 }
 return path.join(root,PROJECT_CONFIG_FILES[kind][1]);
}
