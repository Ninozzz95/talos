const OWNER_PACKAGE_KEYS=new Set(['schemaVersion','revision','manifest','simulation']);
const SIMULATION_KEYS=new Set(['input','capabilityResults']);
const MANIFEST_ID=/^[a-z0-9][a-z0-9_-]{2,63}$/u;
const MANIFEST_FIELDS=new Set(['id','title','description','inputSchema','flow']);
const FLOW_FIELDS=new Set(['entry','maxTransitions','nodes']);
const NODE_FIELDS:Record<string,Set<string>>={
  capability:new Set(['id','type','capability','input','target','next']),
  if:new Set(['id','type','condition','then','else']),
  return:new Set(['id','type','value']),
  fail:new Set(['id','type','code','message']),
};
function fail(message:string):never{throw Object.assign(new Error('FORGE_PACKAGE_SCHEMA_INVALID: '+message),{code:'FORGE_PACKAGE_SCHEMA_INVALID'});}
function object(value:unknown):value is Record<string,any>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
export type ForgeOwnerPackage={schemaVersion:1;revision:number;manifest:Record<string,any>;simulation:{input:unknown;capabilityResults:Record<string,unknown>}};
export type ForgeScanFinding={code:string;path:string;message:string;blocking:boolean};

export function validateForgeOwnerPackage(value:unknown):ForgeOwnerPackage{
  if(!object(value))fail('package must be an object');
  for(const key of Object.keys(value))if(!OWNER_PACKAGE_KEYS.has(key))fail('unknown package field '+key);
  if(value.schemaVersion!==1)fail('schemaVersion must be 1');
  if(!Number.isSafeInteger(value.revision)||value.revision<1)fail('revision must be a positive integer');
  if(!object(value.manifest))fail('manifest must be an object');
  if(typeof value.manifest.id!=='string'||!MANIFEST_ID.test(value.manifest.id))fail('manifest.id must be a safe lowercase slug');
  if(Object.prototype.hasOwnProperty.call(value.manifest,'version')||Object.prototype.hasOwnProperty.call(value.manifest,'parentVersion'))fail('owner revision must stay outside the executable manifest');
  const simulation=value.simulation===undefined?{}:value.simulation;if(!object(simulation))fail('simulation must be an object');
  for(const key of Object.keys(simulation))if(!SIMULATION_KEYS.has(key))fail('unknown simulation field '+key);
  if(simulation.capabilityResults!==undefined&&!object(simulation.capabilityResults))fail('simulation.capabilityResults must be an object');
  return{schemaVersion:1,revision:Number(value.revision),manifest:value.manifest,simulation:{input:simulation.input??{},capabilityResults:simulation.capabilityResults??{}}};
}

export function scanForgeManifest(manifest:any,canonical:any){
  const findings:ForgeScanFinding[]=[];
  const add=(code:string,path:string,message:string,blocking=true)=>findings.push({code,path,message,blocking});
  if(!canonical?.ok)for(const message of Array.isArray(canonical?.diagnostica)?canonical.diagnostica:['canonical validation failed'])add('FORGE_CANONICAL_VALIDATION', 'manifest', String(message), true);
  if(object(manifest))for(const key of Object.keys(manifest))if(!MANIFEST_FIELDS.has(key))add('FORGE_UNKNOWN_MANIFEST_FIELD','manifest.'+key,'unknown manifest field '+key,true);
  const flow=object(manifest?.flow)?manifest.flow:null;
  if(flow)for(const key of Object.keys(flow))if(!FLOW_FIELDS.has(key))add('FORGE_UNKNOWN_FLOW_FIELD','flow.'+key,'unknown flow field '+key,true);
  if(flow&&Array.isArray(flow.nodes)){
    flow.nodes.forEach((node:any,index:number)=>{
      if(!object(node))return;
      const allowed=NODE_FIELDS[String(node.type)]??new Set(['id','type']);
      for(const key of Object.keys(node))if(!allowed.has(key))add('FORGE_UNKNOWN_NODE_FIELD',`flow.nodes[${index}].${key}`,`unknown field "${key}" is not part of the declarative Forge DSL`,true);
    });
  }
  return{
    ok:Boolean(canonical?.ok)&&!findings.some(f=>f.blocking),
    declarativeOnly:!findings.some(f=>f.code.startsWith('FORGE_UNKNOWN_')),
    capabilities:Array.isArray(canonical?.capacita)?[...canonical.capacita]:[],
    actions:Array.isArray(canonical?.azioni)?[...canonical.azioni]:[],
    risk:typeof canonical?.rischio==='string'?canonical.rischio:'R1',
    findings,
  };
}
