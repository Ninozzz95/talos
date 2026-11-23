import type {TalosCliConfig} from './types.ts';

export const CURRENT_CONFIG_VERSION=2 as const;
const V1_THEMES=new Set<string>(['calm','ember','coral','rose','violet','indigo','azure','cyan','teal','jade','mono']);
const LEGACY_THEME=new Map<string,string>([['auto','calm'],['dark','calm'],['light','calm'],['mono','mono']]);
/* R5b D4 (owner decision Q-R5-14): v2 themes are the product's ten dark themes; each CLI-only accent of v1 moves to the
   nearest official one by hue (coral #FB7185 -> signal #ff6f61, rose #F472B6 -> ember #ff5c62, indigo #818CF8 -> violet
   #b794f6, azure #60A5FA and cyan #22D3EE -> telemetry #6ad4d4, teal #2DD4BF -> aurora #42e7c7, jade #34D399 -> terminal
   #63f08e); calm, ember, violet and mono keep their ids. */
const V1_TO_V2_THEME=new Map<string,string>([['coral','signal'],['rose','ember'],['indigo','violet'],['azure','telemetry'],['cyan','telemetry'],['teal','aurora'],['jade','terminal']]);
const V2_THEMES=new Set<string>(['calm','forge','terminal','aurora','ember','atlas','noir','signal','violet','telemetry','mono']);

function objectValue(value:unknown):Record<string,unknown>{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function fail(code:string):never{throw Object.assign(new Error(code),{code});}

export type ConfigMigrationResult={
  value:TalosCliConfig;
  fromVersion:number;
  toVersion:number;
  changed:boolean;
  steps:string[];
};

export function migrateConfigValue(input:unknown):ConfigMigrationResult{
  if(input===null||typeof input!=='object'||Array.isArray(input))fail('CONFIG_INVALID');
  const source=structuredClone(input) as Record<string,unknown>;
  const rawVersion=source.version;
  const fromVersion=rawVersion===undefined?0:typeof rawVersion==='number'&&Number.isInteger(rawVersion)?rawVersion:fail('CONFIG_VERSION_INVALID');
  if(fromVersion>CURRENT_CONFIG_VERSION)fail('CONFIG_VERSION_UNSUPPORTED');
  if(fromVersion<0)fail('CONFIG_VERSION_INVALID');
  if(fromVersion===CURRENT_CONFIG_VERSION)return{value:source as TalosCliConfig,fromVersion,toVersion:CURRENT_CONFIG_VERSION,changed:false,steps:[]};
  const next=structuredClone(source) as Record<string,unknown>;const steps:string[]=[];
  const withTheme=(change:(theme:string)=>string|null)=>{
    const ui=objectValue(next.ui);
    if(next.ui!==undefined||Object.keys(ui).length){const raw=ui.theme;if(typeof raw==='string'){const migrated=change(raw);if(migrated)ui.theme=migrated;}next.ui=ui;}
  };
  if(fromVersion===0){withTheme(raw=>LEGACY_THEME.get(raw)??(V1_THEMES.has(raw)?raw:null));steps.push('v0-to-v1');}
  withTheme(raw=>V1_TO_V2_THEME.get(raw)??(V2_THEMES.has(raw)?raw:null));steps.push('v1-to-v2');
  next.version=CURRENT_CONFIG_VERSION;
  return{value:next as TalosCliConfig,fromVersion,toVersion:CURRENT_CONFIG_VERSION,changed:true,steps};
}
