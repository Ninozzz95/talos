import {renderTool,type ToolRenderResult,type ToolRowModel} from '../tools/registry.ts';
export function toolRowView(row:ToolRowModel,width:number,expanded:boolean):ToolRenderResult{return renderTool(row,width,expanded);}
