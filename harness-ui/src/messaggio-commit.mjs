/**
 * messaggio-commit.mjs — F6-1 ✨ «Genera messaggio» (26/09/2026), la parte PURA: che cosa si manda al modello e come si
 * legge quello che torna. Decisioni dell'owner su F6 (memoria `decisioni-owner-f6-github-26-09`, punti 4 e 9): solo su clic,
 * col modello e il fornitore della SESSIONE, diff preparato (o dei file se niente è preparato) tagliato a 20.000 byte.
 *
 * Letto nel codice di Zed (`TALOS-RICERCHE/concorrenti/zed-2026-09-23/crates/git_ui/src`), non a memoria:
 *   · `commit_message_prompt.txt` — soggetto breve all'imperativo, corpo solo se aggiunge qualcosa, nessun commento, niente
 *     diff nel messaggio;
 *   · `git_panel.rs:3929-3953` (`compress_commit_diff`) — righe oltre 256 caratteri accorciate, poi il tutto entro il tetto;
 *   · `git_panel.rs:4128-4141` — il soggetto che la persona ha già scritto entra nella richiesta.
 * ⭐ Una cosa in più di Zed, e misurabile: gli ULTIMI SOGGETTI del repository, perché il messaggio segua la lingua e lo stile
 *   che il progetto usa già (questo repository scrive i commit in inglese, per regola dell'owner) invece di quelli del modello.
 */

export const TETTO_DIFF_MESSAGGIO = 20_000;
export const RIGA_MASSIMA = 256;

/** Il diff dentro il tetto, come Zed: prima si accorciano le righe lunghissime, poi si taglia — e si dice che si è tagliato. */
export function comprimiDiffPerMessaggio(testo, tetto = TETTO_DIFF_MESSAGGIO) {
  const intero = String(testo ?? '');
  if (Buffer.byteLength(intero, 'utf8') <= tetto) return { testo: intero, troncato: false };
  const righe = intero.split('\n').map((r) => (r.length > RIGA_MASSIMA ? `${r.slice(0, RIGA_MASSIMA)}…[riga accorciata]` : r));
  const accorciato = righe.join('\n');
  if (Buffer.byteLength(accorciato, 'utf8') <= tetto) return { testo: accorciato, troncato: true };
  const nota = '\n[… remaining diff was truncated to stay within limit]';
  const spazio = tetto - Buffer.byteLength(nota, 'utf8');
  const tenute = [];
  let usati = 0;
  for (const r of righe) {
    const costo = Buffer.byteLength(r, 'utf8') + 1;
    if (usati + costo > spazio) break;
    tenute.push(r);
    usati += costo;
  }
  return { testo: `${tenute.join('\n')}${nota}`, troncato: true };
}

/**
 * La richiesta al modello. In inglese come quella di Zed: è un'istruzione al modello, non un testo per la persona, e la
 * lingua del MESSAGGIO la decidono i soggetti recenti (o, se non ce ne sono, la lingua dell'interfaccia).
 */
export function promptMessaggioCommit({ diff, soggetti = [], bozza = '', lingua = 'it', troncato = false } = {}) {
  const nomeLingua = lingua === 'en' ? 'English' : 'Italian';
  const parti = [
    'You are an expert at writing Git commits. Write a short, clear commit message that summarizes the changes in the diff below.',
    '',
    'If you can accurately express the change in just the subject line, do not include a body. Only use the body when it adds useful information, and do not repeat the subject in it.',
    '',
    'Only return the commit message. No meta-commentary, no code fences, no quotes, and never the raw diff.',
    '',
    'Follow good Git style: separate the subject from the body with a blank line; keep the subject under about 50 characters; capitalize it; no final punctuation; imperative mood; wrap the body at 72 characters; keep the body short.',
    '',
  ];
  const recenti = soggetti.map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
  if (recenti.length) {
    parti.push('Match the language and the style (for example a "type(scope): subject" prefix) of these recent commit subjects of this repository:');
    for (const s of recenti) parti.push(`- ${s}`);
  } else {
    parti.push(`There are no previous commits to follow: write the message in ${nomeLingua}.`);
  }
  parti.push('');
  const primaRiga = String(bozza ?? '').split('\n')[0].trim();
  if (primaRiga) {
    parti.push(`The author already wrote this subject line; keep its meaning (you may fix only its form): ${primaRiga}`, '');
  }
  if (troncato) parti.push('The diff was shortened to fit: describe what you can see, and do not invent what was cut.', '');
  parti.push('Diff:', '```diff', String(diff ?? ''), '```');
  return parti.join('\n');
}

/** Quello che torna dal modello, ripulito: via i recinti di codice e le virgolette intorno, spazi in fondo, righe vuote in fila. */
export function pulisciMessaggioGenerato(testo) {
  let t = String(testo ?? '').replace(/\r\n/gu, '\n').trim();
  const recinto = /^```[a-z]*\n([\s\S]*?)\n```$/u.exec(t);
  if (recinto) t = recinto[1].trim();
  if (/^(["'«“]).*(["'»”])$/su.test(t) && !t.includes('\n')) t = t.slice(1, -1).trim();
  return t.split('\n').map((r) => r.replace(/\s+$/u, '')).join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}
