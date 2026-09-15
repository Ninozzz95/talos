import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

export function creaRegistro(file, segreti = []) {
  mkdirSync(dirname(file), { recursive: true });
  const chiavi = segreti.filter(s => typeof s === 'string' && s.length >= 8).sort((a, b) => b.length - a.length);
  function scrivi(testo) {
    let pulito = String(testo);
    for (const segreto of chiavi) pulito = pulito.split(segreto).join('[omesso]');
    pulito = pulito.replace(/([?&]token=)[^\s&]*/gi, '$1[omesso]');
    try {
      if (statSync(file, { throwIfNoEntry: false })?.size > 2_000_000) renameSync(file, `${file}.precedente`);
      appendFileSync(file, `${new Date().toISOString()} ${pulito.trimEnd()}\n`);
    } catch { /* Il guasto al registro non deve lasciare vivo il figlio. */ }
  }
  function canale() {
    const decoder = new StringDecoder('utf8'); let resto = ''; let scarta = false;
    return {
      scrivi(chunk) {
        const parti = (resto + decoder.write(Buffer.from(chunk))).split('\n');
        resto = parti.pop();
        for (const linea of parti) { if (!scarta) scrivi(linea); scarta = false; }
        if (resto.length > 65536) { resto = ''; scarta = true; }
      },
      fine() { resto += decoder.end(); if (resto && !scarta) scrivi(resto); resto = ''; },
    };
  }
  return { scrivi, canale };
}
