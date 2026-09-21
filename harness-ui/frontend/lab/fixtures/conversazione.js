/*
 * La conversazione del mockup come DATI — nella forma in cui il monolite li
 * ha dopo gli eventi dello stream (RunStarted, TextMessage*, ToolCall*,
 * StateDelta, ApprovalRequested, ArtifactCreated). Ogni turno è ciò che il
 * laboratorio passa alle fabbriche di `components/conversazione.js`; se il
 * risultato coincide col mockup, le fabbriche riproducono il disegno.
 */
export const CONVERSAZIONE = Object.freeze([
  {
    tipo: 'utente',
    numeri: [{ n: 1, tick: 1 }],
    testo: 'Aggiungi la guardia di stallo al registro dei processi e falla riconoscere due casi diversi: silenzio prolungato e giri a vuoto. Non deve uccidere niente.',
    ora: '18:04',
  },
  {
    tipo: 'talos',
    numeri: [{ n: 2, tick: 2 }, { n: 3, tick: 4, tono: 'info' }, { n: 4, tick: 1 }],
    modello: 'claude-opus-5',
    ora: '18:04',
    paragrafi: ['Ho letto il registro esistente e i quattro file di prova. La guardia serve due condizioni diverse, quindi le tengo separate: il silenzio si misura sull\'ultimo evento arrivato, il giro a vuoto sul confronto fra chiamate identiche.'],
    attivita: {
      id: 'attGiro2',
      riassunto: '7 attrezzi usati in questo giro · 1 fallito',
      tempo: '3,1 s',
      token: '1,9k token',
      righe: [
        { attrezzo: 'leggi', nome: 'Lettura di un file', dettaglio: 'src/session-registry.mjs', esito: 'success' },
        { attrezzo: 'cerca', nome: 'Ricerca nei file', dettaglio: 'guardiaDiStallo', esito: 'success', conDettaglio: true, id: 'attGiro2Riga2', aperto: true, corpo: 'src/session-registry.mjs:41  export function guardiaDiStallo(registro, soglie)\ntests/session-registry.test.mjs:12  guardiaDiStallo(registro, SOGLIE_STALLO_PREDEFINITE)' },
        { attrezzo: 'shell', nome: 'Comando nel terminale', dettaglio: 'node --test tests/*.test.mjs', esito: 'success' },
      ],
      fallimento: {
        titolo: 'Il comando non ha trovato la cartella',
        testo: '«labs/electron-shell» non esiste nel percorso da cui è partito il comando. Riprova dalla radice del progetto, oppure correggi il percorso.',
        azioni: [{ etichetta: 'Riprova dalla radice' }, { etichetta: 'Dettagli tecnici' }],
        codice: 'TALOS-SHELL-404',
      },
    },
    nota: { tipo: 'info', badge: 'Nota', titolo: 'Permesso cambiato a metà lavoro', testo: 'Da «solo lettura» a «scrive nel progetto», deciso da te alle 18:06. I giri precedenti restano registrati col permesso di allora.' },
    azioni: true,
  },
  {
    tipo: 'talos',
    numeri: [{ n: 5, tick: 3 }, { n: 6, tick: 5, tono: 'warning' }],
    modello: 'claude-opus-5',
    ora: '18:07',
    paragrafi: ['La guardia è scritta e i test la coprono nei due versi. Prima di applicare la modifica al file vero ti mostro cosa cambia.'],
    approvazione: {
      badge: 'Chiede di scrivere',
      bersaglio: 'src/session-registry.mjs',
      aggiunte: 18,
      rimozioni: 2,
      perche: 'Vuole scrivere questo file. Serve per aggiungere le soglie della guardia che hai chiesto: 60 secondi di silenzio e tre ripetizioni identiche.',
      codice: 'src/session-registry.mjs',
      motivo: 'Chiede perché «scrittura di un file» ha il cancello «Chiedi conferma», anche con la sessione su «Accesso pieno».',
      diff: [
        { tipo: 'del', testo: '− const SOGLIE = { silenzioMs: 30_000 };' },
        { tipo: 'add', testo: '+ export const SOGLIE_STALLO_PREDEFINITE = Object.freeze({' },
        { tipo: 'add', testo: '+   silenzioMs: 60_000,        // 30-60 s è lo stato dell\'arte' },
        { tipo: 'add', testo: '+   ripetizioniPerAllarme: 3,  // 65 identiche su 634, misurato' },
        { tipo: 'add', testo: '+ });' },
      ],
      nota: 'Scade a fine sessione',
    },
    ricevuta: { testo: 'Scrittura eseguita: 18 righe aggiunte, 2 tolte, alle 18:08:12.', hash: 'a1f4…9c02' },
    fileToccati: [
      { percorso: 'src/session-registry.mjs', aggiunte: 18, rimozioni: 2 },
      { percorso: 'tests/session-registry.test.mjs', aggiunte: 64, rimozioni: 0 },
    ],
    artefatto: { titolo: 'Rapporto sulle soglie di stallo', formato: 'html' },
  },
  {
    tipo: 'talos',
    numeri: [{ n: 7, tick: 2, tono: 'current' }],
    modello: 'claude-opus-5',
    ora: '18:09',
    paragrafi: ['Lancio la suite completa per vedere se qualcosa è regredito…'],
    attesa: { etichetta: 'Sto eseguendo…' },
  },
]);
