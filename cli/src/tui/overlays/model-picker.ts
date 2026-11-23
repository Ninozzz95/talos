import {t,tn} from '../../i18n/index.ts';
import {normalizeModels,type TuiCatalogService,type TuiModel} from '../catalog-service.ts';
import {pickerSection,type OverlayContent} from './scroll-window.ts';

/*
 * B1 slice 18 — the model list belongs to ONE provider: the chosen one. It is fetched live, and when the
 * provider cannot be reached the list TALOS already knows is shown with `verified()` false and a notice
 * that says so. There is no global list any more: a picker without a provider has nothing to show.
 */
export type ModelPickerModel={open():Promise<void>;cancel():void;rows():readonly TuiModel[];error():unknown|null;verified():boolean;notice():string;label():string;engineDown():boolean};

/**
 * R4 (gate E10): `current` is the model in use; when it belongs to this provider and the list does not have it, it is still
 * listed (not verified) and the notice says so, so the picker never hides what TALOS is set to use.
 */
export function createModelPickerModel(catalog:TuiCatalogService,input:{provider?:string|undefined;current?:string|null|undefined}):ModelPickerModel{
  let models:TuiModel[]=[];let cancelled=false;let loadError:unknown|null=null;let verified=false;let notice='';let label=input.provider??'';let engine:string|null=null;
  let abort:AbortController|null=null;
  return{
    async open(){
      cancelled=false;loadError=null;models=[];verified=false;engine=null;
      if(!input.provider){notice=t('screen.model.chooseProviderFirst');return;}
      abort?.abort();abort=new AbortController();
      try{
        const list=await catalog.providerModels(input.provider,abort.signal);
        if(cancelled)return;
        models=list.rows;verified=list.verified;notice=list.notice;label=list.label;engine=list.engine??null;
        const current=input.current;
        if(current&&current.startsWith(`${input.provider}:`)&&!models.some(row=>row.id===current)){
          models=[...models,...normalizeModels([{id:current}],input.provider,'configured')];verified=false;
          notice=[notice,t('firstrun.models.chosenMissing',{model:current,label})].filter(Boolean).join(' ');
        }
      }catch(error){if(!cancelled){loadError=error;notice=t('screen.model.listFailed');}}
    },
    cancel(){cancelled=true;abort?.abort();abort=null;},
    rows:()=>models,
    error:()=>loadError,
    verified:()=>verified,
    notice:()=>notice,
    /* P17: a local engine that did not answer (the setup offers R to retry). */
    engineDown:()=>engine==='down',
    label:()=>label,
  };
}

export async function commitModelSelection({id,catalog,setControllerModel}:{id:string;catalog:TuiCatalogService;setControllerModel:(id:string)=>void}){
  await catalog.selectModel(id,'project-user');
  setControllerModel(id);
}

// R1 Q-R1-3: the model list and the effort step as app.ts draws them, capped and scrolled by overlays/scroll-window.ts.
export function modelPickerOverlay({label,provider,loading,verified,notice,query,rows,selected}:{label:string;provider?:string|undefined;loading:boolean;verified:boolean;notice:string;query:string;rows:readonly TuiModel[];selected:number}):OverlayContent{
  return{
    head:[
      {text:t('screen.model.title',{label:label||provider||'',state:t(loading?'screen.model.stateLoading':verified?'screen.model.stateLive':'screen.model.stateUnverified')}),tone:'title'},
      ...(notice?[{text:notice,tone:loading||verified?'dim' as const:'plain' as const}]:[]),
      {text:tn('screen.model.count',rows.length,{query:query||t('screen.none')}),tone:'dim'},
    ],
    sections:[pickerSection(rows,selected,row=>{const remote=row.id.slice(row.provider.length+1);const efforts=row.reasoningEfforts?.length?` · ${t('screen.model.rowEffort',{efforts:row.reasoningEfforts.join('/')})}`:'';return `${row.name}${row.name!==remote?` · ${remote}`:''}${row.contextWindow?` · ${row.contextWindow}`:''}${row.reasoning?` · ${t('screen.model.rowReasoning')}`:''}${efforts}${row.images?` · ${t('screen.model.rowImage')}`:''}${verified||loading?'':` ${t('screen.model.rowUnverified')}`}`;})],
  };
}
