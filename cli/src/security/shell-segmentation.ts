export type ShellCommandSegment={command:string;operatorBefore:null|'&&'|'||'|'|'|'&'|';'|'newline'};

function fail(code:'SHELL_COMPOSITION_INVALID'|'SHELL_COMPOSITION_UNSUPPORTED'):never{
  throw Object.assign(new Error(code),{code});
}

/*
 * C-005 (benchmark ticket, 01/10). Two constructs that every model writes were refused as a whole, so even
 * bypassPermissions denied `ls ~/.thunderbird 2>/dev/null` and a `python - <<'PY'` script. They are now understood:
 * - a redirection that touches no file: to /dev/null (`2>/dev/null`, `>/dev/null`, `&>/dev/null`, `2>>/dev/null`) or between
 *   descriptors (`2>&1`, `>&2`, `2>&-`). It is left out of the segment, so rules see the command itself;
 * - a heredoc. Its body is the INPUT of its command, never commands: `python - <<'PY'` is the segment `python -`. With a quoted
 *   delimiter the shell expands nothing in it; with a bare one it runs `$(…)` and backticks, so such a body is refused.
 * Everything else that redirects (`>`, `>>`, `<`, `<<<` to or from a real file) stays SHELL_COMPOSITION_UNSUPPORTED.
 */
/* 0.6.10 (bugfixer): «nothing on the line» means spaces and tabs only, as the shell reads it. JS `trim()` would also drop NBSP,
   U+3000, U+FEFF, \v and \f, which a POSIX shell takes as part of a command word. */
const ONLY_BLANKS=/^[ \t]*$/u;
const DESCRIPTOR_TARGET=/^&(?:\d+|-)(?=$|[\s;&|)])/u;
const NULL_TARGET=/^\s*\/dev\/null(?=$|[\s;&|)])/u;

type Heredoc={delimiter:string;stripTabs:boolean;quoted:boolean};

/** Reads `<<[-] DELIM` at `index` (pointing at the first `<`). Returns the heredoc and the index of its last character. A here-string
    (`<<<`) has no delimiter word, so it is refused here too. */
function readHeredoc(command:string,index:number):{heredoc:Heredoc;end:number}{
  let at=index+2;let stripTabs=false;
  if(command[at]==='-'){stripTabs=true;at+=1;}
  while(command[at]===' '||command[at]==='\t')at+=1;
  const open=command[at];
  if(open==="'"||open==='"'){
    const close=command.indexOf(open,at+1);
    if(close<0)fail('SHELL_COMPOSITION_INVALID');
    const delimiter=command.slice(at+1,close);
    if(!delimiter||/[\r\n]/u.test(delimiter))fail('SHELL_COMPOSITION_INVALID');
    return{heredoc:{delimiter,stripTabs,quoted:true},end:close};
  }
  const word=/^[A-Za-z0-9_.-]+/u.exec(command.slice(at))?.[0];
  if(!word)fail('SHELL_COMPOSITION_UNSUPPORTED');
  return{heredoc:{delimiter:word,stripTabs,quoted:false},end:at+word.length-1};
}

