/**
 * Probe corpus — Italian, deliberately adversarial to keyword search.
 *
 * Every query uses words that do NOT appear in its relevant document
 * ("ricevuta" vs "fattura", "compenso" vs "stipendio", "guasto" vs
 * "malfunzionamento"): a keyword ranker scores those at zero, so the gap
 * between the current search and a semantic one becomes measurable instead of
 * anecdotal. The distractor documents share vocabulary with the queries on
 * purpose — that is where keyword search actively puts the WRONG file first.
 */
export interface ProbeDoc {
    id: string
    name: string
    text: string
}

export interface ProbeQuery {
    query: string
    /** The document a human would expect first. */
    relevant: string
}

export const PROBE_DOCS: ProbeDoc[] = [
    {
        id: 'd01',
        name: 'Fattura_Studio_Legale_novembre.txt',
        text: 'Fattura numero 214 emessa dallo Studio Legale Marchetti per consulenza societaria. Imponibile 1.800 euro, IVA 22 per cento, totale 2.196 euro. Pagamento a trenta giorni tramite bonifico bancario sull IBAN indicato in calce.',
    },
    {
        id: 'd02',
        name: 'Contratto_affitto_via_Dante.txt',
        text: 'Contratto di locazione ad uso abitativo per l immobile di via Dante 14, durata quattro anni piu quattro. Canone mensile 750 euro da versare entro il giorno cinque di ogni mese. Deposito cauzionale pari a due mensilita.',
    },
    {
        id: 'd03',
        name: 'Busta_paga_marzo.txt',
        text: 'Prospetto retributivo del mese di marzo. Retribuzione lorda 2.400 euro, trattenute previdenziali e fiscali 690 euro, netto in busta 1.710 euro. Ferie maturate 8 giorni, permessi residui 12 ore.',
    },
    {
        id: 'd04',
        name: 'Manuale_lavastoviglie_errore_E4.txt',
        text: 'Il codice E4 indica un malfunzionamento del sensore di livello acqua. Chiudere il rubinetto, scollegare l apparecchio dalla presa per dieci minuti, verificare che il filtro non sia ostruito e riavviare il programma breve.',
    },
    {
        id: 'd05',
        name: 'Polizza_auto_scadenza.txt',
        text: 'La copertura assicurativa del veicolo targato FE912RT scade il 30 giugno. Massimale responsabilita civile sei milioni di euro, franchigia 250 euro, formula con guida libera e clausola bonus malus.',
    },
    {
        id: 'd06',
        name: 'Referto_analisi_sangue.txt',
        text: 'Esito degli esami ematochimici: emoglobina 14,2, globuli bianchi 6.800, colesterolo totale 205, glicemia a digiuno 92. Valori nella norma ad eccezione del colesterolo lievemente sopra il limite consigliato.',
    },
    {
        id: 'd07',
        name: 'Verbale_riunione_progetto_Orion.txt',
        text: 'Riunione del 12 aprile sul progetto Orion. Deciso di posticipare il rilascio della versione due di tre settimane per completare i test di carico. Responsabile del piano di prova nominato Luca Ferri.',
    },
    {
        id: 'd08',
        name: 'Istruzioni_forno_pulizia_pirolitica.txt',
        text: 'Prima di avviare il ciclo pirolitico rimuovere griglie e leccarda. Il ciclo dura due ore durante le quali la porta resta bloccata. Al termine attendere il raffreddamento e passare un panno umido sui residui di cenere.',
    },
    {
        id: 'd09',
        name: 'Preventivo_ristrutturazione_bagno.txt',
        text: 'Offerta economica per il rifacimento del bagno: demolizione rivestimenti 900 euro, impianto idraulico 2.100 euro, posa piastrelle 1.750 euro, sanitari sospesi 1.200 euro. Tempi stimati venticinque giorni lavorativi.',
    },
    {
        id: 'd10',
        name: 'Certificato_garanzia_notebook.txt',
        text: 'Il prodotto e coperto da garanzia convenzionale di ventiquattro mesi dalla data di acquisto. Sono esclusi i danni da caduta, da liquidi e le batterie che abbiano superato i cinquecento cicli di ricarica.',
    },
    {
        id: 'd11',
        name: 'Ricetta_ragu_napoletano.txt',
        text: 'Rosolare la cipolla nell olio, aggiungere la carne e farla colorire, sfumare con il vino rosso. Unire la passata e cuocere a fuoco bassissimo per almeno tre ore mescolando ogni tanto.',
    },
    {
        id: 'd12',
        name: 'Regolamento_condominio_rumori.txt',
        text: 'E fatto divieto di svolgere attivita rumorose dalle 22 alle 8 e dalle 14 alle 16. L uso di trapani e martelli e consentito solo nei giorni feriali. Le violazioni sono segnalate all amministratore.',
    },
    {
        id: 'd13',
        name: 'Piano_allenamento_mezza_maratona.txt',
        text: 'Settimana quattro: lunedi riposo, martedi otto chilometri lenti, mercoledi ripetute sei per mille metri, venerdi corsa media dieci chilometri, domenica lungo di diciotto chilometri a ritmo controllato.',
    },
    {
        id: 'd14',
        name: 'Disdetta_abbonamento_palestra.txt',
        text: 'Comunico la volonta di non rinnovare il tesseramento in scadenza il 31 dicembre, come previsto dall articolo sette del regolamento che richiede preavviso di trenta giorni tramite raccomandata.',
    },
    {
        id: 'd15',
        name: 'Appunti_configurazione_router.txt',
        text: 'Accedere al pannello su 192.168.1.1 con le credenziali stampate sotto l apparato. Impostare canale wifi fisso, abilitare la banda a cinque gigahertz e aprire la porta 51820 verso il server interno.',
    },
    {
        id: 'd16',
        name: 'Lettera_dimissioni_volontarie.txt',
        text: 'Con la presente rassegno le mie dimissioni dalla posizione ricoperta, con ultimo giorno lavorativo il 15 settembre, nel rispetto del periodo di preavviso previsto dal contratto collettivo applicato.',
    },
    {
        id: 'd17',
        name: 'Scheda_tecnica_pompa_di_calore.txt',
        text: 'Potenza termica nominale 8 kilowatt, coefficiente di prestazione 4,2 alla temperatura esterna di sette gradi. Rumorosita esterna 52 decibel. Refrigerante R32 con carica di 1,8 chilogrammi.',
    },
    {
        id: 'd18',
        name: 'Programma_viaggio_Lisbona.txt',
        text: 'Primo giorno arrivo alle 11 e passeggiata nel quartiere Alfama. Secondo giorno tram numero ventotto e monastero dei Jeronimos. Terzo giorno gita a Sintra con partenza dalla stazione di Rossio.',
    },
    {
        id: 'd19',
        name: 'Comunicazione_scuola_gita.txt',
        text: 'Si informano le famiglie che l uscita didattica al museo della scienza si terra il 9 maggio. Quota di partecipazione 18 euro comprensiva di trasporto e ingresso, da consegnare entro il 2 maggio.',
    },
    {
        id: 'd20',
        name: 'Estratto_conto_carta.txt',
        text: 'Movimenti del periodo: addebito supermercato 84,30, rifornimento carburante 62,00, abbonamento streaming 12,99, prelievo contante 100,00. Saldo disponibile a fine periodo 1.243,71 euro.',
    },
    {
        id: 'd21',
        name: 'Istruzioni_montaggio_libreria.txt',
        text: 'Inserire i tasselli nei fori laterali, fissare i ripiani con le viti da 30 millimetri e ancorare il fianco alla parete con la staffa in dotazione prima di caricare peso sui piani superiori.',
    },
    {
        id: 'd22',
        name: 'Delega_ritiro_pacco.txt',
        text: 'Il sottoscritto delega il signor Marco Bianchi al ritiro della spedizione numero 998ZK presso il punto di raccolta, allegando copia del documento di identita di entrambe le parti.',
    },
    {
        id: 'd23',
        name: 'Note_riparazione_bicicletta.txt',
        text: 'Sostituita la camera d aria posteriore, registrato il cambio che saltava sul pignone piccolo, ingrassata la catena e serrato il reggisella. Costo complessivo dell intervento 45 euro.',
    },
    {
        id: 'd24',
        name: 'Verbale_multa_divieto_sosta.txt',
        text: 'Accertata la sosta del veicolo in area riservata al carico e scarico nella fascia oraria vietata. Sanzione amministrativa 42 euro ridotta a 29,40 se pagata entro cinque giorni.',
    },
]

