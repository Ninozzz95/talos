/*
 * FE-065 (owner 02/11/2026, versione B): i pezzi della scheda di un file, gli stessi nel messaggio e in «Modifica e rimanda».
 * D21 del Tester: nella modifica il file restava una pillola che la miniatura accanto stirava a cerchio; due disegni dello stesso
 * file si staccano, un disegno solo no.
 * ⛔ Niente `innerHTML`: il nome di un file viene da fuori.
 */
import { creaGlifoFormato, iconaSprite } from './libreria-scheda.js';
import { schedaDelFile } from './allegati.js';

function testo(doc, classe, valore) {
  const el = doc.createElement('span');
  el.className = classe;
  el.textContent = valore;
  return el;
}

/**
 * Il glifo e i due testi, da mettere nel contenitore della scheda.
 * Per una pagina aperta il globo del lettore, senza estensione; per un file il glifo della Libreria.
 * @param {Document} doc
 * @param {{ allegato: object, nome: string, tipo?: string, costo?: string }} dati `tipo` = ripiego quando non è un file; `costo` = i token
 * @returns {{ pezzi: HTMLElement[], rigaSotto: string }}
 */
export function pezziSchedaFile(doc, { allegato, nome, tipo = '', costo = '' }) {
  const scheda = allegato?.daBrowser ? null : schedaDelFile(allegato);
  const rigaSotto = [scheda?.tipo || tipo, scheda?.peso, costo].filter(Boolean).join(' · ');
  let glifo;
  if (scheda) {
    glifo = creaGlifoFormato(doc, { nome: allegato.nome || allegato.percorso, mediaType: allegato.mediaType || allegato.formato });
  } else {
    glifo = doc.createElement('span');
    glifo.setAttribute('aria-hidden', 'true');
    glifo.append(iconaSprite(doc, 'i-globe'));
  }
  glifo.classList.add('talos-scheda-file__glifo');
  const testi = doc.createElement('span');
  testi.className = 'talos-scheda-file__testi';
  testi.append(testo(doc, 'talos-allegati-chip__nome talos-scheda-file__nome', nome), testo(doc, 'talos-scheda-file__riga', rigaSotto));
  return { pezzi: [glifo, testi], rigaSotto };
}
