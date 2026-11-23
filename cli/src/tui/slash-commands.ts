import {t} from '../i18n/index.ts';

const SLASH_COMMAND_META=[
  {name:'help',usage:''},
  {name:'board',usage:''},
  {name:'capability',usage:''},
  {name:'provider',usage:''},
  {name:'models',usage:''},
  /* P17 (owner decision 4): the first launch's guided setup, again. */
  {name:'setup',usage:''},
  {name:'model',usage:'[provider:model]'},
  /* R5a (owner 2026-09-24): the reasoning effort of the current model, as a line of nodes. */
  {name:'effort',usage:'[level]'},
  {name:'queue',usage:'[show|clear|run]'},
  /* R5a (Q-R5-7, Q-R5-19): what Enter does while TALOS works. */
  {name:'busy',usage:'[queue|steer|interrupt]'},
  {name:'permissions',usage:t('screen.slash.permissionsUsage')},
  {name:'plan',usage:''},
  {name:'zen',usage:''},
  {name:'essential',usage:''},
  {name:'full',usage:''},
  {name:'sidebar',usage:''},
  {name:'home',usage:''},
  {name:'new',usage:''},
  {name:'shelf',usage:''},
  {name:'panel',usage:t('screen.slash.panelUsage')},
  {name:'diff',usage:''},
  {name:'status',usage:''},
  /* ASYNC step 3 (owner 01/10): the delegated agents, live; stop or watch one (Codex /subagents, Claude Code agent panel). */
  {name:'agents',usage:'[stop|show] [n|id|all]'},
  {name:'context',usage:''},
  /* stage 7.12 (mockup): the whole conversation, with less-style search; Ctrl+O */
  {name:'transcript',usage:''},
  /* R5a (Q-R5-2, Q-R5-8, Q-R5-19): tokens, window, cost and compactions; a view, it runs at once during a turn. */
  {name:'usage',usage:''},
  {name:'compact',usage:''},
  {name:'clear',usage:''},
  {name:'redraw',usage:''},
  {name:'resume',usage:'[session-id]'},
  {name:'fork',usage:'[session-id]'},
  /* R5b D1 (Q-R5-12): this conversation to a file. */
  {name:'export',usage:'[md|json|jsonl] [file]'},
  {name:'rename',usage:'<name>'},
  /* R5b D4 (Q-R5-14): the ten product themes and mono, previewed live. */
  {name:'theme',usage:'[name]'},
  {name:'config',usage:''},
  /* Form B, No (a): the question about this folder, again */
  {name:'trust',usage:''},
  /* R5b D3 (Q-R5-13): this conversation's checkpoints, with their files; /rewind and /checkpoint are the same command. */
  {name:'undo',usage:''},
  /* R5b (Q-R5-19): send the last message again; copy an answer (Hermes /retry, Claude Code and Hermes /copy). */
  {name:'retry',usage:''},
  {name:'copy',usage:'[n]'},
  /* R5b (owner 2026-09-25): the messages you sent in this project, to put one back in the composer. */
  {name:'history',usage:''},
  {name:'mcp',usage:'[list|test|trust|untrust] [server-id]'},
  {name:'hooks',usage:'[list|dry-run|history|trust|untrust|quarantine|release] [hook-id] [args...]'},
  {name:'plugins',usage:'[list|install|remove|trust|untrust|quarantine|release] [plugin-id] [args...]'},
  {name:'doctor',usage:'[args...]'},
  {name:'memory',usage:'[args...]'},
  {name:'notes',usage:'[args...]'},
  {name:'tasks',usage:'[args...]'},
  {name:'library',usage:'[args...]'},
  {name:'research',usage:'[args...]'},
  /* C11b: the workspaces and their sessions, the CLI mockup's Projects section (bozzetto-cli-retro/index.html:562, :1152-1159) */
  {name:'projects',usage:''},
  {name:'automations',usage:'[args...]'},
  {name:'forge',usage:'[args...]'},
  /* 0.6.15 T4: pair a device with this computer, in a card over the conversation (Claude Code /remote-control, alias /rc) */
  {name:'remote',usage:''},
  {name:'devices',usage:''},
  {name:'processes',usage:''},
  {name:'exit',usage:''},
] as const;
export type SlashCommandName=typeof SLASH_COMMAND_META[number]['name'];

export type SlashCommand={name:SlashCommandName;description:string;usage:string;interactiveOnly?:boolean};

/* R2 (Q-R2-1, gate E1): the descriptions are dictionary words; a later locale overlays the dictionary, not this file. */
export function slashCommandDescription(name:SlashCommandName):string{return t(`screen.slash.${name}`);}

export const SLASH_COMMANDS:SlashCommand[]=SLASH_COMMAND_META.map(row=>({
  name:row.name,
  usage:row.usage,
  description:slashCommandDescription(row.name),
}));

