import {cp,mkdir,rm,writeFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';

async function copyIfExists(from,to){try{await cp(from,to,{recursive:true});return true;}catch(error){if(error?.code==='ENOENT')return false;throw error;}}
export async function buildOneClickDirectory({repoRoot,outDir}){
 const root=resolve(repoRoot);const out=resolve(outDir);
 await rm(out,{recursive:true,force:true});await mkdir(join(out,'app'),{recursive:true});
 await cp(join(root,'cli','dist'),join(out,'app','dist'),{recursive:true});
 const pkg={name:'talos-cli-one-click-runtime',version:'1.0.0',private:true,type:'module',engines:{node:'>=24.18.0 <25'},dependencies:{ink:'7.1.1',react:'19.3.0'}};
 await writeFile(join(out,'app','package.json'),JSON.stringify(pkg,null,2)+'\n','utf8');
 const launcher=join(root,'cli','packaging','one-click');for(const name of ['START-TALOS-CLI.cmd','talos.cmd','bootstrap.ps1','README-START-HERE.txt'])await cp(join(launcher,name),join(out,name));
 const docs=join(root,'docs','review');try{const names=await readdir(docs);await mkdir(join(out,'docs'),{recursive:true});for(const name of names)if(/\.(?:md|txt)$/iu.test(name))await cp(join(docs,name),join(out,'docs',name));}catch(error){if(error?.code!=='ENOENT')throw error;}
 await copyIfExists(join(root,'cli','README.md'),join(out,'docs','CLI-README.md'));
 return out;
}

if(import.meta.url===new URL(process.argv[1]??'', 'file:').href){
 const repoRoot=resolve(process.argv[2]??new URL('../..',import.meta.url).pathname);const outDir=resolve(process.argv[3]??join(repoRoot,'dist','one-click'));
 await buildOneClickDirectory({repoRoot,outDir});console.log(outDir);
}
