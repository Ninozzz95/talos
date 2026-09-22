import type {ToolRenderer} from './registry.ts';import {boundedLines,outputText,parseArgs,result,safeTitle} from './shared.ts';
export const renderBash:ToolRenderer=(row,width,expanded)=>{const a=parseArgs(row);const command=String(a.command??a.cmd??a.raw??'').trim();const output=outputText(row);return result(safeTitle('Bash',command,width),row,boundedLines(output,width,expanded?16:4));};