/* R5b D7 (Q-R5-17): /help in groups — session, model and turn, view, work surfaces, extensions — each command once. */
export type SlashCommandGroup='session'|'turn'|'view'|'work'|'extensions';
export const SLASH_GROUPS:ReadonlyArray<SlashCommandGroup>=['session','turn','view','work','extensions'];
const GROUP_OF:Readonly<Record<SlashCommandName,SlashCommandGroup>>={
  resume:'session',fork:'session',rename:'session',export:'session',undo:'session',history:'session',clear:'session',compact:'session',exit:'session',
  provider:'turn',setup:'turn',model:'turn',effort:'turn',busy:'turn',queue:'turn',agents:'turn',retry:'turn',plan:'turn',permissions:'turn',trust:'turn',
  capability:'extensions',models:'view',board:'view',zen:'view',essential:'view',full:'view',sidebar:'view',home:'view',new:'view',shelf:'view',panel:'view',help:'view',status:'view',context:'view',transcript:'view',usage:'view',diff:'view',copy:'view',theme:'view',config:'view',redraw:'view',
  memory:'work',notes:'work',tasks:'work',library:'work',research:'work',projects:'work',automations:'work',forge:'work',
  mcp:'extensions',hooks:'extensions',plugins:'extensions',doctor:'extensions',remote:'extensions',devices:'extensions',processes:'work',
};
export function slashCommandGroup(name:SlashCommandName):SlashCommandGroup{return GROUP_OF[name];}
/* stage 7.17: the commands new in this version carry the mockup's «new» pill in /help */
const NEW_COMMANDS:ReadonlySet<SlashCommandName>=new Set(['transcript','remote'] as SlashCommandName[]);
/* stage 7.17: the approved mockup's order of the commands (its COMMANDS, /tui and /whatsnew not in this version yet) */
const HELP_ORDER:readonly SlashCommandName[]=['resume','fork','rename','export','undo','history','clear','compact','exit','provider','setup','model','effort','busy','queue','agents','retry','plan','permissions',
  'help','status','context','usage','diff','copy','theme','config','trust','redraw','transcript','memory','notes','tasks','library','research','projects','automations','forge','mcp','hooks','plugins','doctor','remote'];
const helpRank=(name:SlashCommandName)=>{const at=HELP_ORDER.indexOf(name);return at<0?HELP_ORDER.length:at;};
/** Stage 8 C3 (mockup palette): the mockup's presentation rank, for views that draw the catalogue themselves. */
export function slashCommandHelpRank(name:SlashCommandName):number{return helpRank(name);}
/** Stage 7.17 (mockup help): every command in the mockup's order, with its group's name, arguments and words. */
export function helpCommands():Array<{name:string;group:string;usage:string;desc:string;fresh:boolean}>{
  return SLASH_GROUPS.flatMap(group=>SLASH_COMMANDS.filter(command=>GROUP_OF[command.name]===group).sort((a,b)=>helpRank(a.name)-helpRank(b.name)).map(command=>({
    name:command.name,group:t(`screen.help.group.${group}`),usage:command.usage,desc:slashCommandDescription(command.name),fresh:NEW_COMMANDS.has(command.name)})));
}
export function slashCommandHelp():string{
  return SLASH_GROUPS.map(group=>t(`screen.help.group.${group}`)+'\n'+SLASH_COMMANDS.filter(command=>GROUP_OF[command.name]===group).map(command=>{
    const usage=command.usage?' '+command.usage:'';
    return '  /'+command.name+usage+' — '+slashCommandDescription(command.name);
  }).join('\n')).join('\n\n');
}

function distance(a:string,b:string){const d=Array.from({length:a.length+1},()=>Array<number>(b.length+1).fill(0));for(let i=0;i<=a.length;i++)d[i]![0]=i;for(let j=0;j<=b.length;j++)d[0]![j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i]![j]=Math.min(d[i-1]![j]!+1,d[i]![j-1]!+1,d[i-1]![j-1]!+(a[i-1]===b[j-1]?0:1));return d[a.length]![b.length]!;}
/* R5b D3 (Q-R5-13): other names for a command (Claude Code's /rewind aliases); the parsed name is the command's own. */
const SLASH_ALIASES:Readonly<Record<string,SlashCommandName>>=Object.freeze({rewind:'undo',checkpoint:'undo',subagents:'agents',rc:'remote',/* the page is called Settings (tester R8) */settings:'config'});
export function parseSlashCommand(text:string){const parts=text.trim().replace(/^\//u,'').split(/\s+/u).filter(Boolean);const typed=parts.shift()??'';const name=SLASH_ALIASES[typed]??typed;const known=SLASH_COMMANDS.some(x=>x.name===name);const suggestions=known?[]:SLASH_COMMANDS.map(x=>({n:x.name,d:distance(name,x.name)})).filter(x=>x.d<=Math.max(2,Math.floor(name.length/3))).sort((a,b)=>a.d-b.d||a.n.localeCompare(b.n)).slice(0,3).map(x=>x.n);return{name,args:parts,suggestions};}

export function completeSlashCommand(text:string):string[]{if(!text.startsWith('/'))return[];const raw=text.slice(1);if(/\s/u.test(raw))return[];return SLASH_COMMANDS.map(x=>'/'+x.name).filter(x=>x.startsWith('/'+raw)).sort((a,b)=>a.localeCompare(b));}
