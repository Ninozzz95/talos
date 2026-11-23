// Another TALOS process holding a conversation: the kernel's own lease (session-lease.mjs), taken and kept alive here.
// Usage: node hold-session-lease.mjs <repoRoot> <sessionsRoot> <sessionId>. Prints «held <pid>» once the lease is ours.
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [repoRoot,sessionsRoot,sessionId]=process.argv.slice(2);
const {creaAffittiArchivio}=await import(pathToFileURL(join(repoRoot,'harness-ui','src','session-lease.mjs')).href);
const leases=creaAffittiArchivio({cartellaStore:sessionsRoot,percorsoGiornale:(id)=>join(sessionsRoot,`${id}.jsonl`),etichetta:'TALOS CLI (the screen)'});
leases.aggiungiInUso?.(()=>true);
const taken=leases.prendi(sessionId);
if(!taken?.preso){process.stdout.write('refused\n');process.exit(3);}
process.stdout.write(`held ${process.pid}\n`);
setInterval(()=>{},1_000);
