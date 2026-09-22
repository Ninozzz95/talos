import {highlightCodeLine,type HighlightToken} from '../highlight.ts';
import {displayWidth} from '../text-width.ts';
import {sanitizeTranscriptText} from '../transcript-model.ts';

export type MarkdownAlign='left'|'center'|'right';
export type MarkdownInlineToken={kind:'text'|'strong'|'emphasis'|'code'|'strike';text:string}|{kind:'link';text:string;href:string};
export type MarkdownBlock=
 | {kind:'heading';level:number;text:string}
 | {kind:'code';language:string;text:string;tokens:HighlightToken[][]}
 | {kind:'paragraph';text:string}
 | {kind:'blockquote';text:string}
 | {kind:'list';ordered:boolean;start:number;items:string[];depths:number[]}
 | {kind:'table';headers:string[];align:MarkdownAlign[];rows:string[][]};

export type MarkdownBlockLayout={mode:'plain'|'wide'|'narrow';lines:string[]};

export type MarkdownRenderProps={text:string;width:number};
export function markdownRenderPropsEqual(previous:MarkdownRenderProps,next:MarkdownRenderProps){return previous.text===next.text&&previous.width===next.width;}
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

export function parseMarkdownBlocks(text:string):MarkdownBlock[]{
  const lines=String(text).split(/\r?\n/u),out:MarkdownBlock[]=[];let paragraph:string[]=[];let code:string[]|null=null;let language='';
  const flushParagraph=()=>{if(paragraph.length){out.push({kind:'paragraph',text:paragraph.join('\n')});paragraph=[];}};
  const flushCode=()=>{if(code){out.push({kind:'code',language,text:code.join('\n'),tokens:code.map(line=>highlightCodeLine(line,language))});code=null;language='';}};
  for(let index=0;index<lines.length;){
    const line=lines[index]??'';
    const fence=/^```\s*([^\s`]*)/u.exec(line);
    if(fence){if(code){flushCode();index++;continue;}flushParagraph();code=[];language=fence[1]??'';index++;continue;}
    if(code){code.push(line);index++;continue;}
    const heading=/^(#{1,6})\s+(.*)$/u.exec(line);if(heading){flushParagraph();out.push({kind:'heading',level:heading[1]!.length,text:heading[2]??''});index++;continue;}
    if(line===''){flushParagraph();index++;continue;}

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
export function markdownBlockLines(block:MarkdownBlock,width:number):MarkdownBlockLayout{
  const limit=Math.max(1,Math.floor(width));
  if(block.kind==='heading')return{mode:'plain',lines:[markdownInlineText(block.text)]};
  if(block.kind==='paragraph')return{mode:'plain',lines:markdownInlineText(block.text).split('\n')};
  if(block.kind==='blockquote')return{mode:'plain',lines:markdownInlineText(block.text).split('\n').map(line=>'│ '+line)};
  if(block.kind==='code')return{mode:'plain',lines:block.text.split('\n').map(markdownSafeText)};
  if(block.kind==='list')return{mode:'plain',lines:block.items.map((item,index)=>'  '.repeat(block.depths[index]??0)+(block.ordered?String(block.start+index)+'. ':'• ')+markdownInlineText(item))};

  const header=block.headers.map(markdownInlineText),rows=block.rows.map(row=>row.map(markdownInlineText));
  const widths=header.map((value,column)=>Math.max(3,displayWidth(value),...rows.map(row=>displayWidth(row[column]??''))));
  const natural=widths.reduce((sum,value)=>sum+value,0)+Math.max(0,widths.length-1)*3;
  if(limit>=Math.max(32,natural)){
    const render=(row:string[])=>row.map((value,column)=>padCell(value??'',widths[column]??3,block.align[column]??'left')).join(' | ');
    const separator=widths.map((size,column)=>{
      const alignment=block.align[column]??'left';const dashes='-'.repeat(size);
      return alignment==='center'?':'+dashes.slice(2)+':':alignment==='right'?dashes.slice(0,-1)+':':alignment==='left'?dashes:dashes;
    }).join('-+-');
    return{mode:'wide',lines:[render(header),separator,...rows.map(render)]};
  }

  const lines:string[]=[];
  rows.forEach((row,rowIndex)=>{
    if(rowIndex>0)lines.push('');
    for(let column=0;column<header.length;column++)lines.push((header[column]||('Column '+(column+1)))+': '+(row[column]??''));
  });
  if(rows.length===0)for(let column=0;column<header.length;column++)lines.push(header[column]??'');
  return{mode:'narrow',lines};
}
