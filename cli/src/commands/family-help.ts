/*
 * F-UX-001 (stress-test smoke of rc.1, 08/10/2026): `--help` worked only at the top; `talos <family> --help` answered "Unknown option: --help" and
 * `talos provider --help` a provider failure. Here is the usage of each family. The operations are the ones the command code dispatches
 * (test/commands/family-help.test.ts reads the code and fails if this table drifts); the system families take options instead.
 */
import {CLI_VERSION} from '../version.ts';
import {t} from '../i18n/index.ts';
import {OPERATION_HELP} from '../i18n/operation-help.ts';
export {OPERATION_HELP};

export const FAMILY_OPERATIONS:Readonly<Record<string,readonly string[]>>=Object.freeze({
  project:['status','trust','revoke','migrate-trust','rollback-trust-migration'],
  config:['permissions','list','origins','get','set','unset','show','migrate','rollback'],
  provider:['list','login','logout','status','set-key','env-key','remove-key','configure','test','exclusions','exclude','allow'],
  model:['list','use','effort'],
  session:['list','search','resume','tag','untag','pin','unpin','rename','context','show','fork','share','export','delete','import'],
  mcp:['list','trust','untrust','test'],
  hook:['list','trust','untrust','dry-run','history','quarantine','release','release-quarantine'],
  plugin:['install','remove','list','trust','untrust','quarantine','release','release-quarantine'],
  command:['list','show','run'],
  memory:['list','search','add','update','delete'],
  notes:['list','add','update','delete','link','unlink'],
  tasks:['list','add','update','complete','delete','depend','undepend','evidence','unevidence','assign','unassign','schedule','unschedule'],
  library:['list','search','read','preview','duplicates','context-ref','import','export','rename','delete','versions','restore'],
  research:['start','list','read','rename','delete','export','pause','resume','cancel'],
  automation:['install-runner','uninstall-runner','health','list','show','add','edit','serve','history','enable','disable','delete','run'],
  forge:['list','inspect','validate','scan','simulate','install','versions','rollback','enable','disable'],
  checkpoint:['list','show','undo','redo','prune'],
  /* 0.6.15: bare `talos remote` pairs a phone (commands/remote-cli.ts) */
  remote:['list','revoke','relay'],
  diagnostic:['bundle'],
});
/** The families that take options rather than operations (system-cli.ts). */
export const FAMILY_OPTIONS=Object.freeze({
  doctor:'common.help.options.doctor',
  logs:'common.help.options.logs',
  diagnostic:'common.help.options.diagnostic',
  update:'common.help.options.update',
  init:'common.help.options.init',
} as const);

export function isHelpRequest(args:readonly string[]):boolean{return args.includes('--help')||args.includes('-h');}
/** The operation's own help, or null when `operation` is not one of the family's (the family help answers then). */
export function operationHelpText(family:string,operation:string|undefined):string|null{
  if(!operation||!Object.hasOwn(OPERATION_HELP,family)||!Object.hasOwn(OPERATION_HELP[family]!,operation))return null;
  const help=OPERATION_HELP[family]![operation]!;
  const lines=[t('common.help.header',{version:CLI_VERSION}),t('common.help.operationUsage',{usage:help.usage})];
  if(help.options?.length){
    const width=Math.max(...help.options.map(([option])=>option.length));
    lines.push(t('common.help.operationOptions'),...help.options.map(([option,what])=>`  ${option.padEnd(width)}  ${what}`));
  }
  lines.push(t('common.help.operationOthers',{family}),t('common.help.more'));
  return `${lines.join('\n')}\n`;
}

export function familyHelpText(family:string):string{
  const lines=[t('common.help.header',{version:CLI_VERSION})];
  const operations=FAMILY_OPERATIONS[family];
  if(family in FAMILY_OPTIONS)lines.push(t('common.help.familyOptions',{family,options:t(FAMILY_OPTIONS[family as keyof typeof FAMILY_OPTIONS])}).trimEnd());
  else lines.push(t('common.help.familyUsage',{family}));
  if(operations&&!(family in FAMILY_OPTIONS))lines.push(t('common.help.operations',{list:operations.join(', ')}));
  lines.push(t('common.help.more'));
  return `${lines.join('\n')}\n`;
}
