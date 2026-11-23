/*
 * R3 CONTRACT (owner: lane R+D; stub written by the coordinator so both lanes compile). The ONE line diff (Q-R3-11: jsdiff
 * 9.0.0, pinned) feeding the write/edit row summary, its Ctrl+O diff and the approval preview (gate E10). It returns the
 * existing DiffModel so components/diff.ts renders it. Lane S+P only CALLS lineDiff; lane R+D owns the body and may not
 * change the signature.
 *
 * R3 lane RD body. jsdiff's `structuredPatch` (Myers, the library Gemini 8.0.3, Pi 8.0.4, Qwen ^7 and OpenCode diff with,
 * gate §3.2) with 3 context lines, the same as `/diff` (`git diff --unified=3`). The counts are the `+`/`-` lines of the
 * hunks, so a moved line and an edit of one of two identical lines are seen — the multiset count it replaces saw neither.
 * Lines are compared exactly as written (a CRLF → LF change is a change); a trailing `\r` never reaches the screen.
 * A change too large to compare in time (jsdiff `timeout`, and a line cap that keeps a huge file off the event loop)
 * returns the whole replacement flagged `approximate` with one plain row saying so: never a fake minimal diff.
 */
import {structuredPatch} from 'diff';
import {t} from '../i18n/index.ts';
import type {DiffModel,DiffRow} from './diff-model.ts';

export type LineDiff={added:number;removed:number;model:DiffModel;approximate?:true};

/* Beyond these the diff is not attempted (Myers is O((N+M)·D)); the row then states the sizes, not a count it cannot know. */
const MAX_LINES=50_000;
const TIMEOUT_MS=250;
const CONTEXT=3;

function linesOf(text:string){if(text==='')return 0;const n=text.split('\n').length;return text.endsWith('\n')?n-1:n;}
function row(kind:DiffRow['kind'],text:string,oldLine:number|null=null,newLine:number|null=null):DiffRow{return{kind,text:text.endsWith('\r')?text.slice(0,-1):text,oldLine,newLine};}

export function lineDiff(before:string|null,after:string,{path='file'}:{path?:string}={}):LineDiff{
  const old=before??'',next=String(after??'');
  if(old===next)return{added:0,removed:0,model:{files:[],plain:[],empty:true}};
  const oldCount=linesOf(old),newCount=linesOf(next);
  const patch=oldCount+newCount>MAX_LINES?undefined:structuredPatch(path,path,old,next,undefined,undefined,{context:CONTEXT,timeout:TIMEOUT_MS});
  if(!patch){
    const note=row('plain',t('tool.diff.tooLarge',{before:oldCount,after:newCount}));
    return{added:newCount,removed:oldCount,approximate:true,model:{files:[],plain:[note],empty:false}};
  }
  const rows:DiffRow[]=[];let added=0,removed=0;
  for(const hunk of patch.hunks){
    /* The header the way `git diff` and jsdiff's own formatPatch print it: an empty side starts one line earlier. */
    const oldStart=hunk.oldLines===0?hunk.oldStart-1:hunk.oldStart,newStart=hunk.newLines===0?hunk.newStart-1:hunk.newStart;
    rows.push(row('hunk',`@@ -${oldStart},${hunk.oldLines} +${newStart},${hunk.newLines} @@`));
    let oldLine=hunk.oldStart,newLine=hunk.newStart;
    for(const text of hunk.lines){
      const mark=text[0],body=text.slice(1);
      if(mark==='+'){rows.push(row('add',body,null,newLine++));added++;}
      else if(mark==='-'){rows.push(row('remove',body,oldLine++,null));removed++;}
      else if(mark==='\\')rows.push(row('no-newline',text));
      else rows.push(row('context',body,oldLine++,newLine++));
    }
  }
  return{added,removed,model:{files:[{oldPath:path,newPath:path,rows}],plain:[],empty:rows.length===0}};
}
