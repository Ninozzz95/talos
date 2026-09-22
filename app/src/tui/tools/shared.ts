import {truncateDisplay} from '../text-width.ts';
import type {ToolRenderResult,ToolRowModel} from './registry.ts';

export function parseArgs(row:ToolRowModel):Record<string,any>{try{const value=JSON.parse(row.argsText||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{raw:row.argsText};}catch{return{raw:row.argsText};}}
export function outputText(row:ToolRowModel){return row.finalOutput||row.liveOutput||'';}
export function boundedLines(text:string,width:number,maxLines=8){const cap=Math.max(16,Math.min(240,width-4));const rows=String(text).split(/\r?\n/u).slice(0,maxLines).map(line=>truncateDisplay(line,cap));if(String(text).split(/\r?\n/u).length>maxLines)rows.push('…');return rows.filter(Boolean);}
export function result(title:string,row:ToolRowModel,detailLines:string[]):ToolRenderResult{return{title,statusLabel:row.status,detailLines};}
export function safeTitle(prefix:string,target:string,width:number){return truncateDisplay(`${prefix}${target?` ${target}`:''}`,Math.max(10,width));}
