/**
 * Round 3 — scale corpus.
 *
 * Rounds 1 and 2 ranked against 24 and 8 documents. A real Library holds
 * hundreds, and the question that changes the design is whether accuracy holds
 * when the right document has to beat NINETY plausible neighbours instead of
 * seven. The fillers below are deterministic, unrelated in topic but written in
 * the same register, so they are realistic noise rather than obvious padding.
 */
const TOPICS: Array<{ name: string; body: (n: number) => string }> = [
    {
        name: 'Nota_spese_trasferta',
        body: (n) => `Nota spese per la trasferta numero ${100 + n}. Treno andata e ritorno ${48 + n} euro, pernottamento in struttura convenzionata ${75 + n} euro, pasti ${22 + n} euro. Allegate le ricevute in originale e il modulo di autorizzazione firmato dal responsabile di funzione.`,
    },
    {
        name: 'Scheda_allenamento',
        body: (n) => `Scheda della settimana ${n}. Riscaldamento dieci minuti a corpo libero, poi ${3 + (n % 3)} serie da ${8 + (n % 5)} ripetizioni su panca piana, stacchi da terra con carico progressivo e chiusura con addominali. Recupero di novanta secondi tra le serie, defaticamento sul tappeto.`,
    },
    {
        name: 'Verbale_sopralluogo',
        body: (n) => `Sopralluogo del cantiere ${n} effettuato in presenza del direttore dei lavori. Verificata la posa del massetto al piano ${1 + (n % 4)}, riscontrata umidita residua nella zona nord da monitorare prima della posa del parquet. Prossimo controllo fissato tra ${7 + (n % 10)} giorni.`,
    },
    {
        name: 'Ricetta_di_famiglia',
        body: (n) => `Impastare ${200 + n * 10} grammi di farina con acqua tiepida e lievito, lasciare riposare coperto per ${2 + (n % 4)} ore fino al raddoppio. Stendere, condire con pomodoro e origano, infornare a duecentoventi gradi per venti minuti nella parte bassa del forno.`,
    },
    {
        name: 'Appunti_lettura',
        body: (n) => `Capitolo ${n}: l autore sostiene che le organizzazioni imparano piu dagli errori raccontati che dai successi celebrati, e porta l esempio di una squadra che introduce una revisione settimanale senza colpevoli. Da riprendere il passaggio sulle metriche che diventano obiettivi.`,
    },
    {
        name: 'Promemoria_giardino',
        body: (n) => `Nel mese ${1 + (n % 12)} potare le siepi perimetrali, controllare l impianto a goccia sul lato ovest e sostituire i gocciolatori otturati. Concimare gli agrumi in vaso con prodotto a lenta cessione e trattare le rose contro l oidio nelle giornate asciutte.`,
    },
    {
        name: 'Diario_viaggio',
        body: (n) => `Giorno ${n}: partenza presto, colazione al mercato coperto e visita al quartiere alto seguendo la strada panoramica. Pranzo in una trattoria familiare, pomeriggio in spiaggia e rientro con l ultimo autobus. Domani si valuta la gita in barca se il vento cala.`,
    },
    {
        name: 'Registro_manutenzione_auto',
        body: (n) => `Tagliando eseguito a ${10000 * n} chilometri: sostituzione olio motore e filtro, controllo pastiglie anteriori residue al ${40 + (n % 50)} per cento, rabbocco liquido tergicristalli, verifica pressione pneumatici e reset della spia di servizio.`,
    },
    {
        name: 'Verbale_colloquio',
        body: (n) => `Colloquio numero ${n} per la posizione tecnica. Il candidato descrive un progetto di migrazione durato ${3 + (n % 9)} mesi, mostra padronanza degli strumenti richiesti e chiede chiarimenti sul modello di lavoro ibrido. Valutazione complessiva positiva, da sentire il secondo referente.`,
    },
    {
        name: 'Comunicazione_servizio',
        body: (n) => `Si comunica che nella giornata del ${1 + (n % 28)} il servizio subira un interruzione programmata dalle ventidue alle due per aggiornamento degli apparati. Durante la finestra non sara possibile accedere al portale; i dati non subiranno alcuna variazione.`,
    },
    {
        name: 'Scheda_prodotto',
        body: (n) => `Articolo ${1000 + n}: struttura in alluminio anodizzato, peso ${800 + n * 5} grammi, autonomia dichiarata ${6 + (n % 10)} ore, ricarica completa in novanta minuti. Confezione comprensiva di custodia rigida, cavo intrecciato e panno in microfibra.`,
    },
    {
        name: 'Nota_riunione_settimanale',
        body: (n) => `Settimana ${n}: chiusi ${2 + (n % 6)} argomenti aperti, spostata la revisione grafica alla settimana successiva per attesa dei materiali. Segnalato un rallentamento nelle risposte del fornitore esterno, si valuta un sollecito formale entro venerdi.`,
    },
]

export interface ScaleDoc { id: string; name: string; text: string }

/** 84 deterministic fillers: same register, different subject matter. */
export const SCALE_FILLERS: ScaleDoc[] = Array.from({ length: 84 }, (_, index) => {
    const topic = TOPICS[index % TOPICS.length]!
    const serial = Math.floor(index / TOPICS.length) + 1
    const number = index + 1
    return {
        id: `F${String(index + 1).padStart(3, '0')}`,
        name: `${topic.name}_${serial}.txt`,
        text: topic.body(number),
    }
})
