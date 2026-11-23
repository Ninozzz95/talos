/*
 * Stage 7.11 (mockup PANELS.settings, «Settings this project»; owner 03/10: context by part from the kernel, a local usage
 * record, the update rows with stage 9, Language English for now with the existing settings after the mockup's): one sheet
 * with four tabs — Status · Usage · Context · Config — that /status, /usage, /context and /config open on their own tab
 * (Claude Code's /status tabs and its /context grid; Codex /status). Status and Usage are rows the app measures (a label and
 * its value's segments); Context draws the mockup's grid from the parts of the window when the kernel gives them, else the
 * used and free share it does know; Config is a form whose Enter saves for this project. c on Status copies it for a bug
 * report.
 */
import {t} from '../../i18n/index.ts';
import {S,pad,type FormField,type Panel,type PanelBody,type Seg,type SegRow,type PanelStep} from './sheet.ts';
import type {SheetAction,SheetState} from './commands.ts';

/* a row: its label and its value's segments (or, for a bar, the segments at the sheet's width); null is a blank row */
export type SettingsLine={label:string;value:readonly Seg[]|((width:number)=>readonly Seg[])}|null;
/* `role`: the mockup's colour of that part (system dim, tools acc, MCP warn, memory ok, messages err) */
export type ContextPart={label:string;tokens:number;role:string};
export type SettingsContext={window:number;used:number;compactAt:number;parts:readonly ContextPart[]|null;estimated?:boolean;hint?:string|null};
/* `contextNote`: what the Context tab says when nothing was measured (no conversation yet, a runtime without the measure) */
/* `configError`: the configuration could not be read — said, never replaced by the defaults; r reads it again */
export type SettingsState={status:readonly SettingsLine[]|null;usage:readonly SettingsLine[]|null;context:SettingsContext|null;contextNote?:string|null;config:readonly FormField[]|null;configError?:string|null};
export const SETTINGS_TABS=['status','usage','context','config'] as const;
export type SettingsTab=typeof SETTINGS_TABS[number];

const LABEL=14;
const valueOf=(line:Exclude<SettingsLine,null>,width:number)=>typeof line.value==='function'?line.value(width):line.value;
const lineRows=(lines:readonly SettingsLine[])=>(width:number):SegRow[]=>[[S('')],...lines.map(line=>line?[S(`  ${pad(line.label,LABEL)}`,'faint'),...valueOf(line,width)] as SegRow:[S('')])];
const waiting=():PanelBody=>({kind:'info',lines:()=>[[S('')],[S(`  ${t('panel.settings.reading')}`,'dim')]]});

/** «3.1k», «202.8k»: tokens as the mockup's context legend writes them. */
export function tokensText(tokens:number):string{const n=Math.max(0,Math.round(tokens));return n<1000?String(n):`${(n/1000).toFixed(1)}k`;}
/** A bar of `width` cells, `percent` of them filled (the mockup's usage bar). */
/** The mockup's usage bar is 50 cells, fewer on a narrow sheet: what the row leaves after its label and its «23% of 262k». */
export const barWidth=(width:number)=>Math.max(10,Math.min(50,width-36));
export function barSegs(percent:number,width=50):Seg[]{const on=Math.max(0,Math.min(width,Math.round(percent/100*width)));return[S('█'.repeat(on),'acc'),S('░'.repeat(width-on),'faint')];}

/* the mockup's context grid: 100 cells of 20 by 5, each part its share of the window in its colour, the rest free; beside it the
   legend — a part, its tokens and its share */
