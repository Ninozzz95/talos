/** Fixture sintetiche nella forma esatta di session-registry.elencaLibreria; non record del disco. */
export const LIBRERIA=[
  {
    "id": "lib-decisioni",
    "nome": "DECISIONI-REDESIGN-TALOS-2026-09-04.md",
    "fileType": "document",
    "origine": "uploaded",
    "aggiornatoIl": "2026-09-04T17:00:00.000Z"
  },
  {
    "id": "lib-ledger",
    "nome": "LEDGER-ROADMAP-DESKTOP-2026-09-03.md",
    "fileType": "document",
    "origine": "generated",
    "aggiornatoIl": "2026-09-03T16:00:00.000Z"
  },
  {
    "id": "lib-eventi",
    "nome": "contratto-eventi.json",
    "fileType": "document",
    "origine": "generated",
    "aggiornatoIl": "2026-09-02T15:00:00.000Z"
  },
  {
    "id": "lib-schermata",
    "nome": "Schermata del contesto e dei documenti selezionati per la conversazione.png",
    "fileType": "image",
    "origine": "uploaded",
    "aggiornatoIl": "2026-09-04T14:00:00.000Z"
  }
];

/*
 * 11/09/2026 — i QUATTRO tipi del dettaglio: Markdown, CSV, PDF, DOCX.
 *
 * ⛔ Elenco SEPARATO da `LIBRERIA` di proposito: quella serve le foto già approvate della riga e
 *   della sezione, e cambiarle sotto ai cancelli farebbe fallire un confronto per una ragione che
 *   non c'entra con ciò che si sta provando.
 * ⛔ I contenuti sono TESTO FINTO ma di forma vera: il Markdown ha titoli, elenchi e un blocco di
 *   codice (è quello che il render della chat deve saper fare), il CSV ha trenta righe di dati più
 *   l'intestazione e una cella con la virgola dentro le virgolette — la cella che uno `split(',')`
 *   spezzerebbe. PDF e DOCX non hanno contenuto: non si legge, ed è il punto.
 */
export const LIBRERIA_ANTEPRIMA = [
  { id: 'lib-md', nome: 'File di prova – Markdown.md', fileType: 'document', origine: 'generated', aggiornatoIl: '2026-09-11T09:20:00.000Z' },
  { id: 'lib-csv', nome: 'Consumi per sessione.csv', fileType: 'document', origine: 'generated', aggiornatoIl: '2026-09-11T08:05:00.000Z' },
  { id: 'lib-pdf', nome: 'Relazione trimestrale.pdf', fileType: 'document', origine: 'generated', aggiornatoIl: '2026-09-10T17:40:00.000Z' },
  { id: 'lib-docx', nome: 'Verbale della riunione.docx', fileType: 'document', origine: 'uploaded', aggiornatoIl: '2026-09-09T11:15:00.000Z' },
];

const MD_DI_PROVA = `# Nota di rilascio 0.1.20

Questa nota accompagna la build di prova del laboratorio. Non descrive un rilascio vero e non
rimanda a nessun artefatto pubblicato.

## Che cosa cambia

- Il dettaglio della Libreria mostra il contenuto del file, non solo il suo nome.
- L'interruttore ricorda l'ultimo modo scelto.
- I formati che non si aprono qui lo dicono, invece di lasciare il pannello vuoto.

## Come si prova

\`\`\`bash
npm run test:unit
npm run test:componenti
\`\`\`

> La prova che conta è la foto: un pannello che si dichiara pieno e appare vuoto ha già mentito.

## Cosa resta fuori

1. L'estrazione del testo dai formati binari.
2. L'anteprima impaginata dei PDF.
`;

const INTESTAZIONE_CSV = 'Sessione,Modello,Richieste,Token in ingresso,Token in uscita,Costo';
const RIGHE_CSV = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1;
  const modello = ['glm-5.3-flash', 'qwen3.7-flash', 'gemini-3.1-flash'][i % 3];
  const nome = i === 4 ? '"Revisione contratti, seconda parte"' : `Sessione ${String(n).padStart(2, '0')}`;
  /* ⛔ Il costo è fra virgolette: in italiano il separatore decimale è la virgola, cioè lo stesso
     carattere che separa le colonne. È la cella che uno `split(',')` spezzerebbe in due. */
  return [nome, modello, 12 + n, 1400 + n * 137, 210 + n * 11, `"0,0${String(10 + n).padStart(2, '0')}"`].join(',');
});
const CSV_DI_PROVA = [INTESTAZIONE_CSV, ...RIGHE_CSV].join('\n');

/** Il lettore del laboratorio: la stessa forma di `lettoreFileLibreria`, senza rete. */
export function leggiFileDiProva(voce) {
  const testo = voce?.id === 'lib-md' ? MD_DI_PROVA : voce?.id === 'lib-csv' ? CSV_DI_PROVA : '';
  if (!testo) return Promise.reject(new Error('questo file non è di testo'));
  return Promise.resolve({ testo, byte: new TextEncoder().encode(testo).length });
}
