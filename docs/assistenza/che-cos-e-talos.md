# Che cos'è TALOS

## Cosa fa

TALOS è un agente che **deve dimostrare di aver fatto il lavoro**.

Sono due prodotti costruiti sulle stesse regole:

- **TALOS Mobile** — un agente personale per Android, che ragiona, ricorda,
  cerca e agisce sul telefono, con un modello che gira sul telefono stesso
  oppure con un modello in rete che scegli tu. Funziona senza server e senza
  account.
- **Harness Desktop** — un agente di programmazione locale, con un terminale
  vero, la revisione delle modifiche, automazioni, estensioni, guidato dal
  modello che scegli. Ogni sessione è una registrazione che si può rigiocare.

Le tre idee che li tengono insieme:

- **Autorità esplicita.** Quello che l'agente può fare lo decidi prima, e si
  vede a schermo mentre lavora.
- **Esiti verificati.** «Il modello dice che ha funzionato» e «il sistema ha
  osservato che ha funzionato» sono due cose diverse, e conta la seconda.
- **Una ricevuta per ogni azione.** Ogni operazione che lascia traccia produce
  una ricevuta: cosa è stato chiesto, cosa è stato eseguito, cosa è cambiato.

## Cosa non fa

- Non manda telemetria. Nessun dato d'uso parte da qui.
- Sul desktop non è un servizio in rete: risponde solo a questo computer.
- Non è un prodotto finito in ogni sua parte. Dove una funzione è parziale, la
  pagina di quella funzione lo dice invece di nasconderlo.

## I dati del progetto — e da dove si leggono

⛔ Questi dati **non si ricopiano a mano**: invecchiano. Ogni riga qui sotto dice
il file del repository da cui si legge il valore vero.

| dato | dove si legge |
|---|---|
| Licenza | `LICENSE` (testo integrale) e `NOTICE` (copyright e attribuzione) |
| Licenza dichiarata dal desktop | campo `license` in `harness-ui/package.json` |
| Repository pubblica | il telecomando `public` del repository, e i collegamenti «Releases» nel `README.md` alla radice |
| Presentazione e confronto | `README.md` alla radice |
| Mappa del repository | sezione «Repository map» del `README.md` alla radice |
| Cosa è cambiato in ogni versione | `CHANGELOG.md` alla radice |
| Componenti di terze parti | `THIRD_PARTY_NOTICES.md` alla radice, in `harness-ui/` e in `context-engine/` |
| Come segnalare un problema di sicurezza | `SECURITY.md` |
| Come contribuire | `CONTRIBUTING.md` e `CODE_OF_CONDUCT.md` |

Al 13/09/2026, letti in quei file:

- **Licenza: AGPL-3.0-only**, su tutto il progetto, desktop e mobile. Chi offre
  una versione modificata come servizio in rete deve rendere disponibile
  gratuitamente agli utenti il codice sorgente corrispondente, comprese le
  modifiche.
- **Copyright**: Antonino Rizzo, 2026.
- **Repository pubblica**: `Ninozzz95/talos` su GitHub. È quella da cui si
  scarica l'APK firmato del mobile, ed è quella citata dal `README.md`.

## ⚠ La versione: non verificata

Al 13/09/2026 nel repository ci sono **tre dichiarazioni di versione che non
concordano**, e finché non si decide quale è la fonte, **questa pagina non dice
un numero di versione**:

- il file `VERSION` alla radice dice `v1.0.0`;
- l'intestazione più recente del `CHANGELOG.md` dice `v0.1.22`;
- il mobile non porta il numero nel codice: lo riceve al momento della
  compilazione da una proprietà esterna.

⛔ Prima che una risposta automatica possa dire «TALOS è alla versione X», va
scelto **un solo file** che la dichiara, e le altre due dichiarazioni vanno
rese derivate da quella. Fino ad allora, la risposta onesta è: «la versione la
dichiarano tre file diversi e non concordano».

Nota minore, sempre da chiudere: il distintivo dello stato delle prove
automatiche nel `README.md` punta a una repository diversa da quella pubblica.

## Come si usa

Sul desktop: si avvia il server locale e si apre l'indirizzo che stampa. Al
primo avvio ci sono **quattro passaggi, in quest'ordine**: **1. Cartella**,
**2. Modello**, **3. Permessi**, **4. Fine**. La cartella si sceglie per
**prima**, non per ultima.

Al passo dei permessi «Avanti» resta bloccato finché la scelta non regge: senza
una politica scelta non si passa, e con «Accesso pieno» la casella di conferma va
spuntata. Le istruzioni esatte, comandi compresi, stanno in
`harness-ui/README.md`.

⚠ **Sulla cartella fuori dai progetti autorizzati, il velo e il server non dicono
la stessa cosa.** Il velo del primo avvio blocca «Avanti» se scegli una cartella
fuori elenco con un permesso diverso da «Accesso pieno». Il server quel cancello
**non ce l'ha più** dal 12/09/2026: una cartella scelta a mano parte con qualunque
permesso. ⇒ È una divergenza registrata, non una regola del prodotto.

> Verificato per l'**ordine** nel velo `#veloIntro` di
> `harness-ui/frontend/index.template.html`: i quattro bottoni
> `data-intro-passo="0"`…`"3"` portano, in quell'ordine, le etichette **1
> Cartella**, **2 Modello**, **3 Permessi**, **4 Fine**. E in
> `harness-ui/frontend/src/components/intro.js`, `passoConsentito` (righe 28-34),
> che quella sequenza la fa rispettare: `n > 0` vuole la cartella, `n > 1` vuole
> il modello, `n === 3` vuole la politica.
> ⛔ Correzione del 13/09/2026: prima questa riga si agganciava a `PASSI = 4`, che
> dice **quanti** sono i passi e non in quale **ordine** stanno — riordinandoli,
> quel riferimento sarebbe rimasto vero e il cancello verde.
> La divergenza sul permesso: `harness-ui/src/session-registry.mjs:3591` («qui
> NON c'è più il cancello "cartellaLibera richiede Full access"»), contro
> `harness-ui/frontend/src/components/intro.js:75-82`, dove il blocco c'è ancora.

Sul mobile: si scarica l'APK firmato dalle Releases della repository pubblica e
lo si verifica con l'impronta pubblicata. I passaggi stanno nel `README.md`
alla radice, sezione «Install».

## Se va storto

- **Il server non risponde**: TALOS non è avviato, oppure la pagina è rimasta
  aperta da prima. Riavvia e ricarica.
- **La porta è occupata**: il server parte sulla prima porta libera a partire da
  quella predefinita e la stampa all'avvio. Guarda lì quale ha preso.
- **Le sessioni non partono**: manca l'accesso a un fornitore. Il server si
  avvia lo stesso, ma in sola lettura. Vedi [Fornitori e chiavi](fornitori-e-chiavi.md).

Per un quadro completo dello stato locale c'è il [Doctor](doctor.md).
