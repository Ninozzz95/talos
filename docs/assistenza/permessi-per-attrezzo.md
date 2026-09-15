# I permessi di ogni singolo attrezzo

## Cosa fa

Oltre al permesso generale della sessione, **ogni attrezzo ha il suo**. Serve a
dire «per questa cosa qui, comportati diversamente»: leggere sempre senza
chiedere, ma chiedere sempre prima di lanciare un comando, per esempio.

Le scelte per ogni attrezzo sono quattro:

- **Come la sessione** — segue la regola generale. È il valore di partenza.
- **Consenti sempre** — fa senza chiedere, anche se la sessione chiederebbe.
- **Chiedi sempre** — chiede prima, anche se la sessione non chiederebbe.
- **Nega** — non lo usa.

L'elenco degli attrezzi si apre dalla voce **Capability** nella barra laterale.
Per ognuno vedi il nome in italiano, cosa fa al tuo computer, quanto pesa nella
conversazione, e quante volte è stato usato nella sessione aperta.

## Cosa non fa

⛔ **Chiudere «scrivi» non chiude i file.** È il limite più importante di questa
pagina, ed è dichiarato dal prodotto stesso: tre attrezzi possono lasciare un
file sul disco anche con la scrittura negata —

- un comando lanciato nel terminale,
- la creazione di un documento,
- la generazione di un'immagine.

Non è un difetto solo di TALOS: è un rischio riconosciuto in tutti gli agenti
che hanno sia un cancello sui file sia un modo di eseguire comandi. Finché non
esiste un divieto assoluto a monte, la cosa onesta è dirlo: **un cancello che
sembra chiuso e non lo è è peggio di uno aperto.**

Inoltre:

- Non tutti gli attrezzi hanno un permesso configurabile. Quelli che non ce
  l'hanno seguono la politica della sessione e lo dichiarano.
- Il permesso non cambia **cosa** l'attrezzo fa, solo **se te lo chiede**.

## Come si usa

1. Apri **Capability** dalla barra laterale.
2. Cerca l'attrezzo, o filtra per «quelli con permesso configurabile».
3. Scegli la regola per quell'attrezzo.
4. Un attrezzo su «Chiedi sempre» si riconosce nell'elenco: la sua etichetta è
   evidenziata.

Nel dettaglio di ogni attrezzo ci sono **due descrizioni diverse**, ed è voluto:
quella in italiano dice cosa fa al tuo computer, quella tecnica è il testo che
riceve il modello. Sono due destinatari diversi, e la seconda non si tocca.

## Se va storto

- **Un attrezzo risulta non disponibile** — di solito gli manca qualcosa (un
  accesso, un programma installato). La riga lo dichiara sotto il nome.
- **Hai negato un attrezzo e l'azione avviene lo stesso** — rileggi «Cosa non
  fa» qui sopra: probabilmente è passata da un comando nel terminale. Per
  chiuderla davvero, restringi anche quello.
- **La stima di quanto pesa un attrezzo dice «non disponibile»** — non è un
  errore: quel dato non c'è per tutti, e uno zero finto sarebbe peggio.

> Verificato in `harness-ui/frontend/src/components/capability.js`: le quattro
> scelte sono alla riga 4 (`PERMESSI`: «Come la sessione», «Consenti sempre»,
> «Chiedi sempre», «Nega»); il filtro «quelli con permesso configurabile» è
> `filtraAttrezzi` alla riga 7 (`filtro === 'permessi'` →
> `permessoConfigurabile === true`); l'etichetta evidenziata per «Chiedi sempre» è
> alla riga 19 (`talos-badge--warning`). I **tre** attrezzi che possono scrivere
> anche con «scrivi» chiuso sono
> `harness-ui/frontend/src/components/permessi.js:20-24` (`SCRIVONO_LO_STESSO`:
> `shell` «un comando nel terminale», `document_create` «la creazione di un
> documento», `generate_image` «la generazione di un'immagine»), e il perché è
> scritto in testa allo stesso file. Le due descrizioni per attrezzo — quella per
> te e quella per il modello — sono i due dizionari di
> `harness-ui/frontend/src/components/nomi-attrezzi.js`.
