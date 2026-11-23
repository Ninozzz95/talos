import {t} from '../../i18n/index.ts';
import {highlightCodeLine,type HighlightToken} from '../highlight.ts';
import {displayWidth,wrapDisplay} from '../text-width.ts';
import {sanitizeTranscriptText} from '../transcript-model.ts';

export type MarkdownAlign='left'|'center'|'right';
export type MarkdownInlineToken={kind:'text'|'strong'|'emphasis'|'code'|'strike';text:string}|{kind:'link';text:string;href:string};
export type MarkdownBlock=
 | {kind:'heading';level:number;text:string}
 | {kind:'code';language:string;text:string;tokens:HighlightToken[][]}
 | {kind:'paragraph';text:string}
 | {kind:'blockquote';text:string}
 | {kind:'list';ordered:boolean;start:number;items:string[];depths:number[]}
 | {kind:'table';headers:string[];align:MarkdownAlign[];rows:string[][]}
 | {kind:'rule'};

/* `roles` (UI Phase 0 D10): what each line of a boxed table is, so the renderer dims the borders and bolds the header. */
export type MarkdownBlockLayout={mode:'plain'|'wide'|'narrow';lines:string[];roles?:('border'|'header'|'row')[]};

export type MarkdownRenderProps={text:string;width:number;maxProseWidth?:number|null};
export function markdownRenderPropsEqual(previous:MarkdownRenderProps,next:MarkdownRenderProps){return previous.text===next.text&&previous.width===next.width&&previous.maxProseWidth===next.maxProseWidth;}
/** A display constraint only: code and tables retain the terminal's full width. */
export function markdownBlockWidth(block:MarkdownBlock,width:number,maxProseWidth?:number|null):number{
  const available=Math.max(1,Math.floor(width));
  return block.kind==='code'||block.kind==='table'||maxProseWidth==null?available:Math.max(1,Math.min(available,maxProseWidth));
}
export function createMarkdownParseMemo({parser=parseMarkdownBlocks}:{parser?:(text:string)=>MarkdownBlock[]}={}){
  let cachedText:string|null=null,cachedBlocks:MarkdownBlock[]|null=null;
  return{
    get(text:string){const value=String(text);if(cachedBlocks!==null&&cachedText===value)return cachedBlocks;const blocks=parser(value);cachedText=value;cachedBlocks=blocks;return blocks;},
    invalidate(){cachedText=null;cachedBlocks=null;},
  };
}

export function markdownSafeText(text:string){return sanitizeTranscriptText(String(text));}
function safeLinkDestination(value:string){
  const destination=markdownSafeText(value).trim();
  if(!destination||/[\s\x00-\x1f\x7f]/u.test(destination))return null;
  if(destination.startsWith('#')||destination.startsWith('./')||destination.startsWith('../')||destination.startsWith('/'))return destination;
  const scheme=/^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(destination)?.[1]?.toLowerCase()??null;
  if(!scheme)return destination;
  return scheme==='http'||scheme==='https'||scheme==='mailto'?destination:null;
}
function mergeInlineText(tokens:MarkdownInlineToken[]):MarkdownInlineToken[]{const out:MarkdownInlineToken[]=[];for(const token of tokens){const previous=out.at(-1);if(token.kind==='text'&&previous?.kind==='text')previous.text+=token.text;else out.push(token);}return out;}
export function parseMarkdownInline(text:string):MarkdownInlineToken[]{
  const safe=markdownSafeText(text),tokens:MarkdownInlineToken[]=[];let plain='';
  const flush=()=>{if(plain){tokens.push({kind:'text',text:plain});plain='';}};
  for(let index=0;index<safe.length;){
    const rest=safe.slice(index);
    if(rest.startsWith('**')){const end=safe.indexOf('**',index+2);if(end<0){plain+=rest;break;}flush();tokens.push({kind:'strong',text:safe.slice(index+2,end)});index=end+2;continue;}
    if(rest.startsWith('~~')){const end=safe.indexOf('~~',index+2);if(end<0){plain+=rest;break;}flush();tokens.push({kind:'strike',text:safe.slice(index+2,end)});index=end+2;continue;}
    if(rest.startsWith('`')){const end=safe.indexOf('`',index+1);if(end<0){plain+=rest;break;}flush();tokens.push({kind:'code',text:safe.slice(index+1,end)});index=end+1;continue;}
    if(rest.startsWith('*')){const end=safe.indexOf('*',index+1);if(end<0){plain+=rest;break;}flush();tokens.push({kind:'emphasis',text:safe.slice(index+1,end)});index=end+1;continue;}
    if(rest.startsWith('[')){
      const close=safe.indexOf('](',index+1);if(close>=0){const end=safe.indexOf(')',close+2);if(end>=0){const label=safe.slice(index+1,close),target=safeLinkDestination(safe.slice(close+2,end));if(target){flush();tokens.push({kind:'link',text:label,href:target});index=end+1;continue;}}}
    }
    plain+=safe[index]??'';index++;
  }
  flush();return mergeInlineText(tokens);
}
export function markdownInlineText(text:string){return parseMarkdownInline(text).map(token=>token.kind==='link'?`${token.text} (${token.href})`:token.text).join('');}

