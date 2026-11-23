import type {CliPaths} from '../paths.ts';
import {UI_QUESTION_TIMEOUTS,type UiExitOutput,type UiNotifications,type UiQuestionTimeout} from '../config/types.ts';
import {loadEffectiveConfig} from '../config/load.ts';
import {configSet} from '../config/commands.ts';
import {t} from '../i18n/index.ts';

export type ConfigPanelValues={maxProseWidth:number|null;notifications:UiNotifications;mouse:boolean;exitOutput:UiExitOutput;questionTimeout:UiQuestionTimeout};
export const CONFIG_PANEL_KEYS=['maxProseWidth','notifications','mouse','exitOutput','questionTimeout'] as const;
/* The choices that apply to this conversation at once; the others say «next launch». */
export const CONFIG_PANEL_LIVE_KEYS:readonly ConfigPanelKey[]=Object.freeze(['maxProseWidth','questionTimeout']);
export type ConfigPanelKey=typeof CONFIG_PANEL_KEYS[number];
export type ConfigPanelSnapshot={selected:number;values:ConfigPanelValues|null;busy:boolean;notice:string|null};
type Location={paths:CliPaths;projectRoot:string};
export async function loadConfigPanelValues(location:Location):Promise<ConfigPanelValues>{
  const ui=(await loadEffectiveConfig(location)).value.ui;
  return{maxProseWidth:ui?.maxProseWidth??null,notifications:ui?.notifications??'auto',/* stage 6c (owner 02/10): the mouse is on unless switched off */mouse:ui?.mouse!==false,exitOutput:ui?.exitOutput??'transcript',questionTimeout:ui?.questionTimeout??'5m'};
}
const choices:Record<ConfigPanelKey,readonly unknown[]>={maxProseWidth:[null,60,80,100,120],notifications:['auto','bell','off'],mouse:[true,false],exitOutput:['transcript','resume'],questionTimeout:UI_QUESTION_TIMEOUTS};

/** Serial writes through the existing atomic config boundary; only this person's project override is changed. */
export function createConfigPanelStore({paths,projectRoot,onProseWidth=()=>{},onQuestionTimeout=()=>{},io={}}:Location&{
  onProseWidth?:(value:number|null)=>void;
  /* stage 3: the next question card uses the new length (no restart) */
  onQuestionTimeout?:(value:UiQuestionTimeout)=>void;
  io?:{load?:()=>Promise<ConfigPanelValues>;save?:(key:ConfigPanelKey,value:unknown)=>Promise<void>};
}){
  let snapshot:ConfigPanelSnapshot|null=null,generation=0,writePending:Promise<void>|null=null;
  const listeners=new Set<()=>void>();
  const publish=(next:ConfigPanelSnapshot|null)=>{snapshot=next;for(const listener of listeners)listener();};
  const load=io.load??(()=>loadConfigPanelValues({paths,projectRoot}));
  const save=io.save??((key,value)=>configSet({paths,projectRoot,scope:'project-user',path:`ui.${key}`,value}));
  return{
    getSnapshot:()=>snapshot,
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    async open(){
      const current=++generation;publish({selected:0,values:null,busy:true,notice:null});
      if(writePending)await writePending;
      if(current!==generation)return;
      try{const values=await load();if(current===generation)publish({selected:0,values,busy:false,notice:null});}
      catch{if(current===generation)publish({selected:0,values:null,busy:false,notice:t('screen.config.loadFailed')});}
    },
    close(){generation++;publish(null);},
    move(delta:number){if(snapshot&&!snapshot.busy)publish({...snapshot,selected:Math.max(0,Math.min(CONFIG_PANEL_KEYS.length-1,snapshot.selected+delta))});},
    async change(delta:1|-1){
      const before=snapshot;if(!before?.values||before.busy||writePending)return;
      const key=CONFIG_PANEL_KEYS[before.selected]!;const available=choices[key];
      const index=available.indexOf(before.values[key]);
      const value=available[(index+delta+available.length)%available.length];
      const current=generation;publish({...before,busy:true,notice:null});
      writePending=(async()=>{
        try{
          await save(key,value);
          const values={...before.values,[key]:value} as ConfigPanelValues;
          if(key==='maxProseWidth')onProseWidth(values.maxProseWidth);
          if(key==='questionTimeout')onQuestionTimeout(values.questionTimeout);
          if(current===generation)publish({...before,values,busy:false,notice:t(CONFIG_PANEL_LIVE_KEYS.includes(key)?'screen.config.savedLive':'screen.config.savedRestart')});
        }catch{if(current===generation)publish({...before,busy:false,notice:t('screen.config.saveFailed')});}
      })();
      try{await writePending;}finally{writePending=null;}
    },
  };
}
