import type {CliInvocation} from '../args.ts';import type {CliIo} from '../io.ts';import type {CliPaths} from '../paths.ts';
export type CommandContext={invocation:CliInvocation;io:CliIo;projectRoot:string;paths:CliPaths;repoRoot:string;createRuntimeContext:(input:any)=>Promise<any>};
export function writeValue(ctx:CommandContext,value:unknown,human?:string){if(ctx.invocation.outputFormat==='json')ctx.io.writeOut(`${JSON.stringify(value)}\n`);else ctx.io.writeOut(human??`${JSON.stringify(value,null,2)}\n`);}
export function parseJsonValue(raw:string){try{return JSON.parse(raw);}catch{throw new Error('CONFIG_VALUE_MUST_BE_JSON');}}
export function takeOption(args:string[],name:string){const i=args.indexOf(name);if(i<0)return undefined;if(i===args.length-1)throw new Error(`${name} requires a value`);const value=args[i+1]!;args.splice(i,2);return value;}
export function takeFlag(args:string[],name:string){const i=args.indexOf(name);if(i<0)return false;args.splice(i,1);return true;}
export function assertNoUnknownOptions(args:string[]){const bad=args.find(x=>x.startsWith('-'));if(bad)throw new Error(`Unknown option: ${bad}`);}
