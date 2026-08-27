/**
 * custom-task.mjs — un compito LIBERO su una cartella dell'allowlist
 * (`TALOS_HARNESS_UI_PROJECT_DIRS`, vedi `config.mjs`), non uno dei task
 * fissi del corpus benchmark. Owner, 27/8: "per adesso un allowlist per
 * testare... come se fosse Claude Code o Pi agent o Hermes o DeepSeek".
 *
 * ⛔⛔ Diverso da `task-catalog.mjs` apposta: quello fa SEMPRE una copia
 * usa-e-getta (`preparaCopia`), perché il suo scopo è misurare un harness
 * senza mai toccare l'originale del corpus. Qui l'obiettivo dichiarato è
 * l'opposto — vedere l'effetto REALE su un progetto vero, esattamente
 * come un coding agent di produzione — quindi si lavora DIRETTAMENTE
 * sulla cartella scelta. Il confine di sicurezza non è "una copia": è
 * l'allowlist stessa, verificata all'AVVIO del server (vedi config.mjs),
 * mai un percorso a piacere accettato a runtime.
 */

export class CustomTaskError extends Error {
  constructor(message, code = 'PROJECT_NOT_ALLOWED') {
    super(message);
    this.name = 'CustomTaskError';
    this.code = code;
  }
}

const COMANDO_PROVA_DEFAULT = 'npm test';
const CONSEGNA_MASSIMA_BYTE = 8192;

/** Proiezione leggera per il menu — mai il percorso assoluto verso il browser: solo id e nome, stesso principio di `listaTaskDisponibili`. */
export function elencaCartelleProgetto(cartelleProgetto) {
  return cartelleProgetto.map(({ id, nome }) => ({ id, nome }));
}

/**
 * @returns {{cartella:string, comandoProva:string, task:object}} — mai un
 * `pulisci()`: non c'è una copia usa-e-getta da buttare, la cartella È
 * il progetto vero.
 */
export function preparaEsecuzioneLibera(cartelleProgetto, { cartellaId, consegna, comandoProva }) {
  if (typeof cartellaId !== 'string' || cartellaId.length === 0) {
    throw new CustomTaskError('cartellaId mancante', 'QUERY_INVALID');
  }
  const voce = cartelleProgetto.find((candidata) => candidata.id === cartellaId);
  if (!voce) throw new CustomTaskError(`Cartella non ammessa: ${cartellaId}`);

  if (typeof consegna !== 'string' || consegna.trim().length === 0) {
    throw new CustomTaskError('consegna mancante', 'QUERY_INVALID');
  }
  if (Buffer.byteLength(consegna, 'utf8') > CONSEGNA_MASSIMA_BYTE) {
    throw new CustomTaskError(`consegna oltre ${CONSEGNA_MASSIMA_BYTE} byte`, 'QUERY_INVALID');
  }

  let comando = COMANDO_PROVA_DEFAULT;
  if (comandoProva !== undefined && comandoProva !== null) {
    if (typeof comandoProva !== 'string' || comandoProva.trim().length === 0) {
      throw new CustomTaskError('comandoProva non valido', 'QUERY_INVALID');
    }
    comando = comandoProva;
  }

  return {
    cartella: voce.percorso,
    comandoProva: comando,
    task: { consegna, consegnaCorta: consegna.length > 80 ? `${consegna.slice(0, 77)}...` : consegna, progetto: voce.nome },
  };
}
