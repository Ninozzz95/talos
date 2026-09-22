import {parseArgs} from 'node:util';

export type PermissionMode = 'default'|'acceptEdits'|'plan'|'auto'|'dontAsk'|'bypassPermissions';
export type OutputFormat = 'text'|'json'|'stream-json';
export type ProtocolVersion = 'v1'|'v2';
export type CliInvocation = {
  command: 'run'|'version'|'help'|'subcommand';
  prompt?: string;
  interactive: boolean;
  outputFormat: OutputFormat;
  protocolVersion?: ProtocolVersion;
  permissionMode?: PermissionMode;
  project?: string;
  model?: string;
  resume?: string;
  fork?: string;
  verbose: boolean;
  color: boolean;
  timeoutSeconds?: number;
  positionals: string[];
};

const MODES = new Set<PermissionMode>(['default','acceptEdits','plan','auto','dontAsk','bypassPermissions']);
const FORMATS = new Set<OutputFormat>(['text','json','stream-json']);
const PROTOCOLS = new Set<ProtocolVersion>(['v1','v2']);
const SUBCOMMANDS = new Set(['project','config','provider','model','session','mcp','hook','plugin','command','memory','notes','tasks','library','research','automation','forge','checkpoint','doctor','logs','diagnostic','update','init']);

function positiveInt(raw: string|undefined, flag: string): number|undefined {
  if (raw === undefined) return undefined;
  if (!/^\d+$/u.test(raw) || Number(raw) <= 0) throw new Error(flag+' must be a positive integer');
  return Number(raw);
}

function firstPositionalIndex(argv:string[]):number{
  const needsValue=new Set(['--print','-p','--output-format','--protocol','--project','--model','--permission-mode','--resume','--fork','--timeout']);
  for(let i=0;i<argv.length;i++){
    const token=argv[i]!;
    if(token==='--')return i+1<argv.length?i+1:-1;
    if(token.startsWith('--')&&token.includes('='))continue;
    if(token.startsWith('-')){if(needsValue.has(token))i+=1;continue;}
    return i;
  }
  return -1;
}

export function parseCliArgs(argv: string[]): CliInvocation {
  const first=firstPositionalIndex(argv);
  const subcommandIndex=first>=0&&SUBCOMMANDS.has(argv[first]!)?first:-1;
  const parseArgv=subcommandIndex>=0?argv.slice(0,subcommandIndex):argv;
  const {values, positionals} = parseArgs({
    args: parseArgv,
    allowPositionals: true,
    strict: true,
    options: {
      print:{type:'string',short:'p'},
      json:{type:'boolean'},
      'output-format':{type:'string'},
      protocol:{type:'string'},
      project:{type:'string'}, model:{type:'string'},
      'permission-mode':{type:'string'}, resume:{type:'string'}, fork:{type:'string'},
      verbose:{type:'boolean',short:'v'}, 'no-color':{type:'boolean'}, timeout:{type:'string'},
      version:{type:'boolean'}, help:{type:'boolean',short:'h'},
    }
  });
  if (values.resume && values.fork) throw new Error('--resume and --fork are mutually exclusive');

  const rawProtocol=values.protocol;
  if(rawProtocol!==undefined&&!PROTOCOLS.has(rawProtocol as ProtocolVersion))throw new Error('Invalid protocol: '+rawProtocol);
  const protocolVersion=(rawProtocol??'v1') as ProtocolVersion;

  if (values.version) return {command:'version',interactive:false,outputFormat:'text',protocolVersion,verbose:false,color:true,positionals:[]};
  if (values.help) return {command:'help',interactive:false,outputFormat:'text',protocolVersion,verbose:false,color:true,positionals};

  const rawMode = values['permission-mode'];
  if (rawMode !== undefined && !MODES.has(rawMode as PermissionMode)) throw new Error('Invalid permission mode: '+rawMode);
  let outputFormat: OutputFormat = 'text';
  if (values.json) outputFormat = 'json';
  if (values['output-format'] !== undefined) {
    if (!FORMATS.has(values['output-format'] as OutputFormat)) throw new Error('Invalid output format: '+values['output-format']);
    outputFormat = values['output-format'] as OutputFormat;
  }

  if(protocolVersion==='v2'&&subcommandIndex>=0)throw new Error('--protocol v2 is only available for headless runs');
  if(protocolVersion==='v2'&&outputFormat==='text')throw new Error('--protocol v2 requires --json or --output-format stream-json');

  if (subcommandIndex >= 0) {
    const timeoutSeconds=positiveInt(values.timeout,'--timeout');
    return {
      command:'subcommand', interactive:false, outputFormat, protocolVersion,
      ...(rawMode!==undefined?{permissionMode:rawMode as PermissionMode}:{}),
      ...(values.project!==undefined?{project:values.project}:{}), ...(values.model!==undefined?{model:values.model}:{}),
      ...(values.resume!==undefined?{resume:values.resume}:{}), ...(values.fork!==undefined?{fork:values.fork}:{}),
      verbose:values.verbose ?? false, color:!(values['no-color'] ?? false), ...(timeoutSeconds!==undefined?{timeoutSeconds}:{}),
      positionals:argv.slice(subcommandIndex),
    };
  }

  const promptParts = values.print !== undefined ? [values.print] : positionals;
  const prompt = promptParts.length ? promptParts.join(' ') : undefined;
  const interactive = values.print === undefined && outputFormat === 'text';
  const timeoutSeconds=positiveInt(values.timeout,'--timeout');
  return {
    command:'run', interactive, outputFormat, protocolVersion,
    ...(prompt!==undefined?{prompt}:{}), ...(rawMode!==undefined?{permissionMode:rawMode as PermissionMode}:{}),
    ...(values.project!==undefined?{project:values.project}:{}), ...(values.model!==undefined?{model:values.model}:{}),
    ...(values.resume!==undefined?{resume:values.resume}:{}), ...(values.fork!==undefined?{fork:values.fork}:{}),
    verbose:values.verbose ?? false, color:!(values['no-color'] ?? false), ...(timeoutSeconds!==undefined?{timeoutSeconds}:{}),
    positionals:[...positionals],
  };
}
