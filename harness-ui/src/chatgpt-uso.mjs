/**
 * Il conteggio NOSTRO di ciò che TALOS consuma col piano ChatGPT (decisione owner 11/10/2026: «Link + conteggio nostro, barra con
 * Codex dopo»).
 *
 * ⛔ Che cosa È e che cosa NON è. Sulla strada documentata per le app open source il servizio non comunica né quanto resta né quando
 *   il limite si azzera (prova dal vivo dell'11/10 e ricerca sui partner: OpenCode `chatgpt.ts` `1aae67e85`, Pi `retry.ts` `8b5708dbb`
 *   — nessuno li legge), e la documentazione dice di non dedurre un'ora di reset. Quindi qui si conta SOLO ciò che questo TALOS ha
 *   mandato col piano: richieste e token. Non è il contatore di OpenAI: chi usa il piano anche da ChatGPT o da un altro programma
 *   consuma senza che TALOS lo veda, e l'interfaccia lo deve dire con queste parole.
 * ⛔ Le due finestre sono quelle con cui Codex ragiona per il piano (`codex-rs/codex-api/src/rate_limits.rs:23-170`, letto il 24/09:
 *   primaria 5 ore, secondaria settimanale). Qui sono finestre MOBILI («nelle ultime 5 ore»), perché l'inizio vero della finestra
 *   del servizio non si conosce.
 * ⛔ Una riga per richiesta COMPLETATA: quando e quanti token, nient'altro — mai il testo, il modello o l'account. Una richiesta
 *   completata senza misura conta come richiesta e si dichiara «senza misura»: mai zero token inventati. Fermate ed errori non contano.
 * La scrittura è atomica (file temporaneo + rinomina) e in coda: due richieste che finiscono insieme non si pestano.
 */
import { readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const ORA_MS = 60 * 60 * 1000;
export const FINESTRE_USO_CHATGPT = Object.freeze({ cinqueOre: 5 * ORA_MS, setteGiorni: 7 * 24 * ORA_MS });
const VOCI_MASSIME = 20_000;

const intero = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
/** I token di una risposta: il totale se c'è, sennò entrata + uscita, nelle due forme (Chat Completions e Responses). `null` = non misurato. */
function tokenDi(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const totale = intero(usage.total_tokens);
  if (totale !== null) return totale;
  const entrata = intero(usage.prompt_tokens) ?? intero(usage.input_tokens);
  const uscita = intero(usage.completion_tokens) ?? intero(usage.output_tokens);
  return entrata === null && uscita === null ? null : (entrata ?? 0) + (uscita ?? 0);
}
const voceValida = (v) => v !== null && typeof v === 'object' && Number.isFinite(v.quando) && (v.token === null || (Number.isFinite(v.token) && v.token >= 0));

export function creaRegistroUsoChatgpt({ file = null, ora = Date.now } = {}) {
  let voci = [];
  if (file) {
    try {
      const letto = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(letto?.voci)) voci = letto.voci.filter(voceValida).map((v) => ({ quando: v.quando, token: v.token }));
    } catch { /* assente o rotto: si riparte da vuoto, senza fermare niente */ }
  }
  const pota = () => { const soglia = ora() - FINESTRE_USO_CHATGPT.setteGiorni; voci = voci.filter((v) => v.quando >= soglia).slice(-VOCI_MASSIME); };
  let coda = Promise.resolve();
  const scrivi = () => {
    if (!file) return Promise.resolve();
    coda = coda.then(async () => {
      const temporaneo = `${file}.${process.pid}.tmp`;
      try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(temporaneo, JSON.stringify({ schema: 'talos.chatgpt-uso.v1', voci }), 'utf8');
        await rename(temporaneo, file);
      } catch { await rm(temporaneo, { force: true }).catch(() => {}); /* il conteggio resta in memoria: una scrittura mancata non ferma un giro */ }
    });
    return coda;
  };
  const somma = (finestra) => {
    const soglia = ora() - finestra;
    const dentro = voci.filter((v) => v.quando >= soglia);
    return { richieste: dentro.length, token: dentro.reduce((t, v) => t + (v.token ?? 0), 0), senzaMisura: dentro.filter((v) => v.token === null).length };
  };
  return Object.freeze({
    /** Una richiesta finita col piano. Conta solo `esito: 'completato'`. */
    async registra({ esito, usage } = {}) {
      if (esito !== 'completato') return;
      voci.push({ quando: ora(), token: tokenDi(usage) });
      pota();
      await scrivi();
    },
    riepilogo() { return { cinqueOre: somma(FINESTRE_USO_CHATGPT.cinqueOre), setteGiorni: somma(FINESTRE_USO_CHATGPT.setteGiorni) }; },
    /** Allo scollegamento: il conteggio era di quell'account. */
    async azzera() { voci = []; await scrivi(); },
  });
}

/**
 * Lo stesso accesso, con l'uscita che azzera il conteggio (era di quell'account). Lo usano sia le rotte sia l'attrezzo della chat
 * (`chatgpt_account`, action disconnect): un solo posto, così nessuna delle due porte lo dimentica. Senza accesso resta `null`.
 */
export function accessoConUso(accesso, uso) {
  if (!accesso) return null;
  return Object.freeze({ ...accesso, async esci(...argomenti) { const esito = await accesso.esci(...argomenti); await uso?.azzera?.(); return esito; } });
}