/** Skips the bodies of the pending heredocs, starting right after the newline at `start`. Returns where parsing resumes. */
function skipHeredocBodies(command:string,start:number,pending:Heredoc[]):number{
  let at=start;
  for(const heredoc of pending){
    for(;;){
      if(at>=command.length)fail('SHELL_COMPOSITION_INVALID');
      const newline=command.indexOf('\n',at);
      const lineEnd=newline<0?command.length:newline;
      let line=command.slice(at,lineEnd).replace(/\r$/u,'');
      if(heredoc.stripTabs)line=line.replace(/^\t+/u,'');
      at=newline<0?command.length:newline+1;
      if(line===heredoc.delimiter)break;
      if(!heredoc.quoted&&(/`/u.test(line)||/\$\(/u.test(line)))fail('SHELL_COMPOSITION_UNSUPPORTED');
    }
  }
  return at;
}

export function segmentShellCommand(command:string):ShellCommandSegment[]{
  if(typeof command!=='string'||!command.trim()||command.includes('\0'))fail('SHELL_COMPOSITION_INVALID');
  const segments:ShellCommandSegment[]=[];
  let buffer='';
  let quote:'"'|"'"|null=null;
  let operatorBefore:ShellCommandSegment['operatorBefore']=null;
  let pending:Heredoc[]=[];
  const push=()=>{
    const value=buffer.trim();
    if(!value)fail('SHELL_COMPOSITION_INVALID');
    segments.push({command:value,operatorBefore});
    buffer='';
  };
  /* A descriptor number right before `>` belongs to the redirection (`2>`), only when it stands alone (`ls 2>…`, not `ls x2>…`). */
  const dropDescriptor=()=>{const match=/(^|\s)\d+$/u.exec(buffer);if(match)buffer=buffer.slice(0,buffer.length-match[0].length+match[1]!.length);};
  for(let index=0;index<command.length;index+=1){
    const current=command[index]!;
    const next=command[index+1];
    if(current==='\\'&&next!==undefined&&(quote!==null||/[&|;<>()`'"\\$]/u.test(next))){buffer+=current+next;index+=1;continue;}
    if(current==='^'&&quote===null&&next!==undefined){buffer+=current+next;index+=1;continue;}
    if(current==='"'||current==="'"){
      if(quote===current)quote=null;
      else if(quote===null)quote=current;
      buffer+=current;
      continue;
    }
    if(quote!=="'"&&(current==='`'||(current==='$'&&next==='(')))fail('SHELL_COMPOSITION_UNSUPPORTED');
    if(quote===null){
      if(current==='<'&&next==='<'){const read=readHeredoc(command,index);pending.push(read.heredoc);index=read.end;continue;}
      if(current==='>'||(current==='&'&&next==='>')){
        const ampersand=current==='&';
        let at=index+(ampersand?2:1);
        if(!ampersand)dropDescriptor();
        if(command[at]==='>')at+=1;
        const rest=command.slice(at);
        const descriptor=ampersand?null:DESCRIPTOR_TARGET.exec(rest);
        const nul=descriptor?null:NULL_TARGET.exec(rest);
        if(!descriptor&&!nul)fail('SHELL_COMPOSITION_UNSUPPORTED');
        index=at+(descriptor??nul)![0].length-1;
        buffer+=' ';
        continue;
      }
      if(/[<>()]/u.test(current))fail('SHELL_COMPOSITION_UNSUPPORTED');
      let operator:ShellCommandSegment['operatorBefore']|null=null;
      if((current==='&'||current==='|')&&next===current){operator=`${current}${next}` as '&&'|'||';index+=1;}
      else if(current==='&'||current==='|'||current===';')operator=current;
      else if(current==='\r'||current==='\n'){
        operator='newline';if(current==='\r'&&next==='\n')index+=1;
        if(pending.length){push();operatorBefore=operator;index=skipHeredocBodies(command,index+1,pending)-1;pending=[];if(index+1>=command.length)return segments;continue;}
        /* CLI 0.6.10 (stress test 0.6.9): a line with nothing on it is not a command. A blank line, a leading or trailing line break,
           or a break after `&&`/`|`/`;` (the shell reads on) used to be an empty segment, so `node x.mjs "…"` followed by a newline was
           refused as «unsupported shell composition» even in Full access. The operator before the next command is kept. */
        if(ONLY_BLANKS.test(buffer)){buffer='';continue;}
      }
      if(operator){push();operatorBefore=operator;continue;}
    }
    buffer+=current;
  }
  if(quote!==null||pending.length)fail('SHELL_COMPOSITION_INVALID');
  /* the command ends with a line break or a `;` after its last command: nothing is left to run (`a &&` still fails below) */
  if(ONLY_BLANKS.test(buffer)&&segments.length&&(operatorBefore==='newline'||operatorBefore===';'))return segments;
  push();
  return segments;
}
