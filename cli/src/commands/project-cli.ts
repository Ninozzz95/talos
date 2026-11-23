import type {CommandContext} from './context.ts';
import {assertNoUnknownOptions,takeFlag,writeValue} from './context.ts';
import {createTrustAuthority,type FolderTrustDecision,type TrustAuthoritySnapshot} from '../security/trust-authority.ts';
import {t} from '../i18n/index.ts';
import {inertProjectTrustText} from '../tui/project-trust-prompt.ts';

function publicSnapshot(value:TrustAuthoritySnapshot,folder:FolderTrustDecision){
  return{
    trusted:value.trusted,reason:value.reason,project:value.workspace.canonicalRoot,identity:value.workspace.identityHash,
    nestedRepository:value.workspace.nestedRepository,nestedRepositories:value.nestedRepositories.map(entry=>entry.relativePath),
    resourceCount:value.resources.filter(row=>row.current).length,
    storeSchema:value.storeSchema,migrationRequired:value.migrationRequired,rollbackAvailable:value.rollbackAvailable,
    resources:value.resources.map(row=>({kind:row.kind,id:row.id,path:row.relativePath,state:row.state})),
    /* R4 (gate E2): the folder decision, apart from the per-file snapshot. */
    folder:{decided:folder.decided,source:folder.source,path:folder.path,sessionOnly:folder.sessionOnly}
  };
}
/** `deps.homeDir` exists for tests: which folder counts as the home folder (default: the user's home). */
export async function runProjectCommand(ctx:CommandContext,args0:string[],deps:{homeDir?:string}={}):Promise<number>{
  const args=[...args0];const operation=args.shift()??'status';
  const includeNested=operation==='trust'||operation==='migrate-trust'?takeFlag(args,'--include-nested'):false;
  assertNoUnknownOptions(args);if(args.length)throw new Error('PROJECT_COMMAND_ARGUMENT_INVALID');
  const authority=createTrustAuthority({projectRoot:ctx.projectRoot,trustRoot:ctx.paths.trust.projects,...(deps.homeDir?{homeDir:deps.homeDir}:{})});
  const view=async(snapshot:TrustAuthoritySnapshot)=>publicSnapshot(snapshot,await authority.folderDecision(snapshot));
  if(operation==='status'){writeValue(ctx,await view(await authority.inspect()));return 0;}
  if(operation==='trust'){
    const before=await authority.inspect();const folder=await authority.folderDecision(before);
    /* Q-R4-1: the home folder and a drive root are never saved. Their project files still follow the snapshot rule. */
    if(folder.sessionOnly){
      const sessionLine=t('firstrun.project.sessionOnly',{path:inertProjectTrustText(before.workspace.canonicalRoot)})+'\n';
      /* Q-R4-17: its files are trusted only by the interactive question, for that session; this command saves nothing. */
      writeValue(ctx,publicSnapshot(before,folder),sessionLine);return 0;
    }
    if(before.trusted&&folder.decided){writeValue(ctx,publicSnapshot(before,folder),before.migrationRequired?`Project already trusted; run talos project migrate-trust to migrate the legacy store explicitly\n`:`Project already trusted ${before.workspace.canonicalRoot}\n`);return 0;}
    const verified=await authority.trustProject({expected:before,includeNested});
    writeValue(ctx,await view(verified),`Trusted project ${verified.workspace.canonicalRoot}\n`);return 0;
  }
  if(operation==='revoke'){
    const revoked=await authority.revokeProject();
    writeValue(ctx,await view(revoked),`Revoked project ${revoked.workspace.canonicalRoot}\n`);return 0;
  }
  if(operation==='migrate-trust'){
    const before=await authority.inspect();
    if(before.storeSchema!=='v1'){
      writeValue(ctx,await view(before),before.storeSchema==='v2'?'Project trust store is already v2; no migration was performed\n':'No legacy trust record to migrate\n');return 0;
    }
    const migrated=await authority.migrateLegacy({includeNested});
    writeValue(ctx,await view(migrated),`Project trust store migrated to v2; rollback backup: ${await authority.migrationBackupPath()}\n`);return 0;
  }
  if(operation==='rollback-trust-migration'){
    const before=await authority.inspect();
    if(!before.rollbackAvailable){writeValue(ctx,await view(before),'No migration rollback backup is available\n');return 0;}
    const rolledBack=await authority.rollbackMigration();
    writeValue(ctx,await view(rolledBack),`Rolled project trust store back to legacy v1\n`);return 0;
  }
  throw new Error(`Unsupported project operation: ${operation}`);
}
