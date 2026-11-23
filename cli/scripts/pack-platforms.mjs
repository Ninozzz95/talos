/*
 * Installation, platform packages (owner 02/10: «Stesso nome, come Codex», «Solo i 2 Windows»; registro 12). The CLI uses
 * the Windows sandbox only on Windows (src/security/execution-backends.ts), yet `@microsoft/mxc-sdk` (programs for x64,
 * arm64, Linux and Mac: 65 MB) and the `node-pty` it needs (27 MB, 19.8 MB of `.pdb` debug files) were installed on every
 * machine. Here each Windows architecture gets its own package, published under the SAME name with the platform in the
 * version (`talos-code@<ver>-win32-x64`), which the main package lists as an optional dependency by alias — Codex's
 * layout (`npm:@openai/codex@<ver>-win32-x64`); esbuild, Biome and @vscode/ripgrep do the same with their own names.
 * npm installs only the package whose `os`/`cpu` match the machine; no install script (pnpm 10 and Yarn skip them).
 *
 * Inside, under vendor/node_modules (the layout of the document libraries, scripts/pack-documents.mjs, so Node's lookup
 * from the SDK finds its neighbours): the SDK with its JavaScript and the Windows programs of that architecture only
 * (`wxc-exec.exe` starts the others from its own folder, so all of them stay); node-pty with that architecture's
 * prebuilt files only, no `.pdb`, no install script (it would rebuild itself with node-gyp); semver, the SDK's other
 * dependency. Licenses travel with each. Programs are told apart by their format (PE), not by their names.
 */
import {copyFile,cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
export const CLI_ROOT=resolve(here,'..');
export const PACKAGE_NAME='talos-code';
export const PLATFORMS=Object.freeze({
  'win32-x64':Object.freeze({os:'win32',cpu:'x64'}),
  'win32-arm64':Object.freeze({os:'win32',cpu:'arm64'}),
});

/* The main package's optional dependencies, one alias per platform, at exactly its own version. */
export function platformDependencies(version){
  return Object.fromEntries(Object.keys(PLATFORMS).sort().map(platform=>[`${PACKAGE_NAME}-${platform}`,`npm:${PACKAGE_NAME}@${version}-${platform}`]));
}

async function packageDirOf(require,name){
  const entry=require.resolve(`${name}/package.json`);return dirname(entry);
}
async function isWindowsProgram(file){
  const handle=await readFile(file);return handle.length>=2&&handle[0]===0x4d&&handle[1]===0x5a;/* 'MZ' */
}
/* JavaScript and JSON only: no type declarations, no source maps */
const runtimeFile=source=>!/\.(d\.ts|d\.ts\.map|map)$/u.test(source);

export async function packPlatform({cliRoot=CLI_ROOT,platform,out,version}){
  const target=PLATFORMS[platform];
  if(!target)throw Object.assign(new Error(`PLATFORM_UNKNOWN:${platform}`),{code:'PLATFORM_UNKNOWN'});
  const require=createRequire(join(cliRoot,'package.json'));
  const dir=join(out,`${PACKAGE_NAME}-${platform}`);
  await rm(dir,{recursive:true,force:true});
  const modules=join(dir,'vendor','node_modules');

  /* the sandbox SDK: package.json, license, JavaScript, this architecture's Windows programs and their SBOM */
  const sdkDir=await packageDirOf(require,'@microsoft/mxc-sdk');
  const sdkOut=join(modules,'@microsoft','mxc-sdk');
  await mkdir(sdkOut,{recursive:true});
  for(const file of ['package.json','LICENSE.md'])await copyFile(join(sdkDir,file),join(sdkOut,file));
  await cp(join(sdkDir,'dist'),join(sdkOut,'dist'),{recursive:true,filter:runtimeFile});
  const binIn=join(sdkDir,'bin',target.cpu),binOut=join(sdkOut,'bin',target.cpu);
  await mkdir(binOut,{recursive:true});
  for(const entry of await readdir(binIn,{withFileTypes:true})){
    const source=join(binIn,entry.name);
    if(entry.isDirectory())await cp(source,join(binOut,entry.name),{recursive:true});
    else if(await isWindowsProgram(source))await copyFile(source,join(binOut,entry.name));
  }

  /* node-pty: what it loads at run time, this architecture's prebuilt files without the debug ones */
  const ptyDir=await packageDirOf(createRequire(join(sdkDir,'package.json')),'node-pty');
  const ptyOut=join(modules,'node-pty');
  await mkdir(ptyOut,{recursive:true});
  await copyFile(join(ptyDir,'LICENSE'),join(ptyOut,'LICENSE'));
  await cp(join(ptyDir,'lib'),join(ptyOut,'lib'),{recursive:true,filter:source=>runtimeFile(source)&&!/\.test\.js$/u.test(source)});
  await cp(join(ptyDir,'prebuilds',platform),join(ptyOut,'prebuilds',platform),{recursive:true,filter:source=>!/\.pdb$/u.test(source)});
  const ptyMeta=JSON.parse(await readFile(join(ptyDir,'package.json'),'utf8'));
  const {scripts:_ptyScripts,devDependencies:_ptyDev,...ptyKept}=ptyMeta;
  await writeFile(join(ptyOut,'package.json'),`${JSON.stringify(ptyKept,null,2)}\n`);

  /* semver, the SDK's other dependency */
  const semverDir=await packageDirOf(createRequire(join(sdkDir,'package.json')),'semver');
  await cp(semverDir,join(modules,'semver'),{recursive:true,filter:source=>!/[\\/](README\.md|bin)$/u.test(source)});

  /* this package: same name, the platform in the version, installed only where os and cpu match */
  const main=JSON.parse(await readFile(join(cliRoot,'package.json'),'utf8'));
  await copyFile(join(cliRoot,'LICENSE'),join(dir,'LICENSE'));
  const pkg={
    name:PACKAGE_NAME,version:`${version}-${platform}`,
    description:`TALOS CLI programs for ${platform}: the Windows sandbox (@microsoft/mxc-sdk, MIT) and node-pty (MIT). Installed by talos-code; not used on its own.`,
    license:main.license,...(main.repository?{repository:main.repository}:{}),
    os:[target.os],cpu:[target.cpu],
    files:['vendor/','LICENSE'],
  };
  await writeFile(join(dir,'package.json'),`${JSON.stringify(pkg,null,2)}\n`);
  return dir;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const out=resolve(process.argv[2]??join(CLI_ROOT,'platforms'));
  const {version}=JSON.parse(await readFile(join(CLI_ROOT,'package.json'),'utf8'));
  for(const platform of Object.keys(PLATFORMS))process.stdout.write(`${await packPlatform({platform,out,version})}\n`);
}
