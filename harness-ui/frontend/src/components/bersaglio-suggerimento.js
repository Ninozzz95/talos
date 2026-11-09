/*
 * Il bersaglio di un suggerimento nel compositore (verifica della candidata 19, 29/10/2026): dopo «Invia come allegato» diceva
 * «Dimmi di più su C:\Users\…\incollati\…txt», un percorso interno a schermo. Un percorso assoluto diventa il nome del file;
 * un percorso del progetto (`src/app.js`) resta, perché dice qualcosa alla persona.
 */
const PERCORSO_ASSOLUTO = /^(?:[A-Za-z]:[\\/]|[\\/])/u;

/*
 * Revisione UX della candidata, 04/11/2026, riga 40 (foto 88): dopo una ricerca il campo proponeva «Approfondisci "segret"». Il bersaglio di
 * `cerca` è il pezzo di testo che il modello ha cercato (spesso una radice, `segret`), non un argomento da approfondire, e le virgolette
 * dritte le metteva il bersaglio. ⇒ Il testo cercato com'è (il testo prima del nome dei file), senza virgolette: le mette la frase,
 * tipografiche nella sua lingua («…» e “…”).
 * ⛔ Decisione owner 192 (04/11/2026, revisione del blocco UI R7): la radice restava a schermo («Cosa hai trovato cercando «segret»?»). Il
 *   suggerimento compare SOLO se il testo cercato è una parola intera (o più parole intere di fila) di ciò che la persona ha scritto;
 *   altrimenti niente, mai un pezzo di parola. Maiuscole e minuscole non contano; un bordo di parola è tutto ciò che non è lettera,
 *   segno combinante o cifra (Unicode: «é» dentro «perché» non è una parola). Senza il testo della persona non c'è confronto ⇒ niente.
 */
const LETTERA = /[\p{L}\p{M}\p{N}_]/u;

function eParolaInteraDi(cercato, scritto) {
  const ago = cercato.toLocaleLowerCase();
  const pagliaio = scritto.toLocaleLowerCase();
  if (ago === '' || ago.length !== cercato.length || pagliaio.length !== scritto.length) return false; // minuscole che cambiano lunghezza: niente indovinelli
  for (let da = pagliaio.indexOf(ago); da >= 0; da = pagliaio.indexOf(ago, da + 1)) {
    const prima = da > 0 ? pagliaio[da - 1] : '';
    const dopo = pagliaio[da + ago.length] ?? '';
    const bordoPrima = prima === '' || !LETTERA.test(prima) || !LETTERA.test(ago[0]);
    const bordoDopo = dopo === '' || !LETTERA.test(dopo) || !LETTERA.test(ago.at(-1));
    if (bordoPrima && bordoDopo) return true;
  }
  return false;
}

export function bersaglioDellaRicerca(argomenti, scrittoDallaPersona = '') {
  const a = argomenti && typeof argomenti === 'object' ? argomenti : {};
  const cercato = [a.testo, a.nome].map((v) => (typeof v === 'string' ? v.trim() : '')).find(Boolean) ?? '';
  const scritto = typeof scrittoDallaPersona === 'string' ? scrittoDallaPersona : '';
  return cercato && eParolaInteraDi(cercato, scritto) ? cercato : '';
}

export function bersaglioDelSuggerimento(bersaglio) {
  const testo = String(bersaglio ?? '').trim();
  if (!PERCORSO_ASSOLUTO.test(testo)) return testo;
  return testo.split(/[\\/]/u).filter(Boolean).pop() ?? testo;
}
