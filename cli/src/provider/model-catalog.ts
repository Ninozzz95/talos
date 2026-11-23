import {REASONING_EFFORTS,type ReasoningEffort} from '../config/types.ts';

export type ModelEvidenceSource='live'|'configured'|'documented'|'unknown';

export type ModelCapabilityEvidence<T>={
  value:T|null;
  source:ModelEvidenceSource;
  evidenceUrl:string|null;
  evidenceDate:string|null;
};

export type ModelCapabilityEvidenceSet={
  contextWindow:ModelCapabilityEvidence<number>;
  toolCalling:ModelCapabilityEvidence<boolean>;
  reasoning:ModelCapabilityEvidence<boolean>;
  reasoningEfforts:ModelCapabilityEvidence<ReasoningEffort[]>;
  images:ModelCapabilityEvidence<boolean>;
};

export type ModelCatalogRow={
  id:string;
  provider:string;
  name:string;
  /** Canonical availability source. */
  source:ModelEvidenceSource;
  /** Compatibility alias retained for current TUI/runtime consumers. */
  available:ModelEvidenceSource;
  /** True only when current provider/runtime enumeration observed this model. */
  availabilityVerified:boolean;
  contextWindow:number|null;
  toolCalling:boolean|null;
  reasoning:boolean|null;
  reasoningEfforts:ReasoningEffort[]|null;
  images:boolean|null;
  capabilityEvidence:ModelCapabilityEvidenceSet;
};

type SourceOptions={successfulCatalogBoundary?:boolean};

const SOURCE_RANK:Readonly<Record<ModelEvidenceSource,number>>=Object.freeze({
  unknown:0,documented:1,configured:2,live:3,
});
const CAPABILITY_RANK:Readonly<Record<ModelEvidenceSource,number>>=Object.freeze({
  unknown:0,configured:1,documented:2,live:3,
});

export function catalogSourceFromKernel(source:unknown,{successfulCatalogBoundary=false}:SourceOptions={}):ModelEvidenceSource{
  const value=String(source??'').trim().toLowerCase().replace(/[_ ]+/gu,'-');
  if(['config','configured','configurazione'].includes(value))return'configured';
  if(['documented','documentation','documentazione','riserva','fallback'].includes(value))return'documented';
  if(['live','fornitore','provider','remote','runtime','runtime-locale'].includes(value))return'live';
  if(!value&&successfulCatalogBoundary)return'live';
  return'unknown';
}

function effortsFrom(...values:unknown[]):ReasoningEffort[]|null{
  let observed=false;const out:ReasoningEffort[]=[];
  for(const value of values){
    if(!Array.isArray(value))continue;
    observed=true;
    for(const item of value){
      if(typeof item!=='string'||!(REASONING_EFFORTS as readonly string[]).includes(item))continue;
      const effort=item as ReasoningEffort;
      if(!out.includes(effort))out.push(effort);
    }
  }
  return observed?out:null;
}

function evidenceMeta(row:any):{url:string|null;date:string|null}{
  const url=[row?.fonteMetadati,row?.fonteDichiarazione,row?.metadataSource,row?.declarationSource,row?.fonte]
    .find(value=>typeof value==='string'&&/^(?:https?:\/\/|urn:)/u.test(value))??null;
  const date=[row?.dataMetadati,row?.dataDichiarazione,row?.metadataDate,row?.declarationDate,row?.data]
    .find(value=>typeof value==='string'&&value.trim()!=='')??null;
  return{url,date};
}

function evidence<T>(value:T|null,source:ModelEvidenceSource,meta:{url:string|null;date:string|null}={url:null,date:null}):ModelCapabilityEvidence<T>{
  if(value===null)return{value:null,source:'unknown',evidenceUrl:null,evidenceDate:null};
  return{value,source,evidenceUrl:meta.url,evidenceDate:meta.date};
}

