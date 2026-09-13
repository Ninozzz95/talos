import fs from 'node:fs/promises';
import {analyseTrace} from '../lib/trace.mjs';
try {
  const [input,out,...extra]=process.argv.slice(2);
  if (!input || !out || extra.length) throw new Error('Usage: node tools/analyse-trace.mjs INPUT.json OUTPUT.json');
  const st=await fs.stat(input); if(st.size>32*1024*1024) throw new Error('Trace exceeds 32 MiB; split by run/clock');
  const result=analyseTrace(JSON.parse(await fs.readFile(input,'utf8')));
  await fs.writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({scope:result.metadata.scope,status:result.status}));
} catch(e) {console.error(e.message);process.exitCode=1;}