function splitTableRow(line:string):string[]{
  let value=line.trim();if(value.startsWith('|'))value=value.slice(1);if(value.endsWith('|')&&!value.endsWith('\\|'))value=value.slice(0,-1);
  const cells:string[]=[],current:string[]=[];let escaped=false;
  for(const character of value){
    if(escaped){current.push(character);escaped=false;continue;}
    if(character==='\\'){escaped=true;current.push(character);continue;}
    if(character==='|'){cells.push(current.join('').trim().replace(/\\\|/gu,'|'));current.length=0;continue;}
    current.push(character);
  }
  if(escaped)current.push('\\');
  cells.push(current.join('').trim().replace(/\\\|/gu,'|'));
  return cells;
}
function delimiterRow(line:string):MarkdownAlign[]|null{
  const cells=splitTableRow(line);if(!cells.length)return null;const align:MarkdownAlign[]=[];
  for(const cell of cells){
    if(!/^:?-{3,}:?$/u.test(cell))return null;
    align.push(cell.startsWith(':')&&cell.endsWith(':')?'center':cell.endsWith(':')?'right':'left');
  }
  return align;
}
function listRow(line:string){
  const unordered=/^(\s*)[-+*]\s+(.+)$/u.exec(line);if(unordered)return{ordered:false,start:1,text:unordered[2]??'',depth:Math.floor((unordered[1]?.replace(/\t/gu,'  ').length??0)/2)};
  const ordered=/^(\s*)(\d{1,9})[.)]\s+(.+)$/u.exec(line);if(ordered)return{ordered:true,start:Number(ordered[2]),text:ordered[3]??'',depth:Math.floor((ordered[1]?.replace(/\t/gu,'  ').length??0)/2)};
  return null;
}

/*
 * FMT (G06.2 brought forward, owner 2026-09-30; screenshot of an answer shown as raw Markdown). Models often wrap a whole
 * report in a ```markdown fence, which made it one code block. Owner decision, after reading the three: a `md`/`markdown`
 * fence is ALWAYS drawn as Markdown, also while it streams (Hermes `ui-tui/src/components/markdown.tsx:788`); Codex does it
 * only around a table (`codex-rs/tui/src/markdown.rs`), Claude Code never (a highlighted code block). The source is not lost:
 * Alt+R shows the raw transcript, Alt+C copies the message. The closing fence must be at least as long as the opening one, so
 * a ````markdown keeps its inner ``` blocks; an unclosed one runs to the end of the text.
 */
