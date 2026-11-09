/*
 * Bozza 3, revisione 1 (Mobile, 31/10/2026): `approvabileFuori` — si può dire sì senza aprire la carta. Chiuso di serie: vero SOLO se ciò che si mostra è tutto ciò che la carta
 *   chiede (il `dato` intero: nessun taglio ai 240 caratteri, nessun a capo che la riga appiattisce, niente oscurato) e la carta non porta nessun rischio che il nucleo forza
 *   anche con «sempre» (`SEGNI_DI_CARTA_FORZATA`: segreto, trifecta, fuori dal progetto, contenuto sospetto, root in WSL, computer di rete, file di controllo), non è una
 *   chiamata scritta come testo né una carta `semprePersona`, e non apre un indirizzo di rete.
 * FE-011 (03/11/2026): sta qui perché la leggono le Notifiche e l'evento della richiesta, una regola sola.
 * ⛔ Dice se il dato si legge tutto, NON che l'azione è innocua: un comando di shell passa anche se invia fuori o non si annulla (lettura del nucleo in
 *   `FORMA-BARRA-APPROVAZIONI-2026-11-03.md`). Chi approva in blocco lo tiene fuori da sé.
 * ⛔ Si calcola sull'oggetto vivo, prima di serializzare: `CARTA_SEMPRE` è un Symbol e nel JSON si perde.
 */
import { SEGNI_DI_CARTA_FORZATA } from './kernel/talosHarness.mjs';
import { oscuraFormeDiSegreto } from './forme-di-segreto.mjs';
import { LUNGHEZZA_DATO } from './notifiche-registro.mjs';

export const datoDellAzione = (azione) => {
  if (!azione || typeof azione !== 'object') return null;
  if (typeof azione.comando === 'string' && azione.comando) return { genere: 'comando', valore: azione.comando };
  if (typeof azione.percorso === 'string' && azione.percorso) return { genere: 'file', valore: azione.percorso };
  if (typeof azione.url === 'string' && azione.url) return { genere: 'indirizzo', valore: azione.url };
  /* computer use, 03/11: la carta che toglie un luogo ricordato dice QUALE. Mobile 03/11: solo il nome breve, mai un percorso intero (la
     notifica si vede anche sulla schermata bloccata): di un programma scritto come percorso resta l'ultima parte. Solo per questa carta:
     un'altra azione che un domani porti un `luogo` non prende un dato (e con lui la tendina) per caso. */
  const nome = azione.tipo === 'computer_use_places_remove' && typeof azione.luogo?.nome === 'string'
    ? azione.luogo.nome.split(/[\\/]/u).filter(Boolean).pop()?.trim() : '';
  if (nome) return { genere: 'luogo', valore: nome };
  return null;
};

export function approvabileFuori(azione, dato) {
  if (!azione || typeof azione !== 'object' || !dato || typeof dato.valore !== 'string' || !dato.valore) return false;
  if (azione.tipo === 'chiamata-dal-testo' || azione.semprePersona === true) return false;
  /* computer use, 03/11: togliere un luogo ricordato cambia i permessi futuri, quindi si conferma sempre sulla carta, mai dalla tendina */
  if (azione.tipo === 'computer_use_places_remove') return false;
  if (SEGNI_DI_CARTA_FORZATA.some((segno) => azione[segno] !== undefined && azione[segno] !== null && azione[segno] !== false)) return false;
  if (dato.genere === 'indirizzo' || (typeof azione.url === 'string' && azione.url)) return false;
  const v = dato.valore;
  // eslint-disable-next-line no-control-regex
  if (v.length > LUNGHEZZA_DATO || /[\u0000-\u001f\u007f]/u.test(v) || v !== v.trim() || /\s{2,}/u.test(v)) return false;
  return oscuraFormeDiSegreto(v) === v;
}
