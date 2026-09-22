import {createRequire} from 'node:module';
import {rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {CliPaths} from '../paths.ts';
import {createRedactor,redactObject,secretValuesFromEnvironment} from '../diagnostics/redact.ts';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';
import {fingerprintExecutableResourceContent} from '../security/project-trust.ts';
import {createTrustAuthority,type TrustAuthority,type TrustAuthoritySnapshot} from '../security/trust-authority.ts';

export type McpHealthState='not-probed'|'healthy'|'degraded'|'failed';
export type McpLogSource='protocol'|'stderr'|'probe';
export type McpLogEntry={source:McpLogSource;level:string|null;text:string};
export type McpCapabilities={
  tools:boolean;
  resources:boolean;
  prompts:boolean;
  logging:boolean;
  completions:boolean;
  tasks:boolean;
  experimental:string[];
};
export type McpServerView={
  id:string;
  launch:{command:string;argumentCount:number};
  trust:{
    projectTrusted:boolean;
    state:'trusted'|'changed'|'added'|'removed';
    trusted:boolean;
    currentFingerprint:string|null;
    trustedFingerprint:string|null;
    changed:boolean;
  };
  permission:{
    configuredAllowlist:string[];
    effectiveTools:string[];
    missingAllowlistedTools:string[];
    perCallApproval:'not-applied';
  };
  health:{state:McpHealthState;checkedAt:string|null;latencyMs:number|null;phase:string|null;message:string|null};
  server:{name:string;version:string|null}|null;
  protocol:{version:string|null;era:string|null}|null;
  capabilities:McpCapabilities|null;
  logs:McpLogEntry[];
};

type McpConfiguredServer={
  id:string;
  comando:string;
  argomenti?:string[];
  allowlist:string[];
  hash?:string;
  nome?:string;
  versione?:string;
};
type RawLog={source:McpLogSource;level?:string|null;text:string};
type ProbeRaw={
  latencyMs?:number;
  serverInfo?:{name?:unknown;version?:unknown}|null;
  protocolVersion?:unknown;
  protocolEra?:unknown;
  capabilities?:unknown;
  tools?:Array<{name?:unknown}>;
  logs?:RawLog[];
};
export type McpFacadeDependencies={
  authority?:TrustAuthority;
  loadServers?:()=>Promise<{server:McpConfiguredServer[]}>;
  probeServer?:(server:McpConfiguredServer)=>Promise<ProbeRaw>;
  trustCompatibility?:(server:McpConfiguredServer)=>Promise<void>;
  untrustCompatibility?:(id:string)=>Promise<void>;
  fingerprintServer?:(server:McpConfiguredServer,snapshot:TrustAuthoritySnapshot)=>Promise<string|null>;
  secretValues?:readonly string[];
};
export type McpFacadeInput={
  projectRoot:string;
  repoRoot?:string;
  paths:CliPaths;
  env?:Record<string,string|undefined>;
  clock?:()=>string;
  now?:()=>number;
};

const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/u;
const MAX_LOGS=100;
const MAX_LOG_TEXT=4096;
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
const BACKSLASH=String.fromCharCode(92);

function fail(code:string,message=code):never{throw Object.assign(new Error(message),{code});}
function serverId(value:string){if(!ID.test(value)||value.includes('..'))fail('MCP_SERVER_ID_INVALID');return value;}
function objectValue(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function textValue(value:unknown):string|null{return typeof value==='string'&&value.length>0?value:null;}
function inert(value:string){
  return String(value).replace(UNSAFE,character=>{
    if(character===BACKSLASH)return BACKSLASH+BACKSLASH;
    const code=character.codePointAt(0)!;
    return code>0xffff?BACKSLASH+'u{'+code.toString(16)+'}':BACKSLASH+'u'+code.toString(16).padStart(4,'0');
  });
}
function safeText(value:unknown,redact:(value:string)=>string){return inert(redact(String(value??''))).slice(0,MAX_LOG_TEXT);}
function normalizeCapabilities(value:unknown,redact:(value:string)=>string):McpCapabilities|null{
  const row=objectValue(value);if(!row)return null;
  const experimental=objectValue(row.experimental);
  return{
    tools:Boolean(row.tools),
    resources:Boolean(row.resources),
    prompts:Boolean(row.prompts),
    logging:Boolean(row.logging),
    completions:Boolean(row.completions),
    tasks:Boolean(row.tasks),
    experimental:experimental?Object.keys(experimental).map(value=>safeText(value,redact)).sort():[]
  };
}
function boundedLogs(rows:readonly RawLog[],redact:(value:string)=>string):McpLogEntry[]{
  return rows.slice(-MAX_LOGS).map(row=>({
    source:row.source,
    level:row.level?safeText(row.level,redact):null,
    text:safeText(row.text,redact)
  }));
}
function configuredServer(value:any):McpConfiguredServer{
  if(!value||typeof value!=='object')fail('MCP_CONFIG_MALFORMED');
  const id=serverId(String(value.id??''));const args=value.argomenti??[];
  if(typeof value.comando!=='string'||!value.comando
    ||!Array.isArray(args)||!args.every((row:unknown)=>typeof row==='string')
    ||!Array.isArray(value.allowlist)||!value.allowlist.length
    ||!value.allowlist.every((row:unknown)=>typeof row==='string'&&row.length>0))fail('MCP_CONFIG_MALFORMED');
  return{
    id,comando:value.comando,argomenti:[...args],allowlist:[...value.allowlist],
    ...(typeof value.hash==='string'?{hash:value.hash}:{}),
    ...(typeof value.nome==='string'?{nome:value.nome}:{}),
    ...(typeof value.versione==='string'?{versione:value.versione}:{})
  };
}

export function createMcpFacade(input:McpFacadeInput,deps:McpFacadeDependencies={}){
  const authority=deps.authority??createTrustAuthority({projectRoot:input.projectRoot,trustRoot:input.paths.trust.projects});
  const clock=input.clock??(()=>new Date().toISOString());
  const now=input.now??(()=>Date.now());
  const secrets=deps.secretValues??secretValuesFromEnvironment(input.env??process.env);
  const redactor=createRedactor(secrets);
  const repoRoot=()=>input.repoRoot??findTalosRepoRoot(input.projectRoot);
  let registryPromise:Promise<any>|null=null;
  let clientPromise:Promise<any>|null=null;
  const registry=()=>registryPromise??=(importTalosModule(repoRoot(),'mcp-registry.mjs') as Promise<any>);
  const clientModule=()=>clientPromise??=(importTalosModule(repoRoot(),'mcp-client.mjs') as Promise<any>);

  async function defaultLoadServers(){
    try{
      const loaded=await (await registry()).caricaServerMcp({cartella:input.projectRoot});
      if(!loaded||!Array.isArray(loaded.server))fail('MCP_CONFIG_MALFORMED');
      return{server:loaded.server.map(configuredServer)};
    }catch(error){
      if((error as any)?.code==='RESOURCE_CONFIG_MALFORMED')fail('MCP_CONFIG_MALFORMED');
      throw error;
    }
  }
  const loadServers=deps.loadServers??defaultLoadServers;

  async function compatibilityRoot(){return(await authority.compatibilityRoots()).mcp;}
  async function defaultUntrustCompatibility(id:string){await rm(join(await compatibilityRoot(),serverId(id)+'.json'),{force:true});}
  async function defaultTrustCompatibility(server:McpConfiguredServer){
    if(!server.hash)fail('MCP_COMPATIBILITY_HASH_MISSING');
    const root=await compatibilityRoot();
    await rm(join(root,serverId(server.id)+'.json'),{force:true});
    await(await registry()).fidaServerMcp({cartellaTrust:root,serverId:server.id,hash:server.hash});
  }
  const untrustCompatibility=deps.untrustCompatibility??defaultUntrustCompatibility;
  const trustCompatibility=deps.trustCompatibility??defaultTrustCompatibility;

  async function defaultFingerprintServer(server:McpConfiguredServer,snapshot:TrustAuthoritySnapshot){
    const resource=await fingerprintExecutableResourceContent({
      workspace:snapshot.workspace,
      kind:'mcp',
      id:server.id,
      path:join(snapshot.workspace.canonicalRoot,'.harness-ui-mcp.json'),
      content:JSON.stringify({comando:server.comando,argomenti:server.argomenti??[],allowlist:server.allowlist})
    });
    return resource.fingerprint;
  }
  const fingerprintServer=deps.fingerprintServer??defaultFingerprintServer;

  async function defaultProbeServer(server:McpConfiguredServer):Promise<ProbeRaw>{
    const rawLogs:RawLog[]=[];
    const push=(entry:RawLog)=>{
      if(rawLogs.length>=MAX_LOGS)return;
      rawLogs.push({...entry,text:String(entry.text).slice(0,MAX_LOG_TEXT)});
    };
    const requireFromHarness=createRequire(join(repoRoot(),'harness-ui','package.json'));
    const [clientSdk,stdioSdk]=await Promise.all([
      import(pathToFileURL(requireFromHarness.resolve('@modelcontextprotocol/client')).href),
      import(pathToFileURL(requireFromHarness.resolve('@modelcontextprotocol/client/stdio')).href)
    ]);
    const ClientBase:any=(clientSdk as any).Client;
    const TransportBase:any=(stdioSdk as any).StdioClientTransport;
    class CapturingClient extends ClientBase{
      constructor(...args:any[]){
        super(...args);
        this.setNotificationHandler?.('notifications/message',(notification:any)=>{
          const params=notification?.params??{};
          let text:string;
          try{text=typeof params.data==='string'?params.data:JSON.stringify(redactObject(params.data,secrets)??'');}
          catch{text=String(redactObject(params.data,secrets)??'');}
          push({source:'protocol',level:typeof params.level==='string'?params.level:null,text});
        });
      }
      async connect(transport:any,options?:any){
        try{
          return options===undefined?await super.connect(transport):await super.connect(transport,options);
        }catch(error){
          try{await this.close();}catch{/* The original connect failure remains authoritative. */}
          throw error;
        }
      }
    }
    class CapturingTransport extends TransportBase{
      constructor(params:any){
        super({...params,stderr:'pipe'});
        this.stderr?.on?.('data',(chunk:any)=>push({
          source:'stderr',level:'stderr',
          text:Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk)
        }));
      }
    }
    const mcp=await clientModule();let connection:any=null;let phase='connect';const started=now();
    try{
      connection=await mcp.connettiServerMcp(server,{ClientCls:CapturingClient,TransportCls:CapturingTransport});
      phase='discovery';
      const tools=await mcp.elencaToolMcp(connection);
      const client=connection.client;
      return{
        latencyMs:Math.max(0,now()-started),
        serverInfo:client.getServerVersion?.()??null,
        protocolVersion:client.getNegotiatedProtocolVersion?.()??null,
        protocolEra:client.getProtocolEra?.()??null,
        capabilities:client.getServerCapabilities?.()??null,
        tools:Array.isArray(tools)?tools:[],
        logs:rawLogs
      };
    }catch(error){
      throw Object.assign(new Error(error instanceof Error?error.message:String(error)),{
        code:typeof (error as any)?.code==='string'?(error as any).code:'MCP_PROBE_FAILED',
        mcpProbePhase:phase,
        mcpProbeLogs:rawLogs
      });
    }finally{
      try{await connection?.chiudi?.();}
      catch(error){push({source:'probe',level:'warning',text:'close failed: '+(error instanceof Error?error.message:String(error))});}
    }
  }
  const probeServer=deps.probeServer??defaultProbeServer;

  async function servers(){
    try{
      const loaded=await loadServers();
      if(!loaded||!Array.isArray(loaded.server))fail('MCP_CONFIG_MALFORMED');
      const rows=loaded.server.map(configuredServer);const seen=new Set<string>();
      for(const server of rows){if(seen.has(server.id))fail('MCP_CONFIG_MALFORMED');seen.add(server.id);}
      return rows;
    }catch(error){
      if((error as any)?.code==='RESOURCE_CONFIG_MALFORMED')fail('MCP_CONFIG_MALFORMED');
      throw error;
    }
  }
  function trustRow(snapshot:TrustAuthoritySnapshot,id:string){
    return snapshot.resources.find(row=>row.kind==='mcp'&&row.id===id&&row.current);
  }
  function view(server:McpConfiguredServer,snapshot:TrustAuthoritySnapshot):McpServerView{
    const row=trustRow(snapshot,server.id);const state=(row?.state??'added') as McpServerView['trust']['state'];
    const current=row?.currentFingerprint??null;const trusted=row?.trustedFingerprint??null;
    return{
      id:server.id,
      launch:{command:safeText(server.comando,redactor.text),argumentCount:server.argomenti?.length??0},
      trust:{
        projectTrusted:snapshot.trusted,state,trusted:state==='trusted',
        currentFingerprint:current,trustedFingerprint:trusted,
        changed:state==='changed'||Boolean(current&&trusted&&current!==trusted)
      },
      permission:{
        configuredAllowlist:server.allowlist.map(value=>safeText(value,redactor.text)),
        effectiveTools:[],missingAllowlistedTools:[],perCallApproval:'not-applied'
      },
      health:{state:'not-probed',checkedAt:null,latencyMs:null,phase:null,message:null},
      server:null,protocol:null,capabilities:null,logs:[]
    };
  }
  async function target(id:string){
    const wanted=serverId(id);const rows=await servers();const server=rows.find(row=>row.id===wanted);
    if(!server)fail('MCP_SERVER_NOT_FOUND');return server;
  }
  async function assertTrustedLoaded(server:McpConfiguredServer,snapshot:TrustAuthoritySnapshot){
    const row=trustRow(snapshot,server.id);
    if(!row||row.state!=='trusted')fail('MCP_TRUST_REQUIRED');
    if(!snapshot.trusted)fail('PROJECT_TRUST_REQUIRED');
    const loadedFingerprint=await fingerprintServer(server,snapshot);
    if(!loadedFingerprint||loadedFingerprint!==row.currentFingerprint)fail('MCP_TRUST_INVALIDATED');
  }

  return{
    async list():Promise<McpServerView[]>{
      const [rows,snapshot]=await Promise.all([servers(),authority.inspect()]);
      return rows.map(server=>view(server,snapshot));
    },
    async probe(id:string):Promise<McpServerView>{
      const server=await target(id);const snapshot=await authority.inspect();const base=view(server,snapshot);
      await assertTrustedLoaded(server,snapshot);
      try{
        const measured=await probeServer(server);
        const advertised=[...new Set((measured.tools??[])
          .map(row=>textValue(row?.name))
          .filter((row):row is string=>Boolean(row)))];
        const allowedRaw=server.allowlist.filter(name=>advertised.includes(name));
        const missingRaw=server.allowlist.filter(name=>!advertised.includes(name));
        const effective=allowedRaw.map(name=>safeText(name,redactor.text));
        const missing=missingRaw.map(name=>safeText(name,redactor.text));
        const info=objectValue(measured.serverInfo);
        return{
          ...base,
          permission:{...base.permission,effectiveTools:effective,missingAllowlistedTools:missing},
          health:{
            state:missing.length?'degraded':'healthy',
            checkedAt:clock(),
            latencyMs:typeof measured.latencyMs==='number'&&Number.isFinite(measured.latencyMs)?Math.max(0,measured.latencyMs):null,
            phase:null,
            message:missing.length?'Configured tools not advertised: '+missing.join(', '):null
          },
          server:info&&textValue(info.name)?{
            name:safeText(info.name,redactor.text),
            version:textValue(info.version)?safeText(info.version,redactor.text):null
          }:null,
          protocol:{
            version:textValue(measured.protocolVersion)?safeText(measured.protocolVersion,redactor.text):null,
            era:textValue(measured.protocolEra)?safeText(measured.protocolEra,redactor.text):null
          },
          capabilities:normalizeCapabilities(measured.capabilities,redactor.text),
          logs:boundedLogs(measured.logs??[],redactor.text)
        };
      }catch(error){
        const raw=(error as any)?.mcpProbeLogs;const logs:RawLog[]=Array.isArray(raw)?[...raw]:[];
        logs.push({source:'probe',level:'error',text:error instanceof Error?error.message:String(error)});
        return{
          ...base,
          health:{
            state:'failed',checkedAt:clock(),latencyMs:null,
            phase:textValue((error as any)?.mcpProbePhase),
            message:safeText(error instanceof Error?error.message:String(error),redactor.text)
          },
          logs:boundedLogs(logs,redactor.text)
        };
      }
    },
    async trust(id:string){
      const server=await target(id);const reviewed=await authority.inspect();const row=trustRow(reviewed,server.id);
      if(!row?.current)fail('MCP_RESOURCE_NOT_FOUND');
      const loadedFingerprint=await fingerprintServer(server,reviewed);
      if(!loadedFingerprint||loadedFingerprint!==row.currentFingerprint)fail('MCP_TRUST_INVALIDATED');
      const result=await authority.trustScope({kind:'mcp',id:server.id},{expected:reviewed});
      await trustCompatibility(server);
      return{ok:true,id:server.id,changed:result.changed,snapshot:result.snapshot};
    },
    async untrust(id:string){
      const server=await target(id);const result=await authority.untrustScope({kind:'mcp',id:server.id});
      await untrustCompatibility(server.id);
      return{ok:true,id:server.id,changed:result.changed,snapshot:result.snapshot};
    }
  };
}