export const PROBE_QUERIES: ProbeQuery[] = [
    { query: 'quanto devo pagare all avvocato e con che scadenza', relevant: 'd01' },
    { query: 'quanto costa al mese la casa in cui abito', relevant: 'd02' },
    { query: 'quanto ho preso di stipendio a marzo', relevant: 'd03' },
    { query: 'la lavastoviglie da un guasto, che faccio', relevant: 'd04' },
    { query: 'quando devo rinnovare l assicurazione della macchina', relevant: 'd05' },
    { query: 'come sono andate le analisi mediche', relevant: 'd06' },
    { query: 'perche il rilascio del software e slittato', relevant: 'd07' },
    { query: 'come si autopulisce il forno', relevant: 'd08' },
    { query: 'quanto mi costa rifare la stanza da bagno', relevant: 'd09' },
    { query: 'il computer portatile e ancora coperto se si rompe', relevant: 'd10' },
    { query: 'per quante ore va cotto il sugo di carne', relevant: 'd11' },
    { query: 'a che ora non posso usare il trapano in casa', relevant: 'd12' },
    { query: 'quanti chilometri devo correre domenica', relevant: 'd13' },
    { query: 'come faccio a smettere di andare in palestra', relevant: 'd14' },
    { query: 'come entro nelle impostazioni della rete di casa', relevant: 'd15' },
    { query: 'come comunico che lascio il lavoro', relevant: 'd16' },
    { query: 'quanto fa rumore fuori il riscaldamento nuovo', relevant: 'd17' },
    { query: 'cosa vediamo il secondo giorno in portogallo', relevant: 'd18' },
    { query: 'quanto devo dare a mio figlio per la gita', relevant: 'd19' },
    { query: 'quanto ho speso di benzina questo mese', relevant: 'd20' },
    { query: 'come attacco il mobile al muro senza che cada', relevant: 'd21' },
    { query: 'chi puo andare a prendere il pacco al posto mio', relevant: 'd22' },
    { query: 'quanto e costato sistemare la bici', relevant: 'd23' },
    { query: 'quanto pago se salto la contravvenzione entro pochi giorni', relevant: 'd24' },
]
