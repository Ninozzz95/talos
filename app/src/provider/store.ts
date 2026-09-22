import {createTalosSystemKeyring} from './system-keyring.ts';
export type KeyringAdapter={get(service:string,account:string):Promise<string|null>|string|null;set(service:string,account:string,value:string):Promise<void>|void;remove(service:string,account:string):Promise<void>|void};
export type ProviderDefinition={env:string[];requiresKey:boolean;label?:string};
const SERVICE='talos-cli-provider';
function cleanKey(v:string):string{const x=v.trim();if(!x||x.length>4096||/[\r\n\0]/u.test(x))throw new Error('PROVIDER_KEY_INVALID');return x;}
export function createCliProviderStore({env,keyring,definitions}:{env:Record<string,string|undefined>;keyring:KeyringAdapter;definitions:Record<string,ProviderDefinition>}){
 const def=(id:string)=>{const d=definitions[id];if(!d)throw new Error('PROVIDER_INVALID');return d;};
 const envKey=(id:string)=>{for(const n of def(id).env){const v=env[n];if(v?.trim())return cleanKey(v);}return null;};
 return{
  async getKey(id:string){const e=envKey(id);if(e)return e;const v=await keyring.get(SERVICE,id);return v?cleanKey(v):null;},
  async setKey(id:string,value:string){def(id);await keyring.set(SERVICE,id,cleanKey(value));},
  async removeKey(id:string){def(id);await keyring.remove(SERVICE,id);},
  async listPublic(){const rows=[];for(const [id,d] of Object.entries(definitions)){rows.push({id,label:d.label??id,requiresKey:d.requiresKey,configured:d.requiresKey?Boolean(await this.getKey(id)):true});}return rows;},
 };
}
export async function createSystemKeyring(repoRoot:string):Promise<KeyringAdapter>{const keyring=createTalosSystemKeyring(repoRoot);if(!keyring)throw new Error('PROVIDER_STORE_UNAVAILABLE');return keyring;}
