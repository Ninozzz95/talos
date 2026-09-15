# Artefatti e immagini

## Cosa fa

Due cose che il modello può **produrre** invece di descrivere.

**Un artefatto** è una paginetta interattiva — un grafico, una tabella viva, una
piccola interfaccia — costruita dal modello e mostrata **dentro la chat**.

**Un'immagine** è generata da una descrizione e salvata come **file vero** nel
progetto, quindi finisce in [Libreria](libreria.md) come qualunque altro
prodotto del lavoro. I formati riconosciuti sono PNG, JPEG, WebP, GIF e AVIF.

Accanto a queste due c'è la **creazione di un documento**, che produce un file
vero e proprio — PDF, Word, foglio di calcolo, presentazione — anch'esso salvato
nel progetto.

## Cosa non fa

- ⛔⛔ **Un artefatto non sopravvive al riavvio del server.** È tenuto **solo in
  memoria**: se TALOS si riavvia, la paginetta non si riapre più. È dichiarato
  nel prodotto invece di essere scoperto sbattendoci. ⇒ Se un artefatto ti serve
  domani, **non è il posto dove tenerlo**: fattene dare il contenuto come
  documento, che invece finisce sul disco.
- **Un'immagine, al contrario, resta.** Viene scritta sul disco in modo atomico,
  con una scheda a fianco, e si rilegge anche dopo un riavvio.
- ⛔ **Generare un'immagine o creare un documento scrive sul disco anche quando
  l'attrezzo di scrittura è negato.** È uno dei tre casi elencati nei
  [permessi per attrezzo](permessi-per-attrezzo.md): un cancello che sembra
  chiuso e non lo è è peggio di uno aperto.
- Un artefatto non ha accesso ai tuoi dati: è una pagina servita a parte, con
  regole di sicurezza tutte sue.

## Come si usa

Non si avviano da un pulsante: li produce il modello quando glielo chiedi a
parole («fammi un grafico di…», «generami un'immagine di…», «scrivimi un PDF
con…»).

Gli attrezzi corrispondenti si governano da **Capability**, come tutti gli
altri: se non vuoi che TALOS generi immagini, quel singolo attrezzo si mette su
«Nega».

## Se va storto

- **Un artefatto non si riapre** — quasi sempre il server è stato riavviato. Non
  è recuperabile: chiedi al modello di rifarlo.
- **Un'immagine non compare in Libreria** — guarda se la generazione è arrivata
  in fondo; il file viene scritto solo a fine lavoro.
- **Hai negato la scrittura e un file è comparso lo stesso** — rileggi «Cosa non
  fa» qui sopra: la generazione di un'immagine e la creazione di un documento
  sono due delle tre strade che restano aperte.

> Verificato in `harness-ui/src/artifact-store.mjs` (solo in memoria, non
> sopravvive a un riavvio), `harness-ui/src/generated-image-store.mjs`
> (`GENERATED_IMAGE_MIME_TYPES`, scrittura atomica) e nelle descrizioni degli
> attrezzi `artifact_create`, `generate_image`, `document_create` in
> `harness-ui/frontend/src/components/nomi-attrezzi.js`.

> Nota sull'isolamento di un artefatto: è servito come **risposta HTTP vera**, con
> una Content-Security-Policy tutta sua, proprio per non ereditare quella della
> pagina — `harness-ui/src/artifact-store.mjs:4-18`. L'intestazione vera della risposta
> è `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src
> 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'`, in
> `harness-ui/src/http-app.mjs:5964` (ramo dell'artefatto, `leggiArtefattoFn` alla riga
> 5941).
> ⛔ Correzione del 13/09/2026: qui era citato `default-src 'none'; sandbox` alle righe
> 2527 e 2596. Quella CSP nel file **esiste**, ma su altre rotte — gli allegati scaricati
> — e a righe diverse; l'artefatto ha bisogno di `allow-scripts`, quindi la sua è un'altra.
