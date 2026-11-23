import {parseArgs} from 'node:util';

export type PermissionMode = 'default'|'acceptEdits'|'plan'|'auto'|'dontAsk'|'bypassPermissions';
export type OutputFormat = 'text'|'json'|'stream-json';
export type ProtocolVersion = 'v1'|'v2';
export type CliInvocation = {
  command: 'run'|'version'|'help'|'subcommand';
  prompt?: string;
  /** P17: `talos setup` — the interface opens with the guided setup started. */
  setup?: boolean;
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
  /** 0.6.13: `--attach-if-too-large` — in `-p`, a message too large for the model is sent as an attachment instead of failing. */
  attachIfTooLarge?: boolean;
  positionals: string[];
};

const MODES = new Set<PermissionMode>(['default','acceptEdits','plan','auto','dontAsk','bypassPermissions']);
const FORMATS = new Set<OutputFormat>(['text','json','stream-json']);
const PROTOCOLS = new Set<ProtocolVersion>(['v1','v2']);
const SUBCOMMANDS = new Set(['project','config','provider','model','session','mcp','hook','plugin','command','memory','notes','tasks','library','research','automation','forge','checkpoint','doctor','logs','diagnostic','update','init','remote']);

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
  /* F-B-001, same class: after a -p prompt a word is a word of the prompt, never a command (`-p explain provider errors` ran `provider`
     and sent no prompt at all). A command's own -p comes after the command's name and is untouched. */
  const printBefore=first>=0&&argv.slice(0,first).some(token=>token==='-p'||token==='--print'||token.startsWith('--print=')||(/^-p./u.test(token)&&!token.startsWith('--')));
  const subcommandIndex=first>=0&&!printBefore&&SUBCOMMANDS.has(argv[first]!)?first:-1;
  const trailingJson=new Set<number>();
  if(subcommandIndex>=0&&!argv.slice(0,subcommandIndex).includes('--')){
    for(let i=subcommandIndex+1;i<argv.length&&argv[i]!=='--';i++)if(argv[i]==='--json')trailingJson.add(i);
  }
  const parseArgv=subcommandIndex>=0?[...argv.slice(0,subcommandIndex),...Array.from(trailingJson,()=> '--json')]:argv;
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
      /* 0.6.13 (owner 22/10/2026): a request too large for the model goes as an attachment (head, tail and a file the model reads) */
      'attach-if-too-large':{type:'boolean'},
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
      positionals:argv.slice(subcommandIndex).filter((_,index)=>!trailingJson.has(subcommandIndex+index)),
    };
  }

  /* P17 (owner decision 4): `talos setup` alone is the guided setup, not a prompt that says "setup". */
  const setup = values.print === undefined && outputFormat === 'text' && positionals.length === 1 && positionals[0] === 'setup';
  /* Stress test 0.5.6, F-B-001 (S1): with -p the words after the first were dropped in silence (`-p alpha beta gamma` sent "alpha", exit 0).
     They belong to the prompt, as they do without -p. Nobody else loses them: OpenCode joins them (cmd/run.ts, `[...args.message].join(" ")`),
     Pi keeps each as a message (cli/args.ts), Codex (exec/src/cli.rs, one `prompt`) and Hermes (-q, argparse) refuse the extra ones. */
  const promptParts = values.print !== undefined ? [values.print, ...positionals] : setup ? [] : positionals;
  const prompt = promptParts.length ? promptParts.join(' ') : undefined;
  const interactive = values.print === undefined && outputFormat === 'text';
  const timeoutSeconds=positiveInt(values.timeout,'--timeout');
  return {
    command:'run', interactive, outputFormat, protocolVersion,
    ...(setup?{setup:true}:{}),
    ...(prompt!==undefined?{prompt}:{}), ...(rawMode!==undefined?{permissionMode:rawMode as PermissionMode}:{}),
    ...(values.project!==undefined?{project:values.project}:{}), ...(values.model!==undefined?{model:values.model}:{}),
    ...(values.resume!==undefined?{resume:values.resume}:{}), ...(values.fork!==undefined?{fork:values.fork}:{}),
    verbose:values.verbose ?? false, color:!(values['no-color'] ?? false), ...(timeoutSeconds!==undefined?{timeoutSeconds}:{}),
    ...(values['attach-if-too-large']?{attachIfTooLarge:true}:{}),
    positionals:[...positionals],
  };
}
