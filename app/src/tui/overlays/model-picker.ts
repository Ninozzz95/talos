import type {TuiCatalogService,TuiModel} from '../catalog-service.ts';

/*
 * B1 slice 18 — the model list belongs to ONE provider: the chosen one. It is fetched live, and when the
 * provider cannot be reached the list TALOS already knows is shown with `verified()` false and a notice
 * that says so. There is no global list any more: a picker without a provider has nothing to show.
 */
export type ModelPickerModel={open():Promise<void>;cancel():void;rows():readonly TuiModel[];error():unknown|null;verified():boolean;notice():string;label():string};

export function createModelPickerModel(catalog:TuiCatalogService,input:{provider?:string|undefined}):ModelPickerModel{
  let models:TuiModel[]=[];let cancelled=false;let loadError:unknown|null=null;let verified=false;let notice='';let label=input.provider??'';
  let abort:AbortController|null=null;
  return{
    async open(){
      cancelled=false;loadError=null;models=[];verified=false;
      if(!input.provider){notice='Choose a provider first with /provider.';return;}
      abort?.abort();abort=new AbortController();
      try{
        const list=await catalog.providerModels(input.provider,abort.signal);
        if(cancelled)return;
        models=list.rows;verified=list.verified;notice=list.notice;label=list.label;
      }catch(error){if(!cancelled){loadError=error;notice='The model list could not be loaded.';}}
    },
    cancel(){cancelled=true;abort?.abort();abort=null;},
    rows:()=>models,
    error:()=>loadError,
    verified:()=>verified,
    notice:()=>notice,
    label:()=>label,
  };
}

export async function commitModelSelection({id,catalog,setControllerModel}:{id:string;catalog:TuiCatalogService;setControllerModel:(id:string)=>void}){
  await catalog.selectModel(id,'project-user');
  setControllerModel(id);
}
