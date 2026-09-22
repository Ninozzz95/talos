/** BC-49, contratto v1. Fonti e decisioni nel rapporto del 12/09/2026.
 * Checkpoint applicativi completi, mai frammenti di JSON del fornitore.
 * Il tetto riguarda gli argomenti, non promette una durata del ragionamento.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { percorsoGiornale, scriviRapporto } from '../research-store.mjs';

export const LIMITE_PARTE_RAPPORTO_BYTE = 4096;
const MASSIMO_PARTI = 512;
const code = new Map();
const impronta = testo => createHash('sha256').update(testo, 'utf8').digest('hex');
const ordinato = valore => Array.isArray(valore) ? valore.map(ordinato)
  : valore && typeof valore === 'object' ? Object.fromEntries(Object.keys(valore).sort().map(k => [k, ordinato(valore[k])])) : valore;
const serializza = valore => JSON.stringify(ordinato(valore));

function controlla(contenuto) {
  const { parte, testo, affermazioni, fonti } = contenuto;
  if (!parte || !Number.isSafeInteger(parte.indice) || parte.indice < 1 || parte.indice > MASSIMO_PARTI || typeof parte.ultima !== 'boolean') {
    return 'La parte richiede un indice intero da 1 a 512 e ultima vero o falso.';
  }
  if (typeof testo !== 'string' || !Array.isArray(affermazioni) || !Array.isArray(fonti)) return 'Ogni parte richiede testo e gli elenchi affermazioni e fonti, anche vuoti.';
  if (affermazioni.some(a => !a || typeof a !== 'object' || Array.isArray(a) || typeof a.testo !== 'string' || !a.testo.trim()
    || !((typeof a.fonte === 'string' && a.fonte.trim()) || Number.isSafeInteger(a.fonte)))) return 'Ogni affermazione richiede testo e fonte; usa il suo URL completo.';
  if (fonti.some(f => !f || typeof f.url !== 'string' || !/^https?:\/\//i.test(f.url.trim()))) return 'Ogni fonte richiede un URL HTTP(S) completo.';
  if (Buffer.byteLength(JSON.stringify(contenuto), 'utf8') > LIMITE_PARTE_RAPPORTO_BYTE) return `La parte supera ${LIMITE_PARTE_RAPPORTO_BYTE} byte: dividila prima di riprovare con lo stesso indice.`;
  return null;
}

/** Replay rigoroso delle parti; gli altri eventi restano proprietà del motore L9/BC-44. */
export function rileggiPartiRapporto(eventi) {
  const parti = [];
  let conclusione = null;
  for (const evento of eventi) {
    if (evento?.kind === 'deposit_part') {
      const contenuto = evento.contenuto;
      if (!contenuto || controlla(contenuto) || evento.versione !== 1 || evento.indice !== contenuto.parte.indice
        || evento.impronta !== impronta(serializza(contenuto))) throw new Error('Integrità delle parti non verificabile: impronta o contenuto del giornale non valido.');
      const precedente = parti[evento.indice - 1];
      if (precedente) {
        if (precedente.impronta !== evento.impronta) throw new Error('Integrità del giornale: due contenuti diversi per la stessa parte.');
        continue;
      }
      if (evento.indice !== parti.length + 1 || parti.at(-1)?.contenuto.parte.ultima || conclusione) throw new Error('Integrità del giornale: manca una parte oppure il deposito è già chiuso.');
      parti.push(evento);
    } else if (evento?.kind === 'deposit_finished') {
      if (!parti.at(-1)?.contenuto.parte.ultima || evento.ultimaImpronta !== parti.at(-1).impronta
        || !/^[a-f0-9]{64}$/.test(evento.impronta ?? '') || !evento.risultato?.ok) throw new Error('Integrità della chiusura del deposito non verificabile.');
      conclusione = evento;
    }
  }
  return { parti, conclusione, prossimaParte: parti.length + 1 };
}

function assembla(parti) {
  return {
    testo: parti.map(p => p.contenuto.testo).join(''),
    affermazioni: parti.flatMap(p => p.contenuto.affermazioni),
    fonti: parti.flatMap(p => p.contenuto.fonti),
  };
}

