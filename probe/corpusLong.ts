/**
 * Round 2 corpus — page-length Italian documents.
 *
 * Round 1 measured 200-character notes, which is not what a Library holds. The
 * answer to each query here sits in ONE paragraph in the middle of a long
 * document, so the run measures what actually decides quality in production:
 * chunking, overlap, and whether a document's score can survive being diluted
 * by 2.000 characters of unrelated but plausible text.
 */
export interface LongDoc {
    id: string
    name: string
    text: string
}

export interface LongQuery {
    query: string
    relevant: string
}

export const LONG_DOCS: LongDoc[] = [
    {
        id: 'L1',
        name: 'Contratto_locazione_completo.txt',
        text: `CONTRATTO DI LOCAZIONE AD USO ABITATIVO
Tra la parte locatrice, di seguito il locatore, e la parte conduttrice, di seguito il conduttore, si conviene quanto segue in ordine all immobile sito in via Giuseppe Verdi 27, piano terzo, interno 9, composto da ingresso, soggiorno con angolo cottura, due camere, doppi servizi e balcone, censito al catasto fabbricati al foglio 12 particella 340 subalterno 7.
Articolo 1 — Durata. La locazione ha inizio il primo ottobre e termina dopo quattro anni, con rinnovo automatico per ulteriori quattro anni salvo disdetta comunicata a mezzo raccomandata con avviso di ricevimento almeno sei mesi prima della scadenza.
Articolo 2 — Canone. Il corrispettivo annuo e fissato in novemila euro, da corrispondere in dodici rate mensili di settecentocinquanta euro ciascuna, anticipate, entro il giorno cinque di ogni mese, mediante bonifico bancario sul conto indicato dal locatore. In caso di ritardo superiore a venti giorni sono dovuti gli interessi legali.
Articolo 3 — Deposito cauzionale. Il conduttore versa alla firma un deposito pari a due mensilita, infruttifero, che sara restituito al termine della locazione previa verifica dello stato dell immobile e della regolarita dei pagamenti delle utenze.
Articolo 4 — Spese accessorie. Sono a carico del conduttore le spese di ordinaria amministrazione, la pulizia delle scale, il consumo di acqua e la manutenzione della caldaia. Restano a carico del locatore le spese straordinarie, la sostituzione di infissi e impianti e l imposta di registro nella misura di legge.
Articolo 5 — Animali. E consentita la detenzione di animali domestici di piccola taglia, purche non arrechino disturbo agli altri condomini e nel rispetto del regolamento condominiale.
Articolo 6 — Divieti. E fatto divieto al conduttore di sublocare in tutto o in parte l immobile, di mutarne la destinazione d uso e di eseguire opere che modifichino la struttura senza previo consenso scritto.
Articolo 7 — Recesso del conduttore. Il conduttore puo recedere in qualsiasi momento per gravi motivi, dandone comunicazione con preavviso di tre mesi a mezzo raccomandata.`,
    },
    {
        id: 'L2',
        name: 'Referto_visita_cardiologica.txt',
        text: `REFERTO DI VISITA CARDIOLOGICA CON ELETTROCARDIOGRAMMA
Paziente di quarantotto anni, non fumatore, riferisce episodi di cardiopalmo insorti nell ultimo mese, prevalentemente serali, della durata di pochi minuti, non associati a dolore toracico ne a perdita di coscienza.
Anamnesi. Familiarita per ipertensione arteriosa in linea paterna. Nessun intervento chirurgico pregresso. Assume integratore di magnesio da circa un anno. Attivita fisica tre volte a settimana, prevalentemente corsa su strada.
Esame obiettivo. Pressione arteriosa 132 su 84 millimetri di mercurio misurata al braccio destro in posizione seduta dopo cinque minuti di riposo. Frequenza cardiaca 72 battiti al minuto, ritmica. Toni cardiaci validi, pause libere, non soffi udibili ai focolai di auscultazione. Murmure vescicolare presente su tutto l ambito polmonare. Non edemi declivi.
Elettrocardiogramma. Ritmo sinusale regolare. Asse elettrico nella norma. Onde P di morfologia e durata regolari. Intervallo PR nei limiti. Complessi QRS stretti. Tratto ST isoelettrico. Onde T positive nelle derivazioni precordiali sinistre. Non alterazioni della ripolarizzazione.
Conclusioni e indicazioni. Il quadro clinico ed elettrocardiografico non evidenzia alterazioni significative. Si consiglia registrazione dinamica secondo Holter nelle ventiquattro ore per documentare gli episodi riferiti, riduzione dell assunzione di caffeina nelle ore serali e controllo dei valori pressori a domicilio per due settimane. Rivalutazione ambulatoriale a distanza di tre mesi con l esito dell Holter.`,
    },
    {
        id: 'L3',
        name: 'Verbale_assemblea_condominiale.txt',
        text: `VERBALE DI ASSEMBLEA ORDINARIA DI CONDOMINIO
L anno corrente, il giorno quattordici del mese di aprile, alle ore diciotto e trenta, presso la sala riunioni al piano interrato, si e riunita in seconda convocazione l assemblea dei condomini per discutere e deliberare sul seguente ordine del giorno.
Punto primo — Approvazione del rendiconto consuntivo. L amministratore illustra le voci di spesa dell esercizio chiuso, evidenziando un incremento della voce riscaldamento pari all undici per cento dovuto all andamento dei prezzi dell energia. L assemblea approva il rendiconto con il voto favorevole di seicentoventi millesimi.
Punto secondo — Preventivo per il rifacimento della facciata. Vengono esaminate tre offerte. La prima impresa propone centoventimila euro con ponteggio incluso e garanzia decennale. La seconda propone centoquattromila euro ma esclude il rifacimento dei balconi. La terza propone centotrentaduemila euro comprensivi di sostituzione dei pluviali e tinteggiatura degli androni. L assemblea delibera di affidare i lavori alla terza impresa, ritenendo determinante la sostituzione dei pluviali gia oggetto di infiltrazioni segnalate.
Punto terzo — Orari di silenzio e lavori interni. Si ribadisce il divieto di attivita rumorose nella fascia oraria compresa tra le ventidue e le otto e tra le quattordici e le sedici, con estensione del divieto all intera giornata di domenica.
Punto quarto — Sostituzione della pompa dell autoclave. Preso atto del guasto ricorrente segnalato dagli occupanti degli ultimi piani, si delibera la sostituzione con apparecchio a inverter, spesa preventivata milleottocento euro oltre imposta, ripartita per millesimi di proprieta.
Punto quinto — Varie ed eventuali. Un condomino segnala la scarsa illuminazione del vialetto di accesso; l amministratore si impegna a richiedere un preventivo per corpi illuminanti a led con sensore crepuscolare.`,
    },
    {
        id: 'L4',
        name: 'Manuale_caldaia_manutenzione.txt',
        text: `MANUALE D USO E MANUTENZIONE — CALDAIA MURALE A CONDENSAZIONE
Descrizione generale. L apparecchio e una caldaia murale a condensazione a camera stagna con scambiatore in acciaio inossidabile, adatta a impianti di riscaldamento a radiatori e a pannelli radianti, con produzione istantanea di acqua calda sanitaria.
Installazione. L apparecchio deve essere installato da personale qualificato, in locale aerato, rispettando le distanze minime dalle pareti indicate nello schema dimensionale. Lo scarico condensa deve essere collegato alla rete di smaltimento con sifone sempre carico, evitando tratti orizzontali privi di pendenza.
Prima accensione. Aprire il rubinetto del gas, verificare che la pressione dell impianto indicata dal manometro sia compresa tra un bar e un bar e mezzo a impianto freddo, alimentare elettricamente l apparecchio e attendere la procedura automatica di sfiato dell aria che dura circa sette minuti.
Regolazione della temperatura. La temperatura di mandata del riscaldamento e regolabile tra trenta e ottanta gradi; per impianti a pavimento non superare i quarantacinque gradi. La temperatura dell acqua sanitaria e regolabile tra trentasette e sessanta gradi.
Manutenzione periodica. Si raccomanda un controllo annuale da parte di un tecnico abilitato, comprensivo di pulizia dello scambiatore, verifica della tenuta dei raccordi gas, analisi dei prodotti della combustione e controllo del vaso di espansione. Il filtro dell impianto va pulito ogni due anni.
Codici anomalia. Il codice A01 segnala il mancato rilevamento di fiamma: verificare l apertura del rubinetto del gas e ripetere lo sblocco. Il codice A03 indica un intervento del termostato di sicurezza per sovratemperatura, spesso legato a circolazione insufficiente. Il codice A06 segnala una pressione impianto insufficiente e richiede il ripristino tramite il rubinetto di riempimento fino a riportare il manometro nel campo verde. Se l anomalia si ripresenta piu volte in pochi giorni e probabile una perdita nel circuito.`,
    },
    {
        id: 'L5',
        name: 'Polizza_infortuni_condizioni.txt',
        text: `CONDIZIONI GENERALI DI ASSICURAZIONE CONTRO GLI INFORTUNI
Oggetto della copertura. La societa assicura l assicurato contro gli infortuni subiti nello svolgimento delle attivita professionali dichiarate e di ogni attivita della vita privata, compresi gli infortuni derivanti da imprudenza, colpa grave e uso di veicoli.
Somme assicurate. Il capitale per il caso di morte e pari a duecentomila euro. Il capitale per invalidita permanente totale e pari a duecentocinquantamila euro, riproporzionato secondo la tabella allegata in caso di invalidita parziale. La diaria per ricovero e fissata in ottanta euro al giorno per un massimo di centoventi giorni per anno assicurativo.
Franchigia e scoperti. Per l invalidita permanente opera una franchigia assoluta del tre per cento; qualora l invalidita accertata superi il venticinque per cento, l indennizzo e liquidato senza applicazione della franchigia.
Esclusioni. Sono esclusi dalla garanzia gli infortuni conseguenti a partecipazione a competizioni motoristiche, alpinismo con scalata di roccia oltre il terzo grado, immersione con autorespiratore oltre i quaranta metri, uso di aeromobili non autorizzati al trasporto pubblico, nonche gli infortuni causati da stato di ebbrezza alla guida accertato oltre i limiti di legge.
Denuncia del sinistro. La denuncia deve essere presentata entro quindici giorni dall evento o dal momento in cui l assicurato ne abbia avuto possibilita, corredata da certificazione medica e, nei casi di ricovero, dalla cartella clinica completa.
Pagamento del premio e rinnovo. Il premio annuo e di quattrocentoventi euro, frazionabile in rate semestrali con maggiorazione del tre per cento. La polizza si rinnova tacitamente salvo disdetta inviata almeno trenta giorni prima della scadenza.`,
    },
    {
        id: 'L6',
        name: 'Relazione_tecnica_impianto_fotovoltaico.txt',
        text: `RELAZIONE TECNICA — IMPIANTO FOTOVOLTAICO CON ACCUMULO
Premessa. La presente relazione descrive l intervento di installazione di un impianto fotovoltaico connesso alla rete, con sistema di accumulo elettrochimico, a servizio di una unita immobiliare residenziale con consumo annuo stimato in quattromilaseicento chilowattora.
Configurazione. L impianto e composto da diciotto moduli in silicio monocristallino da quattrocentotrenta watt di picco ciascuno, per una potenza complessiva di sette virgola settantaquattro chilowatt, disposti su falda esposta a sud sud ovest con inclinazione di ventotto gradi e assenza di ombreggiamenti significativi nelle ore centrali.
Inverter e accumulo. L inverter ibrido trifase ha potenza nominale di sei chilowatt con doppio inseguitore del punto di massima potenza. La batteria al litio ferro fosfato ha capacita utile di dieci chilowattora, profondita di scarica del novanta per cento e vita attesa di seimila cicli, con garanzia di prestazione al settanta per cento della capacita dopo dieci anni.
Producibilita attesa. Sulla base dell irraggiamento medio della zona, la producibilita annua stimata e di ottomilaquattrocento chilowattora, con autoconsumo diretto pari al trentotto per cento e autoconsumo complessivo, grazie all accumulo, pari al settantadue per cento dei consumi.
Sicurezza e protezioni. Sono previsti scaricatori di sovratensione lato corrente continua e lato corrente alternata, interruttore differenziale di tipo A, sezionatore in prossimita dei moduli e dispositivo di interfaccia conforme alla norma applicabile per la connessione alla rete di distribuzione.
Manutenzione. Si prevede la pulizia dei moduli con acqua demineralizzata una volta all anno, preferibilmente in primavera, la verifica del serraggio dei morsetti ogni due anni e il controllo dello stato di salute della batteria tramite il portale del produttore con cadenza semestrale.`,
    },
    {
        id: 'L7',
        name: 'Regolamento_aziendale_smart_working.txt',
        text: `REGOLAMENTO AZIENDALE — LAVORO AGILE E STRUMENTI DI LAVORO
Finalita. Il presente regolamento disciplina lo svolgimento della prestazione lavorativa in modalita agile, con l obiettivo di conciliare esigenze organizzative e benessere delle persone, garantendo continuita del servizio e tutela delle informazioni aziendali.
Giornate e pianificazione. Ciascun dipendente puo svolgere fino a otto giornate al mese in modalita agile, da pianificare nel calendario condiviso con almeno quarantotto ore di anticipo e con il consenso del responsabile diretto. Nelle settimane in cui sono previste riunioni di allineamento trimestrale la presenza in sede e obbligatoria.
Fascia di contattabilita. La prestazione si svolge senza vincolo di orario preciso, fermo restando l obbligo di essere raggiungibili nella fascia compresa tra le dieci e le tredici e tra le quattordici e trenta e le diciassette. E riconosciuto il diritto alla disconnessione al di fuori di tali fasce e nei giorni festivi.
Strumenti. L azienda fornisce computer portatile, monitor esterno su richiesta e telefono aziendale. L uso degli strumenti per finalita personali e tollerato purche non pregiudichi la sicurezza; e vietata l installazione di software non autorizzato e la memorizzazione di dati aziendali su servizi cloud personali.
Sicurezza e riservatezza. Il collegamento alle risorse interne avviene esclusivamente tramite rete privata virtuale con autenticazione a due fattori. In caso di smarrimento o furto del dispositivo il dipendente deve segnalarlo entro dodici ore al servizio informatico, che procede al blocco remoto.
Rimborsi. Non e previsto rimborso per le utenze domestiche. E riconosciuto un contributo annuale di centocinquanta euro per l acquisto di sedute ergonomiche, previa presentazione della documentazione di spesa.`,
    },
    {
        id: 'L8',
        name: 'Preventivo_impianto_climatizzazione.txt',
        text: `PREVENTIVO PER FORNITURA E POSA DI IMPIANTO DI CLIMATIZZAZIONE
Oggetto. Fornitura e installazione di impianto multisplit a pompa di calore per abitazione su due livelli, comprensivo di opere murarie minime, collaudo e pratica di detrazione fiscale.
Unita esterna. Motocondensante trifase con potenza frigorifera nominale di dieci chilowatt e potenza termica di undici chilowatt, refrigerante R32, classe energetica elevata in raffrescamento e riscaldamento, livello di potenza sonora dichiarato pari a sessantadue decibel.
Unita interne. Quattro unita a parete rispettivamente da due virgola cinque, due virgola cinque, tre virgola cinque e cinque chilowatt, dotate di filtro elettrostatico, funzione deumidificazione autonoma e comando via applicazione con programmazione settimanale.
Opere previste. Realizzazione delle linee frigorifere in rame preisolato con percorso in traccia per complessivi trentadue metri, scarico condensa con pendenza minima dell uno per cento, staffaggio antivibrante dell unita esterna su mensole in acciaio zincato, ripristino delle tracce e tinteggiatura di raccordo.
Importi. Fornitura dei materiali novemilaquattrocento euro. Manodopera per installazione tremilaseicento euro. Opere murarie e ripristini ottocentocinquanta euro. Collaudo, vuoto spinto e messa in servizio quattrocento euro. Totale imponibile quattordicimiladuecentocinquanta euro, con aliquota agevolata al dieci per cento per intervento di manutenzione straordinaria.
Tempi e garanzie. Inizio lavori entro tre settimane dall accettazione, durata stimata quattro giorni lavorativi. Garanzia di cinque anni sul compressore e di due anni sull installazione. Il preventivo ha validita di sessanta giorni.`,
    },
]

