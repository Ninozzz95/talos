// L3-1: un PROCESSO vero che prende il lucchetto del rinnovo, «lavora» e annota inizio e fine. Uso: node <questo> <lucchetto> <diario> <nome> <ms>
import { appendFileSync } from 'node:fs';
import { creaLucchettoRinnovoChatgpt } from '../../src/chatgpt-lucchetto-rinnovo.mjs';

const [file, diario, nome, ms] = process.argv.slice(2);
await creaLucchettoRinnovoChatgpt({ file, riprovaMs: 5 })(async () => {
  appendFileSync(diario, `${nome} inizio\n`);
  await new Promise((r) => setTimeout(r, Number(ms)));
  appendFileSync(diario, `${nome} fine\n`);
});