/** Un solo scrittore per ricerca nel processo che possiede la corsa; conferma dopo fsync. */
export async function depositaParteRapporto(argomenti, { leggiGiornaleFn, accodaEventoFn, leggiRapportoFn, valida, finalizza, clock }) {
  const { cartella, id, testo, affermazioni, fonti, parte, byteArgomenti } = argomenti;
  const contenuto = structuredClone({ testo, affermazioni, fonti, parte });
  const motivo = controlla(contenuto);
  if (motivo) return { ok: false, motivo };
  if (byteArgomenti !== undefined && (!Number.isSafeInteger(byteArgomenti) || byteArgomenti > LIMITE_PARTE_RAPPORTO_BYTE)) {
    return { ok: false, motivo: `Gli argomenti generati superano ${LIMITE_PARTE_RAPPORTO_BYTE} byte. Dividi testo e prove; riprova lo stesso indice.` };
  }
  const chiave = `${resolve(cartella)}\0${id}`;
  const precedente = code.get(chiave) ?? Promise.resolve();
  const corrente = precedente.catch(() => {}).then(async () => {
    const { eventi } = await leggiGiornaleFn({ cartella, id, rigoroso: true });
    const stato = rileggiPartiRapporto(eventi);
    const hash = impronta(serializza(contenuto));
    const registrata = stato.parti[parte.indice - 1];
    if (registrata && registrata.impronta !== hash) return { ok: false, motivo: `La parte ${parte.indice} è già registrata con un altro contenuto. Non riscriverla; prossima parte: ${stato.prossimaParte}.` };
    if (!registrata && (parte.indice !== stato.prossimaParte || stato.parti.at(-1)?.contenuto.parte.ultima)) {
      return { ok: false, motivo: `Ordine non valido: prossima parte ${stato.prossimaParte}. Una chiusura già registrata si ritenta identica.` };
    }
    const evento = registrata ?? {
      kind: 'deposit_part', versione: 1, at: clock().toISOString(), indice: parte.indice,
      impronta: hash, byte: byteArgomenti ?? Buffer.byteLength(JSON.stringify(contenuto), 'utf8'), contenuto,
    };
    const tutte = registrata ? stato.parti : [...stato.parti, evento];
    const unito = parte.ultima ? assembla(tutte) : null;
    if (unito) {
      const controllo = valida(unito);
      if (!controllo.ok) return controllo;
    }
    if (!registrata) await accodaEventoFn({ cartella, id, evento, separaRiga: true });
    if (!parte.ultima) return {
      ok: true, parziale: true, prossimaParte: tutte.length + 1,
      messaggio: `Parte ${parte.indice} registrata (${evento.byte} byte). Prossima parte: ${tutte.length + 1}. Attendi questa conferma prima di proseguire; il rapporto sarà pronto soltanto dopo l'ultima parte.`,
      contenutoRegistrato: `\n${JSON.stringify(evento)}\n`, percorsoRegistrato: percorsoGiornale(cartella, id),
    };
    if (stato.conclusione) {
      const documento = await leggiRapportoFn({ cartella, id });
      if (typeof documento !== 'string' || impronta(documento) !== stato.conclusione.impronta) throw new Error('Il rapporto concluso non coincide con l’impronta nel giornale: ripristinare il file prima di riprovare.');
      return { ...stato.conclusione.risultato, documento, giaScritto: true };
    }
    const composto = await finalizza(unito);
    if (!composto.ok) return composto;
    await scriviRapporto({ cartella, id, testo: composto.documento });
    const risultato = Object.fromEntries(['ok', 'affermazioni', 'fonti', 'senzaPassaggio', 'bilancio', 'giudice'].filter(k => composto[k] !== undefined).map(k => [k, composto[k]]));
    await accodaEventoFn({ cartella, id, separaRiga: true, evento: {
      kind: 'deposit_finished', versione: 1, at: clock().toISOString(), ultimaImpronta: hash,
      impronta: impronta(composto.documento), byte: Buffer.byteLength(composto.documento, 'utf8'), risultato,
    } });
    return { ...composto, giaScritto: true };
  });
  code.set(chiave, corrente);
  try { return await corrente; }
  finally { if (code.get(chiave) === corrente) code.delete(chiave); }
}

/** La parte statica resta identica fra i giri; il progresso compare solo alla ripresa. */
export function consegnaPartiRapporto(eventi = []) {
  const stato = rileggiPartiRapporto(eventi);
  const istruzioni = [
    'Deposita il rapporto progressivamente con research_deposit dopo ogni ramo del piano, una sezione per volta, senza aspettare la fine della ricerca.',
    'Aggiungi sempre parte:{indice:1,ultima:false}, poi aumenta indice di uno dopo ogni conferma. Questa istruzione sostituisce eventuali vecchie richieste di deposito unico.',
    `Ogni chiamata deve contenere al massimo ${LIMITE_PARTE_RAPPORTO_BYTE} byte UTF-8 di argomenti JSON complessivi; punta a 3000 byte, circa 400 parole fra prosa e prove. Una sola chiamata di deposito per risposta: attendi la conferma prima di generare la successiva.`,
    'testo contiene solo la sezione corrente, con gli a capo necessari: il server concatena i pezzi senza aggiungere separatori. Il primo pezzo porta il titolo; gli ultimi completano conclusioni e fonti.',
    'Distribuisci anche affermazioni e fonti tra le parti, senza ripetere quelle già inviate; usa URL esatti in fonte. Gli elenchi possono essere vuoti. Non accumulare tutte le prove in una chiamata finale enorme.',
    'Per chiudere usa ultima:true; se tutto è già registrato, invia testo:"", affermazioni:[], fonti:[] con il prossimo indice e ultima:true. Soltanto allora il server assembla, verifica e pubblica il rapporto.',
    'Il messaggio finale in chat è solo una breve conferma, mai il rapporto: questa regola sostituisce anche eventuali vecchie istruzioni di scriverlo come ultimo messaggio.',
    'Non rigenerare i pezzi confermati e non ricopiare l’intero rapporto. In caso di conferma persa, ripeti lo stesso indice con gli stessi contenuti. Scrivi rapporto e messaggi per la persona in italiano, senza nomi tecnici degli attrezzi.',
  ];
  if (stato.parti.length) {
    istruzioni.push(`Parti già registrate: ${stato.parti.length}. ${stato.parti.at(-1).contenuto.parte.ultima ? 'Non aggiungere altre parti.' : `Prossima parte: ${stato.prossimaParte}.`} I contenuti confermati sono nel giornale della ricerca; leggili solo se ti servono per proseguire, senza rispedirli.`);
    if (stato.parti.at(-1).contenuto.parte.ultima) {
      istruzioni.push('L’ultima parte è già registrata: completa o recupera la consegna ripetendo ESATTAMENTE questa chiamata, senza altra prosa:', JSON.stringify(stato.parti.at(-1).contenuto));
    }
  }
  return istruzioni.join('\n');
}