function documentedCapabilitySource(row:any,rowSource:ModelEvidenceSource,kind:'context'|'reasoning'):ModelEvidenceSource{
  if(rowSource==='documented')return'documented';
  const hasDocumentedMeta=typeof row?.fonteMetadati==='string'||typeof row?.fonteDichiarazione==='string'
    ||typeof row?.dataMetadati==='string'||typeof row?.dataDichiarazione==='string';
  return hasDocumentedMeta&&(kind==='context'||kind==='reasoning')?'documented':rowSource;
}

export function normalizeModelRows(rows:readonly any[],provider:string,source:ModelEvidenceSource):ModelCatalogRow[]{
  const seen=new Set<string>();const out:ModelCatalogRow[]=[];
  for(const row of rows){
    const raw=String(row?.id??row?.modelId??row?.model??'').trim();
    if(!raw)continue;
    const id=raw.startsWith(`${provider}:`)?raw:`${provider}:${raw}`;
    if(seen.has(id))continue;
    seen.add(id);

    const explicitSource=catalogSourceFromKernel(row?.fonte);
    const rowSource=explicitSource==='unknown'?source:explicitSource;
    const caps=row?.capacita??row?.capabilities??{};
    const supportedParameters=Array.isArray(row?.supported_parameters)?row.supported_parameters:Array.isArray(row?.supportedParameters)?row.supportedParameters:null;
    const supportedParameterSet=supportedParameters?new Set(supportedParameters.filter((value:unknown)=>typeof value==='string').map((value:string)=>value.toLowerCase())):null;
    const ownReasoning=row?.reasoning&&typeof row.reasoning==='object'&&!Array.isArray(row.reasoning)?row.reasoning:null;
    const capReasoning=caps?.reasoning&&typeof caps.reasoning==='object'&&!Array.isArray(caps.reasoning)?caps.reasoning:null;
    const reasoningEfforts=effortsFrom(
      row?.reasoningEfforts,row?.livelliRagionamento,row?.ragionamento?.livelli,
      ownReasoning?.supportedEfforts,ownReasoning?.supported_efforts,ownReasoning?.allowed_options,
      capReasoning?.supportedEfforts,capReasoning?.supported_efforts,capReasoning?.allowed_options,
      caps?.ragionamento?.livelli,
    );
    const structuredReasoning=Boolean(ownReasoning||capReasoning||row?.ragionamento&&typeof row.ragionamento==='object'||caps?.ragionamento&&typeof caps.ragionamento==='object');
    const reasoning=typeof row?.reasoning==='boolean'?row.reasoning
      :typeof row?.supportsReasoning==='boolean'?row.supportsReasoning
      :typeof caps?.reasoning==='boolean'?caps.reasoning
      :structuredReasoning||reasoningEfforts!==null||supportedParameterSet?.has('reasoning')===true||supportedParameterSet?.has('include_reasoning')===true?true:null;
    const contextWindow=Number.isFinite(row?.contextLength)?Number(row.contextLength)
      :Number.isFinite(row?.contextWindow)?Number(row.contextWindow)
      :Number.isFinite(row?.finestraContesto)?Number(row.finestraContesto)
      :Number.isFinite(row?.context_length)?Number(row.context_length):null;
    const toolCalling=typeof row?.toolCalling==='boolean'?row.toolCalling
      :typeof row?.supportsTools==='boolean'?row.supportsTools
      :typeof caps?.toolCall==='boolean'?caps.toolCall
      :typeof caps?.tools==='boolean'?caps.tools
      :supportedParameterSet?.has('tools')||supportedParameterSet?.has('tool_choice')?true:null;
    const explicitModalities=Array.isArray(row?.inputModalities)?row.inputModalities
      :Array.isArray(row?.input_modalities)?row.input_modalities
      :Array.isArray(row?.architecture?.input_modalities)?row.architecture.input_modalities
      :Array.isArray(row?.architecture?.inputModalities)?row.architecture.inputModalities:null;
    const images=explicitModalities?explicitModalities.includes('image')
      :typeof row?.images==='boolean'?row.images
      :typeof caps?.images==='boolean'?caps.images
      :typeof caps?.imageInput==='boolean'?caps.imageInput:null;
    const meta=evidenceMeta(row);
    const contextSource=documentedCapabilitySource(row,rowSource,'context');
    const reasoningSource=documentedCapabilitySource(row,rowSource,'reasoning');

    const capabilityEvidence:ModelCapabilityEvidenceSet={
      contextWindow:evidence(contextWindow,contextSource,contextSource==='documented'?meta:{url:null,date:null}),
      toolCalling:evidence(toolCalling,rowSource,rowSource==='documented'?meta:{url:null,date:null}),
      reasoning:evidence(reasoning,reasoningSource,reasoningSource==='documented'?meta:{url:null,date:null}),
      reasoningEfforts:evidence(reasoningEfforts,reasoningSource,reasoningSource==='documented'?meta:{url:null,date:null}),
      images:evidence(images,rowSource,rowSource==='documented'?meta:{url:null,date:null}),
    };

    out.push({
      id,provider,name:String(row?.nome??row?.name??raw),
      source:rowSource,available:rowSource,availabilityVerified:rowSource==='live',
      contextWindow,toolCalling,reasoning,reasoningEfforts,images,
      capabilityEvidence,
    });
  }
  return out;
}

