import {access,copyFile,mkdir,rename,rm} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url));

async function finalizeInstallerArtifact(emitted,output){
  try{await access(emitted);}catch(error){throw Object.assign(new Error(`NSIS_OUTPUT_MISSING:${emitted}`),{cause:error});}
  if(emitted===output)return output;
  await rm(output,{force:true});
  try{await rename(emitted,output);}
  catch(error){
    if(error?.code!=='EXDEV')throw error;
    await copyFile(emitted,output);
    await rm(emitted,{force:true});
  }
  return output;
}

export async function buildInstaller({stageDir,outDir,version='1.0.0',makensis='makensis'}={}){
  if(!stageDir||!outDir)throw new Error('INSTALLER_ARGS_REQUIRED');
  const resolvedOut=resolve(outDir);
  await mkdir(resolvedOut,{recursive:true});
  const script=resolve(here,'../packaging/windows/talos-cli.nsi');
  const fileName=`TALOS-CLI-Setup-${version}.exe`;
  const emitted=resolve(dirname(script),fileName);
  const output=resolve(resolvedOut,fileName);
  await rm(emitted,{force:true});
  if(output!==emitted)await rm(output,{force:true});
  const args=[`/DVERSION=${version}`,`/DSTAGE_DIR=${resolve(stageDir)}`,script];
  return new Promise((ok,fail)=>{
    const child=spawn(makensis,args,{stdio:'inherit',windowsHide:true});
    child.once('error',error=>fail(Object.assign(new Error(`NSIS_START_FAILED:${error.message}`),{cause:error})));
    child.once('exit',code=>{
      if(code!==0){fail(new Error(`NSIS_FAILED:${code}`));return;}
      finalizeInstallerArtifact(emitted,output).then(ok,fail);
    });
  });
}

function parse(argv){
  const out={};
  for(let i=0;i<argv.length;i+=2){
    const k=argv[i],v=argv[i+1];
    if(!k?.startsWith('--')||v===undefined)throw new Error('INSTALLER_ARGS_INVALID');
    out[k.slice(2)]=v;
  }
  return out;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const a=parse(process.argv.slice(2));
  buildInstaller({stageDir:a.stage,outDir:a.out,version:a.version??'1.0.0',makensis:a.makensis??'makensis'})
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
