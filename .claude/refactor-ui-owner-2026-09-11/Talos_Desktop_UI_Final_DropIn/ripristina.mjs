#!/usr/bin/env node
/** Ripristino del backup creato da applica.mjs. */
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2);const val=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null};
const root=path.resolve(val('--root')||process.cwd());
let backup=val('--backup');
if(!backup){const p=path.join(root,'.talos','ui-backups','ULTIMO.txt');if(!existsSync(p))throw new Error('Nessun backup registrato. Usa --backup <cartella>.');backup=readFileSync(p,'utf8').trim();}
backup=path.resolve(backup);const manifestPath=path.join(backup,'manifest.json');if(!existsSync(manifestPath))throw new Error(`Manifest non trovato: ${manifestPath}`);
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
for(const entry of [...manifest.files].reverse()){
 const target=path.join(root,entry.rel);const saved=path.join(backup,'files',entry.rel);
 if(entry.existed){if(!existsSync(saved))throw new Error(`Backup mancante: ${entry.rel}`);cpSync(saved,target);}
 else rmSync(target,{force:true,recursive:false});
}
console.log(`Ripristino completato da ${backup}`);
