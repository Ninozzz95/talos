export type DiffRowKind='meta'|'hunk'|'context'|'add'|'remove'|'no-newline'|'plain';
export type DiffRow={kind:DiffRowKind;text:string;oldLine:number|null;newLine:number|null};
export type DiffFile={oldPath:string;newPath:string;rows:DiffRow[]};
export type DiffModel={files:DiffFile[];plain:DiffRow[];empty:boolean};

function row(kind:DiffRowKind,text:string,oldLine:number|null=null,newLine:number|null=null):DiffRow{return{kind,text,oldLine,newLine};}
function headerPaths(line:string):{oldPath:string;newPath:string}{
  const body=line.slice('diff --git '.length);
  const quoted=[...body.matchAll(/"((?:\\.|[^"])*)"|([^\s]+)/gu)].map(match=>(match[1]??match[2]??'').replace(/\\(["\\])/gu,'$1'));
  return{oldPath:quoted[0]??'',newPath:quoted[1]??''};
}
function pathHeader(line:string){return line.slice(4).split('\t')[0]??'';}

export function parseUnifiedDiff(input:string):DiffModel{
  const source=String(input??'');
  if(!source.trim()||source.trim()==='(no changes)')return{files:[],plain:source.trim()==='(no changes)'?[row('plain','(no changes)')]:[],empty:true};
  const lines=source.split(/\r?\n/u),files:DiffFile[]=[],plain:DiffRow[]=[];let current:DiffFile|null=null;let oldLine:number|null=null,newLine:number|null=null,inHunk=false;
  const finish=()=>{if(current){files.push(current);current=null;}oldLine=null;newLine=null;inHunk=false;};
  for(const line of lines){
    if(line.startsWith('diff --git ')){
      finish();const paths=headerPaths(line);current={...paths,rows:[]};continue;
    }
    if(!current){plain.push(row('plain',line));continue;}
    if(line.startsWith('--- ')){current.oldPath=pathHeader(line);current.rows.push(row('meta',line));inHunk=false;continue;}
    if(line.startsWith('+++ ')){current.newPath=pathHeader(line);current.rows.push(row('meta',line));inHunk=false;continue;}
    const hunk=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/u.exec(line);
    if(hunk){oldLine=Number(hunk[1]);newLine=Number(hunk[3]);inHunk=true;current.rows.push(row('hunk',line));continue;}
    if(inHunk&&line.startsWith('\\ No newline at end of file')){current.rows.push(row('no-newline',line));continue;}
    if(inHunk&&line.startsWith('+')){current.rows.push(row('add',line.slice(1),null,newLine));newLine=(newLine??0)+1;continue;}
    if(inHunk&&line.startsWith('-')){current.rows.push(row('remove',line.slice(1),oldLine,null));oldLine=(oldLine??0)+1;continue;}
    if(inHunk&&line.startsWith(' ')){current.rows.push(row('context',line.slice(1),oldLine,newLine));oldLine=(oldLine??0)+1;newLine=(newLine??0)+1;continue;}
    current.rows.push(row('meta',line));inHunk=false;oldLine=null;newLine=null;
  }
  finish();
  return{files,plain,empty:files.length===0&&plain.every(item=>item.text.trim()===''||item.text.trim()==='(no changes)')};
}
