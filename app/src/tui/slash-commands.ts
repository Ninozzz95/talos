export type HelpLocale='en';

const SLASH_COMMAND_META=[
  {name:'help',usage:''},
  {name:'provider',usage:''},
  {name:'model',usage:'[provider:model]'},
  {name:'queue',usage:'[show|clear|run]'},
  {name:'permissions',usage:'[dry-run <shell command>]'},
  {name:'plan',usage:''},
  {name:'diff',usage:''},
  {name:'status',usage:''},
  {name:'context',usage:''},
  {name:'compact',usage:''},
  {name:'clear',usage:''},
  {name:'redraw',usage:''},
  {name:'resume',usage:'[session-id]'},
  {name:'fork',usage:'[session-id]'},
  {name:'mcp',usage:'[list|test|trust|untrust] [server-id]'},
  {name:'hooks',usage:'[list|dry-run|history|trust|untrust|quarantine|release] [hook-id] [args...]'},
  {name:'plugins',usage:'[list|install|remove|trust|untrust|quarantine|release] [plugin-id] [args...]'},
  {name:'doctor',usage:'[args...]'},
  {name:'memory',usage:'[args...]'},
  {name:'notes',usage:'[args...]'},
  {name:'tasks',usage:'[args...]'},
  {name:'library',usage:'[args...]'},
  {name:'research',usage:'[args...]'},
  {name:'automations',usage:'[args...]'},
  {name:'forge',usage:'[args...]'},
  {name:'exit',usage:''},
] as const;
export type SlashCommandName=typeof SLASH_COMMAND_META[number]['name'];

export const SLASH_COMMAND_COPY:Readonly<Record<HelpLocale,Readonly<Record<SlashCommandName,string>>>>=Object.freeze({
  en:Object.freeze({
    help:'Show commands',
    provider:'Choose the AI provider',
    model:'Choose a model from the chosen provider',
    queue:'Show or manage queued follow-ups',
    permissions:'Show permission mode',
    plan:'Toggle plan-oriented guidance',
    diff:'Show current Git diff',
    status:'Show session status',
    context:'Show context/session information',
    compact:'Compact context',
    clear:'Clear terminal transcript',
    redraw:'Redraw terminal',
    resume:'Resume a session',
    fork:'Fork a session',
    mcp:'Manage MCP servers',
    hooks:'Manage hooks',
    plugins:'Manage plugins',
    doctor:'Run diagnostics',
    memory:'Memory operations',
    notes:'Notes operations',
    tasks:'Tasks operations',
    library:'Library operations',
    research:'Deep Research operations',
    automations:'Automation operations',
    forge:'Tool Forge operations',
    exit:'Exit TALOS',
  }),
});

export type SlashCommand={name:SlashCommandName;description:string;usage:string;interactiveOnly?:boolean};

export function slashCommandDescription(name:SlashCommandName,locale:HelpLocale='en'):string{
  const copy=SLASH_COMMAND_COPY[locale]??SLASH_COMMAND_COPY.en;
  return copy[name];
}

export const SLASH_COMMANDS:SlashCommand[]=SLASH_COMMAND_META.map(row=>({
  name:row.name,
  usage:row.usage,
  description:slashCommandDescription(row.name),
}));

export function slashCommandHelp(locale:HelpLocale='en'):string{
  return SLASH_COMMANDS.map(command=>{
    const usage=command.usage?' '+command.usage:'';
    return '/'+command.name+usage+' — '+slashCommandDescription(command.name,locale);
  }).join('\n');
}

function distance(a:string,b:string){const d=Array.from({length:a.length+1},()=>Array<number>(b.length+1).fill(0));for(let i=0;i<=a.length;i++)d[i]![0]=i;for(let j=0;j<=b.length;j++)d[0]![j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i]![j]=Math.min(d[i-1]![j]!+1,d[i]![j-1]!+1,d[i-1]![j-1]!+(a[i-1]===b[j-1]?0:1));return d[a.length]![b.length]!;}
export function parseSlashCommand(text:string){const parts=text.trim().replace(/^\//u,'').split(/\s+/u).filter(Boolean);const name=parts.shift()??'';const known=SLASH_COMMANDS.some(x=>x.name===name);const suggestions=known?[]:SLASH_COMMANDS.map(x=>({n:x.name,d:distance(name,x.name)})).filter(x=>x.d<=Math.max(2,Math.floor(name.length/3))).sort((a,b)=>a.d-b.d||a.n.localeCompare(b.n)).slice(0,3).map(x=>x.n);return{name,args:parts,suggestions};}

export function completeSlashCommand(text:string):string[]{if(!text.startsWith('/'))return[];const raw=text.slice(1);if(/\s/u.test(raw))return[];return SLASH_COMMANDS.map(x=>'/'+x.name).filter(x=>x.startsWith('/'+raw)).sort((a,b)=>a.localeCompare(b));}
