import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

/*
 * Startup stage (01/10, registro 12): the CLI ships as one esbuild bundle, `dist/main.js`, so a module no longer sits at a
 * fixed depth under the package (`dist/update/npm.js` was two levels down; the bundle and its chunks are one). The package
 * folder is the nearest folder up whose package.json names talos-code — the npm package, the installer's `app/` (its
 * package.json is the CLI's) and `cli/` in a checkout — so the answer is the same from the sources, the bundle and a chunk.
 * A dependency's own package.json (ink, under node_modules) is skipped by its name.
 */
export const CLI_PACKAGE_NAME='talos-code';

export function findPackageRoot(moduleUrl:string,read:(file:string)=>string=file=>readFileSync(file,'utf8')):string|null{
  let current:string;
  try{current=dirname(fileURLToPath(moduleUrl));}catch{return null;}
  for(let depth=0;depth<32;depth++){
    try{if(JSON.parse(read(join(current,'package.json')))?.name===CLI_PACKAGE_NAME)return current;}catch{/* no package.json here, or not JSON */}
    const parent=dirname(current);
    if(parent===current)return null;
    current=parent;
  }
  return null;
}