function contextRows(context:SettingsContext):SegRow[]{
  const window=Math.max(1,context.window);const share=(tokens:number)=>Math.round(tokens/window*100);
  const parts=context.parts??[{label:t('panel.settings.used'),tokens:context.used,role:'acc'}];
  const cells:string[]=[];for(const part of parts){const n=part.tokens>0?Math.max(1,share(part.tokens)):0;for(let i=0;i<n&&cells.length<100;i++)cells.push(part.role);}
  while(cells.length<100)cells.push('');
  const free=Math.max(0,window-parts.reduce((sum,part)=>sum+part.tokens,0));
  const legend=[...parts.map(part=>({...part})),{label:t('panel.settings.free'),tokens:free,role:'faint'}];
  const rows:SegRow[]=[[S('')]];
  for(let r=0;r<Math.max(5,legend.length);r++){
    const row:SegRow=[S('  ')];
    if(r<5){
      /* runs of one colour, as the mockup's style rows join them */
      let at=r*20;while(at<r*20+20){const role=cells[at]!;let end=at;while(end<r*20+20&&cells[end]===role)end++;row.push(S((role?'■ ':'· ').repeat(end-at),role||'faint'));at=end;}
    }else row.push(S(' '.repeat(40)));
    const entry=legend[r];
    if(entry)row.push(S('   ■ ',entry.role),S(pad(entry.label,15)),S(pad(tokensText(entry.tokens),7),'dim'),S(`${share(entry.tokens)}%`,'faint'));
    rows.push(row);
  }
  const percent=share(context.used);
  rows.push([S('')],[S(`  ${t('panel.settings.window',{window:`${Math.round(window/1000)}k`,used:tokensText(context.used),percent,at:context.compactAt})}${context.estimated?t('panel.settings.estimated'):''}`,'dim')]);
  if(context.hint)rows.push([S(`  ${context.hint}`,'faint')]);
  return rows;
}

function bodies(state:SettingsState,prev:Panel|undefined):PanelBody[]{
  const config=prev?.tabs[3]?.body;
  return[
    state.status?{kind:'info',lines:lineRows(state.status),keys:[{key:'c',label:t('panel.settings.copy')}]}:waiting(),
    state.usage?{kind:'info',lines:lineRows(state.usage)}:waiting(),
    state.context?{kind:'info',lines:()=>contextRows(state.context!)}:state.contextNote?{kind:'info',lines:()=>[[S('')],[S(`  ${state.contextNote}`,'dim')]]}:waiting(),
    /* what the person changed stays until it is saved; a redraw (a status that came in later) keeps it */
    state.config?(config?.kind==='form'&&config.fields.length===state.config.length?config:{kind:'form',fields:state.config,sel:0,submit:t('panel.settings.save')})
      :state.configError?{kind:'info',lines:()=>[[S('')],[S(`  ${state.configError}`,'warn')]],keys:[{key:'r',label:t('panel.settings.readAgain')}]}:waiting(),
  ];
}

/** The Settings sheet on `tab`; `prev` keeps what was changed in Config while the other tabs fill in. */
export function settingsSheet(state:SettingsState,{tab='status',prev}:{tab?:SettingsTab|number;prev?:Panel}={}):SheetState{
  const names=[t('panel.settings.tab.status'),t('panel.settings.tab.usage'),t('panel.settings.tab.context'),t('panel.settings.tab.config')];
  const at=typeof tab==='number'?tab:SETTINGS_TABS.indexOf(tab);
  return{name:'settings',context:{settings:state},panel:{title:t('panel.settings.title'),sub:t('panel.settings.sub'),tab:Math.max(0,at),tabs:bodies(state,prev).map((body,i)=>({name:names[i]!,body}))}};
}

/** c copies the status; Enter on Config saves the fields as they are now (the app keeps what changed). */
export function settingsStep(sheet:SheetState,step:PanelStep):{sheet:SheetState|null;action:SheetAction|null}{
  const next={...sheet,panel:step.panel};const effect=step.effect;
  /* c is a key of the Status tab only (its keys) */
  if(effect.kind==='key'&&effect.key==='c'){
    const lines=sheet.context?.settings?.status??[];
    const text=lines.map(line=>line?`${pad(line.label,LABEL)}${valueOf(line,86).map(segment=>segment.text).join('')}`.trimEnd():'').join('\n').trim();
    return{sheet:next,action:{kind:'copy',text,notice:t('panel.settings.copied')}};
  }
  if(step.panel.tab===3&&effect.kind==='key'&&effect.key==='r')return{sheet:next,action:{kind:'settingsReload'}};
  if(step.panel.tab===3&&effect.kind==='submit'){
    const body=step.panel.tabs[3]!.body;if(body.kind!=='form')return{sheet:next,action:null};
    return{sheet:next,action:{kind:'settingsSave',values:Object.fromEntries(body.fields.map(field=>[field.label,field.value]))}};
  }
  return{sheet:next,action:null};
}
