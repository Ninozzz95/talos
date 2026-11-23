import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

export type CliPaths = {
  configRoot:string; dataRoot:string; cacheRoot:string; sessionsRoot:string; logsRoot:string; projectOverridesRoot:string; queueRoot:string; checkpointsRoot?:string;
  trust:{hooks:string;mcp:string;plugins:string;projects:string};
};
export class CliPathError extends Error {
  code:string;
  constructor(code:string){super(code);this.name='CliPathError';this.code=code;}
}

export function resolveCliPaths(env:Record<string,string|undefined>, platform:NodeJS.Platform, home:string):CliPaths {
  if (platform === 'win32') {
    if (!env.APPDATA || !env.LOCALAPPDATA) throw new CliPathError('PROFILE_PATH_UNAVAILABLE');
    const w = path.win32;
    const configRoot=w.join(env.APPDATA,'TALOS-CLI'); const dataRoot=w.join(env.LOCALAPPDATA,'TALOS-CLI'); const cacheRoot=w.join(dataRoot,'cache');
    return {configRoot,dataRoot,cacheRoot,sessionsRoot:w.join(dataRoot,'sessions'),logsRoot:w.join(dataRoot,'logs'),projectOverridesRoot:w.join(dataRoot,'projects'),queueRoot:w.join(dataRoot,'queues'),checkpointsRoot:w.join(dataRoot,'checkpoints'),trust:{hooks:w.join(dataRoot,'trust','hooks'),mcp:w.join(dataRoot,'trust','mcp'),plugins:w.join(dataRoot,'trust','plugins'),projects:w.join(dataRoot,'trust','projects')}};
  }
  if (!home) throw new CliPathError('PROFILE_PATH_UNAVAILABLE');
  const p=path.posix;
  const configRoot=env.XDG_CONFIG_HOME||p.join(home,'.config','talos-cli');
  const dataRoot=env.XDG_STATE_HOME||p.join(home,'.local','state','talos-cli');
  const cacheRoot=env.XDG_CACHE_HOME||p.join(home,'.cache','talos-cli');
  return {configRoot,dataRoot,cacheRoot,sessionsRoot:p.join(dataRoot,'sessions'),logsRoot:p.join(dataRoot,'logs'),projectOverridesRoot:p.join(dataRoot,'projects'),queueRoot:p.join(dataRoot,'queues'),checkpointsRoot:p.join(dataRoot,'checkpoints'),trust:{hooks:p.join(dataRoot,'trust','hooks'),mcp:p.join(dataRoot,'trust','mcp'),plugins:p.join(dataRoot,'trust','plugins'),projects:p.join(dataRoot,'trust','projects')}};
}

export function normalizeProjectRoot(root:string, platform:NodeJS.Platform=process.platform):string {
  const api=platform==='win32'?path.win32:path.posix;
  let normalized=api.normalize(root);
  const parsed=api.parse(normalized);
  while (normalized.length>parsed.root.length && normalized.endsWith(api.sep)) normalized=normalized.slice(0,-1);
  if (platform==='win32') normalized=normalized.replace(/^([A-Z]):/u,(_,d:string)=>`${d.toLowerCase()}:`).toLowerCase();
  return normalized;
}
export function projectId(root:string, platform:NodeJS.Platform=process.platform):string { return createHash('sha256').update(normalizeProjectRoot(root,platform)).digest('hex').slice(0,32); }
export async function ensureCliPaths(paths:CliPaths):Promise<void> {
  const dirs=[paths.configRoot,paths.dataRoot,paths.cacheRoot,paths.sessionsRoot,paths.logsRoot,paths.projectOverridesRoot,paths.queueRoot,...(paths.checkpointsRoot?[paths.checkpointsRoot]:[]),...Object.values(paths.trust)];
  for (const dir of dirs) await mkdir(dir,{recursive:true,mode:0o700});
}
