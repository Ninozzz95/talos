import type {ToolKindRenderer} from './registry.ts';import {argumentLine,boundedLines,outputText,parseArgs} from './shared.ts';import {tn} from '../../i18n/index.ts';
/* R2 lane T: the kernel's `cerca` sends `testo` (text inside files) and/or `nome` (a path fragment), talosHarness.mjs:1586-1599.
   R3 (Q-R3-1): `N results` on the row, counted from the kernel's own result shape (cercaNelProgetto, talosHarness.mjs:3630):
   one match per line, `no file matches. …` for none, `… and N[+] more matches not shown …` for the cut, `⚠` notices apart.
   These exact templates are pinned by r3-rd-tool-rows.test.ts; an answer of another shape gets no count.
   G02 (unified kernel, talosHarness.mjs cercaConRipgrep/cercaNomiConRipgrep/cercaNelProgetto): three «no match» shapes; an
   «inconclusive search», a stop, a refusal or a page past the end is NOT zero and gets no count; the page line
   (`nextOffset: …`) and the per-file note are not matches; `… and N more FILES with matches` means at least N more. */
const NO_MATCH=/^no file matches(?:\. Scanned | "| paths containing ")/u;
const NOT_COUNTED=/^(?:give at least one of "|inconclusive search: |stopped: the search was interrupted\.|(?:REFUSED|NOT FOUND|INVALID)\. |no further matches at offset )/u;
const MORE=/^… and (\d+)(\+?) more (matches|files with matches) not shown — narrow the search\.$/u;
/* F-S-001 (kernel 2098989ff, ported 1e55d56e0): the closing note on the secret files left out of the results is not a match either */
const NOT_A_MATCH=/^(?:nextOffset: \d+\. |\(at most \d+ matching lines per file are shown\)$|\[TALOS: \d+ file\(s\) omitted because they hold secrets )/u;
/* F001b (kernel 7d0d34b43, «ricerca che continua»): a search that outlives the reply opens with one header line; running,
   stopped, timed out or cut for size it is partial (a count is «at least», a zero is no count), finished it is final. */
const SEARCH_HEADER=/^\[TALOS: (?:this search is still running as search "[^"\n]+"|search "[^"\n]+" (?<state>finished|was stopped with Stop|reached its time limit|produced too much output))[^\n]*\]\n/u;
function searchCount(text:string):{count:number;atLeast:boolean}|null{
  let value=String(text).trim();
  const header=SEARCH_HEADER.exec(value);
  const partial=Boolean(header)&&header!.groups?.state!=='finished';
  if(header)value=value.slice(header[0].length).trim();
  /* «no file matches … yet» comes only under a running header: partial, so no count (the zero branch below) */
  if(NOT_COUNTED.test(value))return null;
  if(value===''||NO_MATCH.test(value))return partial?null:{count:0,atLeast:false};
  let count=0,atLeast=partial;
  for(const line of value.split(/\r?\n/u)){
    /* 5a: every ⚠ notice of `cerca` says the scan was not exhaustive (unreadable files, Linux links on a Windows drive, a
       time or size limit): the matches beside it are «at least», as the kernel's own `… and N+ more` says. */
    if(line.startsWith('⚠')){atLeast=true;continue;}
    if(!line.trim()||NOT_A_MATCH.test(line))continue;
    const more=MORE.exec(line);
    if(more){count+=Number(more[1]);atLeast||=more[2]==='+'||more[3]!=='matches';continue;}
    count++;
  }
  return{count,atLeast};
}
export const renderSearch:ToolKindRenderer=(row,context)=>{
  const a=parseArgs(row);const query=String(a.testo??a.nome??a.query??a.pattern??a.term??a.raw??'').trim();const path=String(a.path??a.root??'').trim();
  const found=searchCount(outputText(row));
  /* «at least» is always plural in English: «1+ results», never «1+ result» */
  const result=found?[tn('tool.search.results',found.atLeast?Math.max(2,found.count):found.count,found.atLeast?{count:`${found.count}+`}:{})]:[];
  const detail=[...(path?boundedLines(argumentLine('path',path),context.width,1):[]),...(row.status==='denied'||found?.count===0?[]:boundedLines(outputText(row),context.width,context.expanded?12:3))];
  return{target:query,result,detail,showsOutput:true};
};
