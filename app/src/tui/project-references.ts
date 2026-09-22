import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {IMAGE_ATTACHMENT_MAX_BYTES,TEXT_ATTACHMENT_MAX_BYTES,imageMimeFromBytes,validateCliAttachments,type CliAttachment} from '../runtime/attachments.ts';
import {isPathInsideWorkspace,resolvePathInsideWorkspace,resolveWorkspaceIdentity} from '../security/workspace-identity.ts';

export class ProjectReferenceError extends Error{
  code:string;
  constructor(code:string,message=code){super(message);this.name='ProjectReferenceError';this.code=code;}
}

export function parseProjectReferenceTokens(prompt:string):string[]{
  const out:string[]=[];const pattern=/(?:^|\s)@(?:"([^"\r\n]+)"|([^\s"'<>]+))/gu;
  for(const match of prompt.matchAll(pattern)){const value=match[1]??match[2];if(value)out.push(value);}
  return out;
}

function portableAbsolute(value:string){return path.isAbsolute(value)||path.win32.isAbsolute(value);}
function relativeProjectPath(root:string,target:string){return path.relative(root,target).split(path.sep).join('/');}

export async function resolveProjectReferences({projectRoot,prompt}:{projectRoot:string;prompt:string}):Promise<CliAttachment[]>{
  const tokens=parseProjectReferenceTokens(prompt);if(tokens.length===0)return[];
  const workspace=await resolveWorkspaceIdentity({projectRoot});const seen=new Set<string>();const attachments:CliAttachment[]=[];
  for(const raw of tokens){
    if(portableAbsolute(raw))throw new ProjectReferenceError('PROJECT_REFERENCE_OUTSIDE_WORKSPACE','Absolute project references are not allowed.');
    const lexical=path.resolve(workspace.requestedRoot,raw);
    if(!isPathInsideWorkspace(workspace,lexical))throw new ProjectReferenceError('PROJECT_REFERENCE_OUTSIDE_WORKSPACE','Project reference escapes the workspace.');
    let info;try{info=await stat(lexical);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new ProjectReferenceError('PROJECT_REFERENCE_NOT_FOUND',`Project reference not found: ${raw}`);throw error;}
    const canonical=await resolvePathInsideWorkspace(workspace,lexical);
    if(!canonical)throw new ProjectReferenceError('PROJECT_REFERENCE_OUTSIDE_WORKSPACE','Project reference resolves outside the workspace.');
    try{info=await stat(canonical);}catch{throw new ProjectReferenceError('PROJECT_REFERENCE_NOT_FOUND',`Project reference not found: ${raw}`);}
    if(!info.isFile())throw new ProjectReferenceError('PROJECT_REFERENCE_NOT_FILE',`Project reference is not a regular file: ${raw}`);
    if(info.size>IMAGE_ATTACHMENT_MAX_BYTES)throw new ProjectReferenceError('ATTACHMENT_ITEM_TOO_LARGE','Referenced file is larger than the maximum supported attachment.');
    if(seen.has(canonical))continue;seen.add(canonical);
    const bytes=await readFile(canonical);const canonicalAfter=await resolvePathInsideWorkspace(workspace,canonical);if(canonicalAfter!==canonical)throw new ProjectReferenceError('PROJECT_REFERENCE_CHANGED','Project reference changed while it was being read.');const mime=imageMimeFromBytes(bytes);const stablePath=relativeProjectPath(workspace.canonicalRoot,canonical);
    if(!stablePath||/[\0\r\n]/u.test(stablePath))throw new ProjectReferenceError('ATTACHMENT_INVALID','Project reference path is invalid.');
    if(mime){attachments.push({kind:'image',path:stablePath,mimeType:mime,bytes:bytes.length,dataBase64:bytes.toString('base64')});continue;}
    if(bytes.length>TEXT_ATTACHMENT_MAX_BYTES)throw new ProjectReferenceError('ATTACHMENT_TEXT_TOO_LARGE',`Text reference is larger than ${TEXT_ATTACHMENT_MAX_BYTES} bytes.`);
    let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ProjectReferenceError('ATTACHMENT_BINARY_UNSUPPORTED',`Unsupported binary project reference: ${stablePath}`);}
    if(text.includes('\0'))throw new ProjectReferenceError('ATTACHMENT_BINARY_UNSUPPORTED',`Unsupported binary project reference: ${stablePath}`);
    attachments.push({kind:'text',path:stablePath,mimeType:'text/plain',bytes:bytes.length,text});
  }
  return validateCliAttachments(attachments);
}
