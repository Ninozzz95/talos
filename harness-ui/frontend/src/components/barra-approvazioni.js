/*
 * FE-011 (disegno chiuso con FE-008, «Consenti tutte (N)» dell'owner del 31/10 sera, forma `FORMA-BARRA-APPROVAZIONI-2026-11-03.md`, strada 1): da due richieste in su, sopra il
 * compositore, la lista delle richieste coi dati interi e un pulsante che è una somma di «una volta», mai un sì largo.
 *  - Il pulsante conta solo le richieste che il server marca `approvabileFuori`, tolti i comandi di shell: il campo dice che il dato si legge tutto, non che l'azione è innocua, e
 *    la tabella del 31/10 tiene fuori chi invia fuori e l'irreversibile. Le altre hanno «Vedi», che porta alla loro carta.
 *  - Il sì passa dalla carta, una alla volta: stessa rotta, stesso esito, `ApprovalResolved` resta l'unico che la chiude. Le carte non si nascondono.
 *  - In Accesso pieno non si chiede niente, quindi la barra non c'è.
 */
import { t } from './lingua.js';

/** Il dato di una richiesta, intero: è ciò che la persona legge prima di premere. */
export function datoDellaVoce(azione) {
  return azione?.comando || azione?.percorso || '';
}

/**
 * Che cosa dice la barra, senza il DOM.
 * @param {{ requestId: string, azione: object, approvabileFuori?: boolean, consenti?: Function|null, chi?: string|null }[]} carte le richieste in attesa, in ordine di arrivo
 * @param {{ accessoPieno?: boolean, perAttrezzo?: Record<string, string> }} [contesto] `perAttrezzo`: un «nega» messo dopo la nascita della carta vince
 */
export function vociDellaBarra(carte, { accessoPieno = false, perAttrezzo = {} } = {}) {
  const voci = carte.map((c) => ({ ...c, approvabile: c.approvabileFuori === true && typeof c.consenti === 'function' && c.azione?.tipo !== 'shell' && perAttrezzo?.[c.azione?.tipo] !== 'nega' }));
  return { visibile: !accessoPieno && voci.length >= 2, voci, n: voci.filter((v) => v.approvabile).length };
}

/**
 * La somma di «una volta». Al primo invio che non parte ci si ferma: il resto lo decide la persona. Una carta già risolta altrove si salta; un nega arrivato a metà ferma lei
 * senza contarla come errore.
 * @param {object[]} voci
 * @param {{ aperta?: (requestId: string) => boolean, vietata?: (voce: object) => boolean }} [o]
 * @returns {Promise<{ fatte: number, resta: number, errore: boolean }>}
 */
export async function consentiTutte(voci, { aperta = () => true, vietata = () => false } = {}) {
  const coda = voci.filter((v) => v.approvabile);
  let fatte = 0;
  let resta = 0;
  let errore = false;
  for (const v of coda) {
    if (!aperta(v.requestId)) continue;
    if (errore || vietata(v)) { resta += 1; continue; }
    // eslint-disable-next-line no-await-in-loop -- una alla volta, in ordine di arrivo: è una somma di «una volta»
    if (await v.consenti()) fatte += 1;
    else { errore = true; resta += 1; }
  }
  return { fatte, resta, errore };
}

/** @param {{ document: Document, nomeAzione: (azione: object) => string, alVedi: (requestId: string) => void, alConsenti: (voci: object[]) => void }} o */
export function creaBarraApprovazioni({ document: doc, nomeAzione, alVedi, alConsenti }) {
  const nodo = doc.createElement('div');
  nodo.className = 'talos-approvazioni';
  nodo.setAttribute('role', 'group');
  nodo.setAttribute('aria-label', t('chat.approval.bar.label'));
  nodo.hidden = true;
  let inCorso = false;

  function aggiorna({ visibile, voci, n }) {
    nodo.hidden = !visibile;
    inCorso = false;
    if (!visibile) { nodo.replaceChildren(); return; }
    const testa = doc.createElement('div');
    testa.className = 'talos-queue';
    const frase = doc.createElement('span');
    frase.className = 'talos-queue__text';
    frase.textContent = t('chat.approval.bar.pending', { n: voci.length });
    testa.append(frase);
    const lista = doc.createElement('ul');
    lista.className = 'talos-approvazioni__lista';
    for (const v of voci) {
      const riga = doc.createElement('li');
      const testo = doc.createElement('span');
      testo.className = 'talos-approvazioni__chi';
      testo.textContent = [v.chi, nomeAzione(v.azione)].filter(Boolean).join(' · ');
      riga.append(testo);
      const dato = datoDellaVoce(v.azione);
      if (dato) {
        const codice = doc.createElement('code');
        codice.textContent = dato;
        riga.append(codice);
      }
      if (!v.approvabile) {
        const vedi = doc.createElement('button');
        vedi.type = 'button';
        vedi.className = 'talos-button talos-button--ghost talos-button--sm';
        vedi.textContent = t('chat.approval.bar.see');
        vedi.addEventListener('click', () => alVedi(v.requestId));
        riga.append(vedi);
      }
      lista.append(riga);
    }
    if (n > 0) {
      const tutte = doc.createElement('button');
      tutte.type = 'button';
      tutte.className = 'talos-button talos-button--primary talos-button--sm';
      tutte.textContent = t('chat.approval.bar.allowAll', { n });
      tutte.addEventListener('click', () => {
        if (inCorso) return;
        inCorso = true;
        tutte.disabled = true;
        alConsenti(voci.filter((v) => v.approvabile));
      });
      testa.append(tutte);
    }
    nodo.replaceChildren(testa, lista);
  }
  return { nodo, aggiorna };
}
