/**
 * D4: la domanda che la persona ha corretto sulla carta della ricerca. L'evento non porta campi nuovi (forma con Mobile e CLI): la dice l'esito
 * dell'attrezzo, e solo in testa (revisione del blocco, R14: una riga uguale DENTRO la domanda del modello non vale). Il registro la porta già su una
 * riga sola (R13). Il prefisso è `PREFISSO_DOMANDA_CORRETTA` del nucleo.
 * @returns {string|null}
 */
export function domandaCorrettaDallEsito(testo) {
  return /^The person edited the question on the card; this is what runs: ([^\n]+)\n/u.exec(String(testo ?? ''))?.[1] ?? null;
}