function preferredCapability<T>(left:ModelCapabilityEvidence<T>,right:ModelCapabilityEvidence<T>):ModelCapabilityEvidence<T>{
  if(left.value===null)return right;
  if(right.value===null)return left;
  return CAPABILITY_RANK[right.source]>CAPABILITY_RANK[left.source]?right:left;
}

function withFlatCapabilities(row:Omit<ModelCatalogRow,'contextWindow'|'toolCalling'|'reasoning'|'reasoningEfforts'|'images'>):ModelCatalogRow{
  const evidence=row.capabilityEvidence;
  const reasoningEfforts=evidence.reasoningEfforts.value;
  const reasoning=evidence.reasoning.value??(reasoningEfforts!==null?true:null);
  return{
    ...row,
    contextWindow:evidence.contextWindow.value,
    toolCalling:evidence.toolCalling.value,
    reasoning,
    reasoningEfforts,
    images:evidence.images.value,
  };
}

function mergeTwo(left:ModelCatalogRow,right:ModelCatalogRow):ModelCatalogRow{
  const preferred=SOURCE_RANK[right.source]>SOURCE_RANK[left.source]?right:left;
  const capabilityEvidence:ModelCapabilityEvidenceSet={
    contextWindow:preferredCapability(left.capabilityEvidence.contextWindow,right.capabilityEvidence.contextWindow),
    toolCalling:preferredCapability(left.capabilityEvidence.toolCalling,right.capabilityEvidence.toolCalling),
    reasoning:preferredCapability(left.capabilityEvidence.reasoning,right.capabilityEvidence.reasoning),
    reasoningEfforts:preferredCapability(left.capabilityEvidence.reasoningEfforts,right.capabilityEvidence.reasoningEfforts),
    images:preferredCapability(left.capabilityEvidence.images,right.capabilityEvidence.images),
  };
  return withFlatCapabilities({
    id:left.id,
    provider:left.provider,
    name:preferred.name,
    source:preferred.source,
    available:preferred.source,
    availabilityVerified:preferred.source==='live',
    capabilityEvidence,
  });
}

export function mergeModelRows(...rows:ModelCatalogRow[]):ModelCatalogRow[]{
  const byId=new Map<string,ModelCatalogRow>();
  const order:string[]=[];
  for(const row of rows){
    const previous=byId.get(row.id);
    if(!previous){byId.set(row.id,row);order.push(row.id);continue;}
    byId.set(row.id,mergeTwo(previous,row));
  }
  return order.map(id=>byId.get(id)!);
}
