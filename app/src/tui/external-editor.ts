import {spawnSync} from 'node:child_process';
import {readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export function parseEditorCommand(value:string){const out:string[]=[];let token='',quote='';for(let i=0;i<value.length;i++){const ch=value[i]!;if(quote){if(ch===quote){quote='';continue;}if(ch==='\\'&&quote==='"'&&i+1<value.length){token+=value[++i]!;continue;}token+=ch;continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(/\s/u.test(ch)){if(token){out.push(token);token='';}continue;}if(ch==='\\'&&i+1<value.length){token+=value[++i]!;continue;}token+=ch;}if(quote)throw Object.assign(new Error('EXTERNAL_EDITOR_PARSE_FAILED'),{code:'EXTERNAL_EDITOR_PARSE_FAILED'});if(token)out.push(token);if(out.length===0)throw Object.assign(new Error('EXTERNAL_EDITOR_NOT_CONFIGURED'),{code:'EXTERNAL_EDITOR_NOT_CONFIGURED'});return out;}

export async function editExternally({text,editor,tmpRoot,spawn=spawnSync}:{text:string;editor:string|undefined;tmpRoot:string;spawn?:typeof spawnSync}){
  if(!editor?.trim())throw Object.assign(new Error('EXTERNAL_EDITOR_NOT_CONFIGURED'),{code:'EXTERNAL_EDITOR_NOT_CONFIGURED'});
  const [command,...args]=parseEditorCommand(editor);const file=join(tmpRoot,`talos-editor-${process.pid}-${Date.now()}.txt`);await writeFile(file,text,{encoding:'utf8',mode:0o600});
  try{const result=spawn(command!,[...args,file],{stdio:'inherit',shell:false,windowsHide:false});if(result.status!==0)throw Object.assign(new Error('EXTERNAL_EDITOR_FAILED'),{code:'EXTERNAL_EDITOR_FAILED'});return await readFile(file,'utf8');}finally{await rm(file,{force:true});}
}
