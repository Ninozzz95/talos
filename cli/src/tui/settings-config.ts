/*
 * Stage 7.11 (mockup PANELS.settings «Config»; owner 03/10 «Language solo English per ora, le tre in coda»): the Config tab's
 * fields and the `ui.*` keys behind them. The mockup's rows first — Mouse, Thinking, Tool rows, Reduce motion, Notify when done,
 * Editor — then the settings /config had (response width, on exit, questions close after, start view). Enter
 * saves for this project only what changed (`project-user`, as /config did); what applies only at the next launch says so.
 */
import {t} from '../i18n/index.ts';
import {UI_QUESTION_TIMEOUTS} from '../config/types.ts';
import type {FormField} from './panel/sheet.ts';

type Choice=readonly [label:string,value:unknown];
type SettingDef={key:'mouse'|'view'|'startView'|'reasoning'|'toolRows'|'reduceMotion'|'notifications'|'editor'|'language'|'maxProseWidth'|'exitOutput'|'questionTimeout';
  label:string;type:'bool'|'choice'|'text';choices?:readonly Choice[];off?:readonly string[];help?:string;
  /* applies at once (else at the next launch); `none`: shown, nothing to save */live:boolean;none?:boolean;fallback:unknown};

/* C10 (owner 01/11, «solo campi che agiscono»; Frontend told first): View (only full screen) and Language (only English) left the form,
   since neither saved anything; each comes back with its action when the classic view or another language exists */
export function settingDefs():SettingDef[]{
  return[
    {key:'mouse',label:t('panel.settings.field.mouse'),type:'bool',help:t('panel.settings.help.mouse'),live:false,fallback:true},
    {key:'reasoning',label:t('panel.settings.field.thinking'),type:'choice',choices:[[t('panel.settings.thinking.collapsed'),'collapsed'],[t('panel.settings.thinking.expanded'),'visible'],[t('panel.settings.thinking.hidden'),'hidden']],live:true,fallback:'collapsed'},
    {key:'toolRows',label:t('panel.settings.field.toolRows'),type:'choice',choices:[[t('panel.settings.toolRows.grouped'),'grouped'],[t('panel.settings.toolRows.each'),'each']],live:true,fallback:'grouped'},
    {key:'reduceMotion',label:t('panel.settings.field.reduceMotion'),type:'bool',live:false,fallback:false},
    {key:'notifications',label:t('panel.settings.field.notify'),type:'choice',choices:[[t('panel.settings.notify.off'),'off'],[t('panel.settings.notify.bell'),'bell'],[t('panel.settings.notify.desktop'),'auto']],help:t('panel.settings.help.notify'),live:false,fallback:'auto'},
    {key:'editor',label:t('panel.settings.field.editor'),type:'text',help:t('panel.settings.help.editor'),live:true,fallback:''},
    {key:'maxProseWidth',label:t('panel.settings.field.width'),type:'choice',choices:[[t('screen.config.fullWidth'),null],...[60,80,100,120].map(n=>[t('screen.config.columns',{count:n}),n] as const)],live:true,fallback:null},
    {key:'exitOutput',label:t('panel.settings.field.exit'),type:'choice',choices:[[t('screen.config.exit.transcript'),'transcript'],[t('screen.config.exit.resume'),'resume']],live:false,fallback:'transcript'},
    {key:'questionTimeout',label:t('panel.settings.field.questions'),type:'choice',choices:UI_QUESTION_TIMEOUTS.map(value=>[t(`screen.config.questionTimeout.${value}`),value] as const),live:true,fallback:'5m'},
    {key:'startView',label:t('panel.settings.field.startView'),type:'choice',choices:[[t('panel.settings.startView.essential'),'essential'],[t('panel.settings.startView.zen'),'zen'],[t('panel.settings.startView.full'),'full']],live:false,fallback:'essential'},
  ];
}

/** The fields as the form shows them, from the effective `ui` configuration. */
/** `env`: where an empty Editor falls back to ($VISUAL, then $EDITOR), said in the field (Frontend 01/11). */
export function settingFields(ui:Record<string,unknown>|undefined,env:{VISUAL?:string;EDITOR?:string}={}):FormField[]{
  const fallback=env.VISUAL?.trim()?t('panel.settings.editorFrom',{name:'$VISUAL',command:env.VISUAL.trim()}):env.EDITOR?.trim()?t('panel.settings.editorFrom',{name:'$EDITOR',command:env.EDITOR.trim()}):t('panel.settings.editorNone');
  return settingDefs().map(def=>{
    const value=def.none?def.fallback:ui?.[def.key]??def.fallback;
    if(def.type==='bool')return{label:def.label,type:'bool',value:value===true,...(def.help?{help:def.help}:{})};
    if(def.type==='text')return{label:def.label,type:'text',value:String(value??''),...(def.key==='editor'?{placeholder:fallback}:{}),...(def.help?{help:def.help}:{})};
    const choices=def.choices!;const at=Math.max(0,choices.findIndex(([,v])=>v===value));
    return{label:def.label,type:'choice',value:choices[at]![0],options:choices.map(([label])=>label),...(def.off?{off:def.off}:{}),...(def.help?{help:def.help}:{})};
  });
}

export type SettingChange={key:SettingDef['key'];value:unknown;/* unset: back to the default (an empty editor) */unset:boolean;live:boolean};
/** What the form says now against what the configuration says: only the fields that changed, in config values. */
export function settingChanges(values:Record<string,string|boolean>,ui:Record<string,unknown>|undefined):SettingChange[]{
  const out:SettingChange[]=[];
  for(const def of settingDefs()){
    if(def.none||!(def.label in values))continue;
    const shown=values[def.label];const before=ui?.[def.key]??def.fallback;
    let value:unknown;
    if(def.type==='bool')value=shown===true;
    else if(def.type==='text')value=String(shown??'').trim();
    else value=def.choices!.find(([label])=>label===shown)?.[1]??before;
    if(value===before||(def.type==='text'&&value===String(before??'')))continue;
    out.push({key:def.key,value,unset:def.type==='text'&&value==='',live:def.live});
  }
  return out;
}
