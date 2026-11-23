/*
 * Z.AI addresses the person chooses from (owner 14/10/2026, CLI and desktop: «the Z.AI key goes ONLY to the address you chose;
 * another one only when you ask»; «Te lo chiede quando metti la chiave»). Z.AI bills the GLM Coding Plan and the pay-as-you-go
 * balance separately, and the China addresses separately again (docs.z.ai/devpack/tool/others, read 09/10/2026). The kernel no
 * longer probes them for the CLI (`zai-indirizzo.mjs`, `soloIndirizzo`), so the person picks one before a key is sent anywhere.
 *
 * The endpoints are the kernel's own (`INDIRIZZI_ZAI`), pinned by test/provider/zai-addresses.test.ts. The order is the owner's
 * 09/10 «plan first» (as Pi's default, Cline's `zai-coding-plan` and Goose); OpenCode and Cline list plan and balance as two
 * providers the person picks, and none of them sends the key to an address the person did not pick except Hermes, which probes.
 */
export type ZaiAddress={id:'coding'|'general'|'coding-cn'|'general-cn';endpoint:string;label:string;/** what the person types after `--address` */word:string};
export const ZAI_PROVIDER='zai';
export const ZAI_ADDRESSES:readonly ZaiAddress[]=Object.freeze([
  Object.freeze({id:'coding',endpoint:'https://api.z.ai/api/coding/paas/v4',label:'GLM Coding Plan',word:'plan'}),
  Object.freeze({id:'general',endpoint:'https://api.z.ai/api/paas/v4',label:'pay-as-you-go balance',word:'balance'}),
  Object.freeze({id:'coding-cn',endpoint:'https://open.bigmodel.cn/api/coding/paas/v4',label:'GLM Coding Plan (China)',word:'plan-china'}),
  Object.freeze({id:'general-cn',endpoint:'https://open.bigmodel.cn/api/paas/v4',label:'pay-as-you-go balance (China)',word:'balance-china'}),
] as ZaiAddress[]);

const trimmed=(value:string)=>value.trim().replace(/\/+$/u,'');
/** The address an endpoint is, or null (an address of the person's own, not one of Z.AI's four). */
export function zaiAddressOf(endpoint:unknown):ZaiAddress|null{
  if(typeof endpoint!=='string'||!endpoint)return null;
  const wanted=trimmed(endpoint);return ZAI_ADDRESSES.find(address=>address.endpoint===wanted)??null;
}
/** What the person typed: one of the four words, or one of the four endpoints. Null for anything else. */
export function parseZaiAddress(value:unknown):ZaiAddress|null{
  if(typeof value!=='string')return null;
  const word=value.trim().toLowerCase();
  return ZAI_ADDRESSES.find(address=>address.word===word)??zaiAddressOf(value);
}
/** The person chose an address for Z.AI (the store's `endpointConfigured`): only then may a Z.AI key be sent. */
export function zaiAddressChosen(runtime:unknown):boolean{
  return Boolean(runtime&&typeof runtime==='object'&&(runtime as {endpointConfigured?:unknown}).endpointConfigured===true);
}
/*
 * The network door's rule (14/10/2026): a request to one of Z.AI's four addresses leaves only when it is the address the person
 * chose; nothing chosen means none of them. Any other host is not this rule's business (zai-anthropic has its own address).
 */
export function zaiRequestAllowed(url:unknown,runtime:unknown):boolean{
  const target=String(url??'');
  /* review of 0.6.4 (NIT): compared as URLs, so `HTTPS://API.Z.AI:443/…` is the same address as `https://api.z.ai/…` and does not slip
     past the door; a string that is not a URL keeps the plain comparison */
  let parsed:URL|null=null;try{parsed=new URL(target);}catch{parsed=null;}
  const same=(endpoint:string)=>{
    if(!parsed)return target===endpoint||target.startsWith(`${endpoint}/`)||target.startsWith(`${endpoint}?`);
    const base=new URL(endpoint);const path=base.pathname.replace(/\/+$/u,'');
    return parsed.origin===base.origin&&(parsed.pathname===path||parsed.pathname===`${path}/`||parsed.pathname.startsWith(`${path}/`));
  };
  const address=ZAI_ADDRESSES.find(candidate=>same(candidate.endpoint));
  if(!address)return true;
  if(!zaiAddressChosen(runtime))return false;
  return zaiAddressOf((runtime as {endpoint?:unknown}).endpoint)?.id===address.id;
}
