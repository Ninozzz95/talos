import {homedir} from 'node:os';import {resolve} from 'node:path';import {longPathForm} from './security/real-path.ts';
import type {CliInvocation} from './args.ts';import type {CliIo} from './io.ts';import {ensureCliPaths,resolveCliPaths,type CliPaths} from './paths.ts';import {findTalosRepoRoot} from './runtime/repo.ts';import type {CommandContext} from './commands/context.ts';import {renderSafeTalosFailure} from './errors.ts';import {FAMILY_OPERATIONS,FAMILY_OPTIONS,familyHelpText,isHelpRequest,operationHelpText} from './commands/family-help.ts';
import {runConfigCommand} from './commands/config-cli.ts';import {runProviderCommand,runModelCommand} from './commands/provider-cli.ts';import {runSessionCommand} from './commands/session-cli.ts';import {runNotesCommand,runTasksCommand,runMemoryCommand,runLibraryCommand,runForgeCommand} from './commands/services-cli.ts';import {runMcpCommand,runHookCommand,runPluginCommand,runCustomCommand} from './commands/extensions-cli.ts';import {runResearchCommand,runAutomationCommand} from './commands/advanced-cli.ts';
import {runProjectCommand} from './commands/project-cli.ts';import {runCheckpointCommand} from './commands/checkpoint-cli.ts';

export type SubcommandDeps={io:CliIo;createRuntimeContext?:(x:any)=>Promise<any>;paths?:CliPaths;repoRoot?:string};
async function defaultRuntimeContext(x:any){const {createCliRuntimeContext}=await import('./runtime/create-runtime.ts');return createCliRuntimeContext(x);}
function emitFailure(io:CliIo,inv:CliInvocation,error:unknown){const failure=renderSafeTalosFailure(inv.outputFormat,error,{component:'cli',verbose:inv.verbose});if(failure.toStderr)io.writeErr(failure.text);else io.writeOut(failure.text);return failure.exitCode;}
export async function runSubcommand(inv:CliInvocation,deps:SubcommandDeps):Promise<number>{
  const io=deps.io;const [family,...args]=inv.positionals;if(!family)return emitFailure(io,inv,Object.assign(new Error('Subcommand required'),{code:'CLI_USAGE_ERROR'}));
  /* F-UX-001: `talos <family> --help` / `-h` (anywhere after the family) prints that family's usage, before any profile or runtime is touched. */
  /* 14/10/2026: `talos <family> <operation> --help` is that operation's own help; any other help request is the family's. */
  if(isHelpRequest(args)&&(Object.hasOwn(FAMILY_OPERATIONS,family)||Object.hasOwn(FAMILY_OPTIONS,family))){io.writeOut(operationHelpText(family,args[0])??familyHelpText(family));return 0;}
  /* 0.6.14 reserved `talos remote` (never a paid turn); 0.6.15 makes it the remote control command (commands/remote-cli.ts). It is
     still a family, so it never reaches the model; its help is the family's, answered above. */
  try{
    const projectRoot=longPathForm(resolve(inv.project??process.cwd()));const paths=deps.paths??resolveCliPaths(process.env,process.platform,homedir());await ensureCliPaths(paths);const repoRoot=deps.repoRoot??findTalosRepoRoot(process.cwd());
    const ctx:CommandContext={invocation:inv,io,projectRoot,paths,repoRoot,createRuntimeContext:deps.createRuntimeContext??defaultRuntimeContext};
    switch(family){
      case'project':return await runProjectCommand(ctx,args);
      case'config':return await runConfigCommand(ctx,args);case'provider':return await runProviderCommand(ctx,args);case'model':return await runModelCommand(ctx,args);case'session':return await runSessionCommand(ctx,args);
      case'mcp':return await runMcpCommand(ctx,args);case'hook':return await runHookCommand(ctx,args);case'plugin':return await runPluginCommand(ctx,args);case'command':return await runCustomCommand(ctx,args);
      case'memory':return await runMemoryCommand(ctx,args);case'notes':return await runNotesCommand(ctx,args);case'tasks':return await runTasksCommand(ctx,args);case'library':return await runLibraryCommand(ctx,args);case'research':return await runResearchCommand(ctx,args);case'automation':return await runAutomationCommand(ctx,args);case'forge':return await runForgeCommand(ctx,args);case'checkpoint':return await runCheckpointCommand(ctx,args);
      case'remote':{const {runRemoteCommand}=await import('./commands/remote-cli.ts');return await runRemoteCommand(ctx,args);}
      case'doctor':case'logs':case'diagnostic':case'update':case'init':{const {runSystemCommand}=await import('./commands/system-cli.ts');return await runSystemCommand(ctx,family,args);}
      default:throw new Error(`Unsupported subcommand: ${family}`);
    }
  }catch(error){return emitFailure(io,inv,error);}
}