const THEMATIC_BREAK=/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/u;
function unwrapMarkdownFences(lines:readonly string[]):string[]{
  const out:string[]=[];
  for(let index=0;index<lines.length;index++){
    const line=lines[index]??'',open=/^ {0,3}(`{3,})(.*)$/u.exec(line);
    if(!open){out.push(line);continue;}
    const size=open[1]!.length;let close=lines.length;
    for(let next=index+1;next<lines.length;next++){const fence=/^ {0,3}(`{3,})\s*$/u.exec(lines[next]??'');if(fence&&fence[1]!.length>=size){close=next;break;}}
    /* Any other fence is copied through untouched, so a ```markdown line inside a bash example stays code. */
    if(!/^\s*(md|markdown)\s*$/iu.test(open[2]??'')){out.push(...lines.slice(index,close+1));index=close;continue;}
    out.push(...unwrapMarkdownFences(lines.slice(index+1,close)));index=close;
  }
  return out;
}
export function parseMarkdownBlocks(text:string):MarkdownBlock[]{
  const lines=unwrapMarkdownFences(String(text).split(/\r?\n/u)),out:MarkdownBlock[]=[];let paragraph:string[]=[];let code:string[]|null=null;let language='',fenceSize=3;
  const flushParagraph=()=>{if(paragraph.length){out.push({kind:'paragraph',text:paragraph.join('\n')});paragraph=[];}};
  const flushCode=()=>{if(code){out.push({kind:'code',language,text:code.join('\n'),tokens:code.map(line=>highlightCodeLine(line,language))});code=null;language='';}};
  for(let index=0;index<lines.length;){
    const line=lines[index]??'';
    /* FMT: a fence closes only on a bare run of backticks at least as long as the one that opened it (CommonMark), so a
       ```markdown line inside a bash example stays inside it. */
    if(code){const close=/^ {0,3}(`{3,})\s*$/u.exec(line);if(close&&close[1]!.length>=fenceSize){flushCode();index++;continue;}code.push(line);index++;continue;}
    const fence=/^ {0,3}(`{3,})\s*([^\s`]*)/u.exec(line);
    if(fence){flushParagraph();code=[];fenceSize=fence[1]!.length;language=fence[2]??'';index++;continue;}
    const heading=/^(#{1,6})\s+(.*)$/u.exec(line);if(heading){flushParagraph();out.push({kind:'heading',level:heading[1]!.length,text:heading[2]??''});index++;continue;}
    if(line===''){flushParagraph();index++;continue;}
    /* FMT: `---`, `***`, `___` (spaced or not) is a rule, also under a paragraph line: in a model's answer it separates
       sections far more often than it makes a setext heading. Before the list, as in CommonMark (`- - -` is a rule). */
    if(THEMATIC_BREAK.test(line)){flushParagraph();out.push({kind:'rule'});index++;continue;}

    if(/^\s*>/u.test(line)){flushParagraph();const quoted:string[]=[];while(index<lines.length){const match=/^\s*>\s?(.*)$/u.exec(lines[index]??'');if(!match)break;quoted.push(match[1]??'');index++;}out.push({kind:'blockquote',text:quoted.join('\n')});continue;}

    const list=listRow(line);
    if(list){
      flushParagraph();const items=[list.text],depths=[list.depth],start=list.start;index++;
      while(index<lines.length){const next=listRow(lines[index]??'');if(!next||next.ordered!==list.ordered)break;items.push(next.text);depths.push(next.depth);index++;}
      out.push({kind:'list',ordered:list.ordered,start,items,depths});continue;
    }

    const next=lines[index+1];const align=next===undefined?null:delimiterRow(next);
    if(line.includes('|')&&align){
      const headers=splitTableRow(line);
      if(headers.length===align.length){
        flushParagraph();const rows:string[][]=[];index+=2;
        while(index<lines.length&&(lines[index]??'').trim()!==''&&(lines[index]??'').includes('|')){
          const cells=splitTableRow(lines[index]??'');if(cells.length!==headers.length)break;rows.push(cells);index++;
        }
        out.push({kind:'table',headers,align,rows});continue;
      }
    }

    paragraph.push(line);index++;
  }
  if(code)flushCode();flushParagraph();return out;
}

function padCell(value:string,width:number,align:MarkdownAlign){
  const gap=Math.max(0,width-displayWidth(value));
  if(align==='right')return' '.repeat(gap)+value;
  if(align==='center'){const left=Math.floor(gap/2);return' '.repeat(left)+value+' '.repeat(gap-left);}
  return value+' '.repeat(gap);
}
/*
 * UI Phase 0 D7: a list item that wraps continues under its own text, not under the bullet (a hanging indent, as Pi and
 * OpenCode draw it). Words move whole to the next row; a word wider than the room is cut by display width.
 */
export function markdownListItemLines({prefix,text,width}:{prefix:string;text:string;width:number}):string[]{
  const indent=' '.repeat(displayWidth(prefix)),room=Math.max(1,Math.floor(width)-displayWidth(prefix));
  const rows:string[]=[];let row='';
  for(const word of String(text).split(/\s+/u).filter(Boolean)){
    for(const piece of displayWidth(word)>room?wrapDisplay(word,room):[word]){
      if(row===''){row=piece;continue;}
      if(displayWidth(row)+1+displayWidth(piece)<=room)row+=' '+piece;else{rows.push(row);row=piece;}
    }
  }
  rows.push(row);
  return rows.map((value,index)=>(index===0?prefix:indent)+value);
}
export function markdownBlockLines(block:MarkdownBlock,width:number,{unicode=false}:{unicode?:boolean}={}):MarkdownBlockLayout{
  const limit=Math.max(1,Math.floor(width));
  if(block.kind==='heading')return{mode:'plain',lines:[markdownInlineText(block.text)]};
  if(block.kind==='paragraph')return{mode:'plain',lines:markdownInlineText(block.text).split('\n')};
  if(block.kind==='blockquote')return{mode:'plain',lines:markdownInlineText(block.text).split('\n').map(line=>'│ '+line)};
  if(block.kind==='code')return{mode:'plain',lines:block.text.split('\n').map(markdownSafeText)};
  if(block.kind==='rule')return{mode:'plain',lines:[(unicode?'─':'-').repeat(limit)]};
  if(block.kind==='list')return{mode:'plain',lines:block.items.flatMap((item,index)=>markdownListItemLines({prefix:'  '.repeat(block.depths[index]??0)+(block.ordered?String(block.start+index)+'. ':'• '),text:markdownInlineText(item),width:limit}))};

  const header=block.headers.map(markdownInlineText),rows=block.rows.map(row=>row.map(markdownInlineText));
  const widths=header.map((value,column)=>Math.max(3,displayWidth(value),...rows.map(row=>displayWidth(row[column]??''))));
  const natural=widths.reduce((sum,value)=>sum+value,0)+Math.max(0,widths.length-1)*3;
  /* UI Phase 0 D10: on a Unicode terminal the table is boxed (Pi, OpenCode, Claude Code); 4 more columns for the sides. */
  if(unicode&&limit>=Math.max(32,natural+4)){
    const render=(row:string[])=>'│ '+row.map((value,column)=>padCell(value??'',widths[column]??3,block.align[column]??'left')).join(' │ ')+' │';
    const rule=(left:string,middle:string,right:string)=>left+widths.map(size=>'─'.repeat(size+2)).join(middle)+right;
    return{mode:'wide',lines:[rule('┌','┬','┐'),render(header),rule('├','┼','┤'),...rows.map(render),rule('└','┴','┘')],roles:['border','header','border',...rows.map(()=>'row' as const),'border']};
  }
  if(limit>=Math.max(32,natural)){
    const render=(row:string[])=>row.map((value,column)=>padCell(value??'',widths[column]??3,block.align[column]??'left')).join(' | ');
    /* R3 gate E13 (D-13): the separator is dashes only. The alignment colon is Markdown source syntax; alignment is shown
       by the cell padding above (`padCell`), the way Codex, Crush, Goose and Qwen draw an aligned table (gate §7). */
    const separator=widths.map(size=>'-'.repeat(size)).join('-+-');
    return{mode:'wide',lines:[render(header),separator,...rows.map(render)]};
  }

  const lines:string[]=[];
  rows.forEach((row,rowIndex)=>{
    if(rowIndex>0)lines.push('');
    for(let column=0;column<header.length;column++)lines.push((header[column]||t('screen.markdown.column',{number:column+1}))+': '+(row[column]??''));
  });
  if(rows.length===0)for(let column=0;column<header.length;column++)lines.push(header[column]??'');
  return{mode:'narrow',lines};
}