export const LONG_QUERIES: LongQuery[] = [
    { query: 'quanto devo lasciare come garanzia alla firma di casa', relevant: 'L1' },
    { query: 'posso tenere il cane nell appartamento in affitto', relevant: 'L1' },
    { query: 'con quanto anticipo devo avvisare se voglio andarmene', relevant: 'L1' },
    { query: 'cosa mi ha detto il medico del cuore di fare adesso', relevant: 'L2' },
    { query: 'la pressione misurata durante la visita era alta', relevant: 'L2' },
    { query: 'quale ditta hanno scelto per sistemare il palazzo e perche', relevant: 'L3' },
    { query: 'quanto costa cambiare la pompa dell acqua nel palazzo', relevant: 'L3' },
    { query: 'la caldaia segnala poca pressione, cosa devo fare', relevant: 'L4' },
    { query: 'ogni quanto va fatto il controllo del tecnico alla caldaia', relevant: 'L4' },
    { query: 'quanto mi danno al giorno se finisco in ospedale', relevant: 'L5' },
    { query: 'se mi faccio male facendo sub sono coperto', relevant: 'L5' },
    { query: 'quanta corrente produce in un anno il tetto solare', relevant: 'L6' },
    { query: 'quanto dura la batteria di accumulo prima di calare', relevant: 'L6' },
    { query: 'quanti giorni al mese posso lavorare da casa', relevant: 'L7' },
    { query: 'in che orari devo essere raggiungibile lavorando da remoto', relevant: 'L7' },
    { query: 'se mi rubano il portatile aziendale entro quando lo devo dire', relevant: 'L7' },
    { query: 'quanto costa in tutto mettere i condizionatori', relevant: 'L8' },
    { query: 'quanto rumore fa il motore esterno del climatizzatore', relevant: 'L8' },
]
