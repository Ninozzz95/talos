export type ShellCommandSegment={command:string;operatorBefore:null|'&&'|'||'|'|'|'&'|';'|'newline'};

function fail(code:'SHELL_COMPOSITION_INVALID'|'SHELL_COMPOSITION_UNSUPPORTED'):never{
  throw Object.assign(new Error(code),{code});
}

export function segmentShellCommand(command:string):ShellCommandSegment[]{
  if(typeof command!=='string'||!command.trim()||command.includes('\0'))fail('SHELL_COMPOSITION_INVALID');
  const segments:ShellCommandSegment[]=[];
  let buffer='';
  let quote:'"'|"'"|null=null;
  let operatorBefore:ShellCommandSegment['operatorBefore']=null;
  const push=()=>{
    const value=buffer.trim();
    if(!value)fail('SHELL_COMPOSITION_INVALID');
    segments.push({command:value,operatorBefore});
    buffer='';
  };
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
      if(/[<>()]/u.test(current))fail('SHELL_COMPOSITION_UNSUPPORTED');
      let operator:ShellCommandSegment['operatorBefore']|null=null;
      if((current==='&'||current==='|')&&next===current){operator=`${current}${next}` as '&&'|'||';index+=1;}
      else if(current==='&'||current==='|'||current===';')operator=current;
      else if(current==='\r'||current==='\n'){operator='newline';if(current==='\r'&&next==='\n')index+=1;}
      if(operator){push();operatorBefore=operator;continue;}
    }
    buffer+=current;
  }
  if(quote!==null)fail('SHELL_COMPOSITION_INVALID');
  push();
  return segments;
}
