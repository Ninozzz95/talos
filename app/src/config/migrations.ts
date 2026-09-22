import type {TalosCliConfig,UiTheme} from './types.ts';

export const CURRENT_CONFIG_VERSION=1 as const;
const CURRENT_THEMES=new Set<UiTheme>(['calm','ember','coral','rose','violet','indigo','azure','cyan','teal','jade','mono']);
const LEGACY_THEME=new Map<string,UiTheme>([['auto','calm'],['dark','calm'],['light','calm'],['mono','mono']]);

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
  if(fromVersion!==0)fail('CONFIG_VERSION_UNSUPPORTED');

  const next=structuredClone(source) as Record<string,unknown>;
  next.version=CURRENT_CONFIG_VERSION;
  const ui=objectValue(next.ui);
  if(next.ui!==undefined||Object.keys(ui).length){
    const rawTheme=ui.theme;
    if(typeof rawTheme==='string'){
      const migrated=LEGACY_THEME.get(rawTheme)??(CURRENT_THEMES.has(rawTheme as UiTheme)?rawTheme as UiTheme:null);
      if(migrated)ui.theme=migrated;
    }
    next.ui=ui;
  }
  return{value:next as TalosCliConfig,fromVersion,toVersion:CURRENT_CONFIG_VERSION,changed:true,steps:['v0-to-v1']};
}
