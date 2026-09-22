import type {CommandContext} from './context.ts';
import {assertNoUnknownOptions,takeFlag,writeValue} from './context.ts';
import {createTrustAuthority,type TrustAuthoritySnapshot} from '../security/trust-authority.ts';

function publicSnapshot(value:TrustAuthoritySnapshot){
  return{
    trusted:value.trusted,reason:value.reason,project:value.workspace.canonicalRoot,identity:value.workspace.identityHash,
    nestedRepository:value.workspace.nestedRepository,nestedRepositories:value.nestedRepositories.map(entry=>entry.relativePath),
    resourceCount:value.resources.filter(row=>row.current).length,
    storeSchema:value.storeSchema,migrationRequired:value.migrationRequired,rollbackAvailable:value.rollbackAvailable,
    resources:value.resources.map(row=>({kind:row.kind,id:row.id,path:row.relativePath,state:row.state}))
  };
}
export async function runProjectCommand(ctx:CommandContext,args0:string[]):Promise<number>{
  const args=[...args0];const operation=args.shift()??'status';
  const includeNested=operation==='trust'||operation==='migrate-trust'?takeFlag(args,'--include-nested'):false;
  assertNoUnknownOptions(args);if(args.length)throw new Error('PROJECT_COMMAND_ARGUMENT_INVALID');
  const authority=createTrustAuthority({projectRoot:ctx.projectRoot,trustRoot:ctx.paths.trust.projects});
  if(operation==='status'){writeValue(ctx,publicSnapshot(await authority.inspect()));return 0;}
  if(operation==='trust'){
    const before=await authority.inspect();
    if(before.trusted){writeValue(ctx,publicSnapshot(before),before.migrationRequired?`Project already trusted; run talos project migrate-trust to migrate the legacy store explicitly\n`:`Project already trusted ${before.workspace.canonicalRoot}\n`);return 0;}
    const verified=await authority.trustProject({expected:before,includeNested});
    writeValue(ctx,publicSnapshot(verified),`Trusted project ${verified.workspace.canonicalRoot}\n`);return 0;
  }
  if(operation==='revoke'){
    const revoked=await authority.revokeProject();
    writeValue(ctx,publicSnapshot(revoked),`Revoked project ${revoked.workspace.canonicalRoot}\n`);return 0;
  }
  if(operation==='migrate-trust'){
    const before=await authority.inspect();
    if(before.storeSchema!=='v1'){
      writeValue(ctx,publicSnapshot(before),before.storeSchema==='v2'?'Project trust store is already v2; no migration was performed\n':'No legacy trust record to migrate\n');return 0;
    }
    const migrated=await authority.migrateLegacy({includeNested});
    writeValue(ctx,publicSnapshot(migrated),`Project trust store migrated to v2; rollback backup: ${await authority.migrationBackupPath()}\n`);return 0;
  }
  if(operation==='rollback-trust-migration'){
    const before=await authority.inspect();
    if(!before.rollbackAvailable){writeValue(ctx,publicSnapshot(before),'No migration rollback backup is available\n');return 0;}
    const rolledBack=await authority.rollbackMigration();
    writeValue(ctx,publicSnapshot(rolledBack),`Rolled project trust store back to legacy v1\n`);return 0;
  }
  throw new Error(`Unsupported project operation: ${operation}`);
}
