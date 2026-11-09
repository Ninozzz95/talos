#!/usr/bin/env node
/*
 * What the runs of the engine bench add up to, across days and families. No model is loaded: it reads the `.jsonl` files `banco-motore-vero.mjs` wrote.
 * Owner 01/11/2026: nothing goes on by default without 5 families by 3 versions, three runs out of three; HIP on three families out of three.
 * A run that the card declared not valid (over 20% down, llama.cpp #26663) does not count, and it says so.
 *
 * Use: node scripts/banco-riepilogo.mjs <run.jsonl> [<run.jsonl> ...]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { esitiDelVerdetto, promozioneDiSerie, regolaHip, regolaHipFamiglie, famigliaEVersione } from './banco-regole.mjs';

export function riepiloga(corse) {
  const motore = [];
  const router = [];
  const hip = new Map();
  const scartate = [];
  for (const { nome, righe } of corse) {
    const scheda = righe.filter((r) => r.etichetta === 'controllo-scheda' && r.quando === 'fine').at(-1);
    if (righe.some((r) => r.etichetta === 'verdetto') && scheda?.corsaValida !== true) { scartate.push(nome); continue; }
    for (const v of righe.filter((r) => r.etichetta === 'verdetto')) {
      const esiti = esitiDelVerdetto(v);
      motore.push(...esiti.motore);
      router.push(...esiti.router);
    }
    for (const r of righe.filter((x) => x.etichetta === 'hip' && x.caso)) {
      const { famiglia } = famigliaEVersione(r.modello);
      if (!hip.has(famiglia)) hip.set(famiglia, []);
      hip.get(famiglia).push(r);
    }
  }
  return { scartate, promozione: promozioneDiSerie(motore), promozioneRouter: promozioneDiSerie(router), hip: regolaHipFamiglie([...hip.values()].map((r) => regolaHip(r))) };
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  const corse = process.argv.slice(2).map((f) => ({ nome: basename(f), righe: readFileSync(f, 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r)) }));
  if (!corse.length) { console.error('serve almeno un file di corsa'); process.exit(2); }
  console.log(JSON.stringify(riepiloga(corse), null, 2));
}
