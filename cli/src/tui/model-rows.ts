/*
 * Stage 7.10 (mockup PANELS.model «OpenRouter · $0.22 / $0.95 per M», «tools · reasoning low to high», «Ollama · on this
 * computer · free»): a catalogue model as the /model sheet shows it — where it runs and its list price from a named source
 * (model-profile.ts modelPrice, never invented), what it can do, and the efforts TALOS can set for it in TALOS's order
 * («default» first: the model decides). A model without reasoning levels offers only «default».
 */
import {t} from '../i18n/index.ts';
import {modelPrice} from '../runtime/model-profile.ts';
import type {TuiModel} from './catalog-service.ts';
import {orderedEfforts} from './overlays/effort-line.ts';
import {windowText,type ModelRow} from './panel/commands.ts';

/** «$0.22», «$3»: a list price per million tokens. */
export function priceText(usd:number):string{return `$${Number.isInteger(usd)?usd:usd.toFixed(2)}`;}

/** Stage 7.10d (mockup PANELS.setup «262k context · $0.22 / $0.95 per M · good with tools»): a model as the setup lists it —
 *  its context window, its list price from a named source (or free on this computer), and whether it does tools. */
export function setupDescOf(row:TuiModel,{local}:{local:boolean}):string{
  const remote=row.id.startsWith(`${row.provider}:`)?row.id.slice(row.provider.length+1):row.id;
  const price=local?null:modelPrice({provider:row.provider,model:remote});
  return[row.contextWindow?t('panel.setup.context',{tokens:windowText(row.contextWindow)}):'',local?t('panel.setup.free'):price?t('panel.setup.price',{input:priceText(price.inputPerMTok),output:priceText(price.outputPerMTok)}):'',
    row.toolCalling===true?t('panel.setup.goodWithTools'):''].filter(Boolean).join(' · ');
}

/** `local`: the provider is an engine on this computer (the catalogue's provider row says so). */
export function modelRowOf(row:TuiModel,{providerLabel,local}:{providerLabel:string;local:boolean}):ModelRow{
  const remote=row.id.startsWith(`${row.provider}:`)?row.id.slice(row.provider.length+1):row.id;
  const price=local?null:modelPrice({provider:row.provider,model:remote});
  const desc=local?t('panel.model.local',{provider:providerLabel})
    :price?t('panel.model.price',{provider:providerLabel,input:priceText(price.inputPerMTok),output:priceText(price.outputPerMTok)}):providerLabel;
  const levels=row.reasoning===true&&Array.isArray(row.reasoningEfforts)?orderedEfforts(row.reasoningEfforts):[];
  const caps=[
    ...(row.toolCalling===true?[t('panel.model.tools')]:[]),
    ...(row.images===true?[t('panel.model.images')]:[]),
    row.reasoning===false?t('panel.model.noReasoning'):levels.length>1?t('panel.model.reasoningRange',{from:levels[0]!,to:levels.at(-1)!}):levels.length===1?t('panel.model.reasoningOne',{level:levels[0]!}):row.reasoning===true?t('panel.model.reasoning'):'',
  ].filter(Boolean);
  return{id:row.id,name:row.name&&row.name!==row.id?row.name:remote,provider:providerLabel,contextWindow:row.contextWindow,desc,caps:caps.join(' · '),efforts:['default',...levels],verified:row.availabilityVerified===true,reasons:row.reasoning===true||levels.length>0,images:row.images===true,tools:row.toolCalling===true,free:local};
}
