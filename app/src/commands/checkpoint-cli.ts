import {join} from 'node:path';
import {hasActiveRuns} from '../runtime/active-run.ts';
import {createCheckpointStore,type CheckpointRecord} from '../workspace/checkpoint-store.ts';
import {redoCheckpoint,undoCheckpoint} from '../workspace/restore.ts';
import {assertNoUnknownOptions,writeValue,type CommandContext} from './context.ts';

function usage():never{throw Object.assign(new Error('Usage: talos checkpoint <list|show|undo|redo> [checkpoint-id]'),{code:'CLI_USAGE_ERROR'});}
function summary(record:CheckpointRecord){return{id:record.id,operation:record.operation,sessionId:record.sessionId,commandId:record.commandId,state:record.state,createdAt:record.createdAt,finalizedAt:record.finalizedAt,reversible:record.reversible,nonReversibleReason:record.nonReversibleReason,coverage:record.pre.coverage,exclusions:record.pre.exclusions,writeEvidenceCount:record.writeEvidence.length};}
function humanSummary(record:CheckpointRecord){return`${record.id}  ${record.state}  ${record.operation}  ${record.createdAt}${record.reversible?'':`  non-reversible:${record.nonReversibleReason??'unknown'}`}\n`;}
export async function runCheckpointCommand(ctx:CommandContext,argv:string[]):Promise<number>{
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
