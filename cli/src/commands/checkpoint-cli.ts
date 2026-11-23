import {join} from 'node:path';
import {hasActiveRuns} from '../runtime/active-run.ts';
import {checkpointFilesText} from '../tui/overlays/checkpoint-picker.ts';
import {checkpointChanges,createCheckpointStore,type CheckpointRecord} from '../workspace/checkpoint-store.ts';
import {pruneCheckpoints,pruneReportLine} from '../workspace/checkpoint-prune.ts';
import {redoCheckpoint,undoCheckpoint} from '../workspace/restore.ts';
import {assertNoUnknownOptions,writeValue,type CommandContext} from './context.ts';

function usage():never{throw Object.assign(new Error('Usage: talos checkpoint <list|show|undo|redo|prune> [checkpoint-id] [--keep N] [--days D] [--dry-run]'),{code:'CLI_USAGE_ERROR'});}
function summary(record:CheckpointRecord){return{id:record.id,operation:record.operation,sessionId:record.sessionId,commandId:record.commandId,state:record.state,createdAt:record.createdAt,finalizedAt:record.finalizedAt,reversible:record.reversible,nonReversibleReason:record.nonReversibleReason,coverage:record.pre.coverage,exclusions:record.pre.exclusions,writeEvidenceCount:record.writeEvidence.length,files:checkpointChanges(record)};}
/* R5b D3 (Q-R5-13): the files each checkpoint changed, under its line (gate finding 10: the list named no file). */
export function checkpointFilesLine(record:CheckpointRecord){return checkpointFilesText(checkpointChanges(record));}
function humanSummary(record:CheckpointRecord){return`${record.id}  ${record.state}  ${record.operation}  ${record.createdAt}${record.reversible?'':`  non-reversible:${record.nonReversibleReason??'unknown'}`}\n  ${checkpointFilesLine(record)}\n`;}
export async function runCheckpointCommand(ctx:CommandContext,argv:string[]):Promise<number>{
  /* F-023: `prune` owns its flags (--keep/--days/--dry-run), so it is dispatched before the shared no-flags assert
     that the other actions rely on. */
  if(argv[0]==='prune')return runCheckpointPrune(ctx,argv.slice(1));
  const args=[...argv];assertNoUnknownOptions(args);const action=args.shift();if(!action)usage();const store=createCheckpointStore({rootDir:ctx.paths.checkpointsRoot??join(ctx.paths.dataRoot,'checkpoints'),projectRoot:ctx.projectRoot});
  if(action==='list'){
    if(args.length)usage();const rows=await store.list();writeValue(ctx,rows.map(summary),rows.length?rows.map(humanSummary).join(''):'No checkpoints.\n');return 0;
  }
  if(action==='show'){
    const id=args.shift();if(!id||args.length)usage();const record=await store.show(id);writeValue(ctx,record,`${humanSummary(record)}Coverage: ${JSON.stringify(record.pre.coverage)}\nExclusions: ${record.pre.exclusions.join(' | ')||'none'}\n`);return 0;
  }
  if(action==='undo'||action==='redo'){
    const id=args.shift();if(args.length)usage();if(await hasActiveRuns(ctx.paths))throw Object.assign(new Error('CHECKPOINT_ACTIVE_RUN_CONFLICT'),{code:'CHECKPOINT_ACTIVE_RUN_CONFLICT'});const record=action==='undo'?await undoCheckpoint({store,...(id?{id}:{})}):await redoCheckpoint({store,...(id?{id}:{})});writeValue(ctx,record,`${action} ${record.id}: ${record.state}\n`);return 0;
  }
  usage();
}

/* F-023 (audit 0.1.22): the checkpoint store grew unbounded because nothing ever pruned. The command reports what it
   kept, deleted and reclaimed; --dry-run writes nothing. */
async function runCheckpointPrune(ctx:CommandContext,args:string[]):Promise<number>{
  let keep=20,days:number|null=null,dryRun=false;
  while(args.length){
    const flag=args.shift() as string;
    if(flag==='--keep'){keep=Number(args.shift());if(!Number.isInteger(keep)||keep<1)usage();}
    else if(flag==='--days'){days=Number(args.shift());if(!Number.isInteger(days)||days<0)usage();}
    else if(flag==='--dry-run')dryRun=true;
    else usage();
  }
  const store=createCheckpointStore({rootDir:ctx.paths.checkpointsRoot??join(ctx.paths.dataRoot,'checkpoints'),projectRoot:ctx.projectRoot});
  const report=await pruneCheckpoints({rootDir:store.rootDir,keep,olderThanDays:days,dryRun});
  writeValue(ctx,report,`${pruneReportLine(report)}\n`);
  return 0;
}
