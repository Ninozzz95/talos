import type {ToolKindRenderer} from './registry.ts';import {argumentLine,boundedLines,outputText,parseArgs} from './shared.ts';import {addressArgumentKeys,addressShown,primaryArgumentKeys,toolDisplay} from '../tool-display.ts';
/* R2 lane T (review D-07, Q-R2-3): the title is the English label and the primary argument's value; every other argument
   is one `label: value` line, a structure counted and never printed as JSON. R3: a refused call shows its reason, not
   its output (row-format.ts). */
export const renderGeneric:ToolKindRenderer=(row,context)=>{
  const a=parseArgs(row);const view=toolDisplay(row.name,a);
  /* 0.7.0 item 6: the key the value was read from; an address shown shortened (or not at all) never comes back raw in the details */
  const primaryKey=view.primaryKey??(view.primaryArg===null?null:primaryArgumentKeys(row.name).find(key=>a[key]!==undefined&&String(a[key])===view.primaryArg)??null);
  const address=addressArgumentKeys(row.name);
  const argLines=Object.entries(a).filter(([key])=>key!==primaryKey).filter(([key,value])=>!address.has(key)||typeof value!=='string'||addressShown(value)!==null).map(([key,value])=>argumentLine(key,address.has(key)&&typeof value==='string'?addressShown(value):value));
  const details=[...boundedLines(argLines.join('\n'),context.width,context.expanded?12:2),...(row.status==='denied'?[]:boundedLines(outputText(row),context.width,context.expanded?12:3))];
  return{target:view.primaryArg??'',result:[],detail:details,showsOutput:true};
};
