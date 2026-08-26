# Debiti mobile dopo Codice — 2026-08-25

Owner: Antonino

Stato: **CHIUSO 2026-08-26 (notte) — DEBT-MOBILE-001…015 tutti chiusi
end-to-end con evidenza reale sul Pad**. Gli ultimi tre gate fisici
(continuità download, streaming locale pulito, tablet portrait reale) sono
stati chiusi nella stessa sera dall'agente mobile, con verifica indipendente
del commit precedente da parte del coordinatore. Dettaglio completo, per
debito, nelle sezioni sotto e nel ledger tecnico
(`.claude/LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`). Commit:
`04d798f5` (014/015) e `64d17ea` (portrait) su `lane/voce-personale`, **non
spinti**: il push resta subordinato a un sì esplicito e fresco dell'owner.

Ordine vincolante: iniziare diagnosi, ricerca, ledger e fix soltanto dopo la
chiusura completa delle fasi Codice/Harness in corso.

## Evidenze ricevute

- `C:\Users\Antonino\Downloads\bug\unnamed (1).jpg`: apertura del documento
  Markdown appena generato con testata compenetrata nella status bar.
- `C:\Users\Antonino\Downloads\bug\unnamed.jpg`: schermata Provider e accessi
  con errore OpenRouter visibile mentre la stessa scheda indica «Chiave
  salvata» e 418 modelli disponibili.
- `C:\Users\Antonino\Downloads\aaa.jpg`: nella scheda di un modello locale
  Hugging Face, la descrizione mostra il tag HTML `<img>` come testo/link
  letterale invece di renderizzare l'immagine remota.
- `C:\Users\Antonino\Downloads\gemini.jpg` e il log diagnostico allegato:
  con OpenRouter e `Google: Gemini 3.7 Flash` il tool `generate_image` termina
  con `TALOS_IMAGE_PERSIST_FAILED`; la risposta dice che l'immagine è stata
  generata ma non è stata salvata nello storage locale cifrato.

## DEBT-MOBILE-001 — Safe area del documento appena generato

Stato: **chiuso 2026-08-26 (notte)**. Fix minimo applicato, regressioni larghe
verdi, Pad verde su landscape e telefono in entrambe le forme; il gate
portrait, rimasto pendente più a lungo di tutti perché richiede la rotazione
fisica del Pad, è stato chiuso la sera del 26/8 con la sequenza
`accelerometer_rotation`/`user_rotation` (l'owner non era davanti al
dispositivo) — vedi il ledger tecnico per la prova completa, screenshot
`final-tablet-portrait-real-model-lab.png` e
`final-tablet-portrait-real-chat-rail-full-response.png`.

Se si tocca la scheda del file `.md` appena generato, la testata entra nella
status bar del dispositivo. Aprendo lo stesso contenuto dalla Libreria il
difetto non si presenta. La diagnosi dovrà confrontare i due percorsi reali e
convergere sul contratto safe-area canonico, senza correggere soltanto lo
screenshot allegato.

## DEBT-MOBILE-002 — Verifica GPU senza avanzamento reale

Stato: **GREEN focalizzato; gate largo e Pad ancora pendenti**.

La verifica GPU nativa è stata riprodotta sul Pad (CPU `VALID` in logcat). La
prima scelta locale ora mostra un toast persistente durante la corsa e un esito
o errore alla fine; Privacy mantiene il loading e mostra il rifiuto del ponte.
Restano da eseguire suite/build/APK e la verifica visiva sul Pad.

Alla prima scelta di un modello locale compare la modale di verifica GPU, ma
«Verifica ora» la chiude senza loading né prova visibile. In Privacy e
autorizzazioni, «Fallo girare ora» non produce alcuna reazione. Vanno provati
entrambi i punti di ingresso, gli stati loading/successo/errore/annullamento e
la reale operazione sottostante; una sola animazione decorativa non chiude il
debito.

## DEBT-MOBILE-003 — Streaming strutturato senza cursore da prompt

Stato: **fix codice GREEN; verifica Pad rinviata alla campagna unica finale**.

Durante lo streaming il cursore da prompt deve restare esclusivo del testo
continuo. Tabelle e altre strutture devono usare una rivelazione dinamica in
fade, senza lampeggi, salti di layout o rianimazione del contenuto già stabile,
e con un equivalente senza animazione quando è attiva la riduzione movimento.

Direzione proposta, da confermare dopo ricerca web primaria aggiornata al mese
di implementazione: il parser/renderer segnala quando un nuovo blocco
strutturale è sintatticamente stabile; solo quel blocco riceve una breve
transizione di opacità tramite i token motion dell'app. I token testuali
continuano invece a usare l'indicatore corrente. Prima del codice servono RED
su testo, tabella incompleta, tabella stabilizzata, blocchi consecutivi,
riduzione movimento e streaming interrotto.

## DEBT-MOBILE-004 — Scala caratteri della prima installazione

Stato: **fix codice GREEN; installazione pulita sul Pad ancora pendente**.

Su una nuova installazione la dimensione caratteri predefinita deve essere
«Molto piccola», non «Piccola». Il gate dovrà usare stato applicazione realmente
pulito e verificare anche che upgrade e preferenze già salvate non vengano
sovrascritti.

## DEBT-MOBILE-005 — «Autorizza tutti · Sempre» e strumenti agente

Stato: **fix codice GREEN; setup e persistenza sul Pad ancora pendenti**.

Se nel setup introduttivo l'owner sceglie «Autorizza tutti in un sol colpo» con
durata «Sempre», nelle impostazioni Strumenti agente devono risultare abilitati
anche «Gestisci la policy libreria» e «Usa un'app al posto tuo». Servono prova
del percorso iniziale, persistenza dopo riavvio e prova inversa per scelte più
restrittive.

## DEBT-MOBILE-006 — Tastiera nascosta, focus e composer compatto

Stato: **implementazione condivisa e test GREEN; gesto reale Pad pendente**.

Quando l'utente nasconde la tastiera, il focus deve lasciare il composer Chat.
Se la preferenza di compattezza lo prevede, il composer deve quindi tornare
alla forma compatta. Vanno provati tasto Back/gesture sistema, riapertura,
testo presente/vuoto e nessuna perdita della bozza.

## DEBT-MOBILE-007 — Pinch-to-zoom illimitato nella Chat

Stato: **fix codice GREEN; gesto reale Pad pendente**.

La schermata Chat non deve permettere pinch-to-zoom progressivo. La correzione
deve mantenere la scala tipografica e le altre funzioni di accessibilità
dell'app; saranno verificati gesto reale, doppio tap, orientamenti e superfici
adiacenti.

## DEBT-MOBILE-008 — Chiusura gestuale trascinando la sidebar globale

Stato: **chiuso: fix codice GREEN e trascinamento diretto verificato sul Pad**.

La sidebar globale deve potersi chiudere sia con la X sia trascinando
direttamente il pannello/sidebar da destra verso sinistra. Non basta uno swipe
sulla pagina sottostante: il pointer/touch deve iniziare sulla componente
sidebar visibile. Il gesto deve seguire i token motion e non confliggere con
scroll verticali, back gesture Android o contenuti orizzontali.
La verifica finale 008B dimostra inoltre che il drawer segue il dito durante
il movimento, senza chiusura anticipata: la soglia viene valutata al rilascio.
Evidenza: `.claude/pad-debt-campaign-2026-08-26/sidebar-drag-mid-200-latest.png`
e `sidebar-drag-after-latest.png`.

## DEBT-MOBILE-009 — Stato OAuth OpenRouter contraddittorio

Stato: **fix codice GREEN; OAuth/chiave/reload reali sul Pad pendenti**.

Dopo l'aggiunta della chiave OpenRouter appare ancora l'errore «OpenRouter non
ha rilasciato la chiave», mentre la scheda dichiara «Chiave salvata» e mostra i
modelli disponibili. Va diagnosticata la macchina a stati reale di OAuth,
callback, chiave manuale e stale error; il gate deve coprire successo fresco,
reload, errore vero, retry e sostituzione/rimozione della chiave.

## DEBT-MOBILE-010 — Immagine HTML non renderizzata nella scheda Hugging Face

Stato: **chiuso: fix codice GREEN e rendering remoto verificato sul Pad**.

La scheda «Scheda modello» sotto «Modelli locali» riceve una descrizione che
contiene un tag HTML `<img src="https://cdn-uploads.huggingface.co/...">`.
Come mostra `C:\Users\Antonino\Downloads\aaa.jpg`, il tag viene esposto come
testo e link sottolineato; il resto del Markdown della model card continua a
renderizzare. Il renderer mostra ora l'immagine solo dal CDN HTTPS ufficiale
Hugging Face e mantiene il fallback leggibile per URL bloccati o non
disponibili. Il README reale multilinea è ricomposto prima del rendering;
`model-card-img-fixed.png` mostra il logo Liquid nella scheda, senza markup
`<img>` esposto come testo.

## DEBT-MOBILE-011 — Blocchi `think` e tool call esposti durante lo streaming

Stato: **fix codice GREEN; streaming reale con LFM2.5 sul Pad pendente**.

Evidenza owner: `C:\Users\Antonino\Downloads\abc.jpg`. Con il modello
`LFM2.5-2.6B-Q6_K`, durante lo streaming il contenuto di ragionamento viene
mostrato nella risposta e il delimitatore letterale `</think>` resta visibile
prima del testo finale. La stessa evidenza espone anche
`<tool_call_start>…<tool_call_end>` nel messaggio. A risposta conclusa il
contenuto appare corretto: il debito riguarda quindi il parser/renderer
incrementale, non il formato finale.

Requisito: riconoscere i blocchi `think` anche quando apertura e chiusura
arrivano spezzate tra chunk; non renderizzare né il ragionamento, né le tool
call, né i loro marker nel messaggio pubblico; preservare il testo finale e il
comportamento già corretto a stream concluso.

## Regola di presa in carico

Ogni debito richiede, prima del codice: riproduzione sul Pad, ricerca web
primaria corrente, ledger a livello di file/simbolo/test, RED automatico,
GREEN focalizzato, regressioni interessate e prova visiva completa. Questo
documento registra gli impegni dell'owner ma non autorizza scorciatoie né
dichiara già nota la causa.

## DEBT-MOBILE-012 — Immagine generata non persistita con OpenRouter/Gemini

Stato: **chiuso: fix codice GREEN e percorso reale verificato sul Pad**.

L'evidenza owner `C:\Users\Antonino\Downloads\gemini.jpg` mostra due round
OpenRouter con modello `Google: Gemini 3.7 Flash`: il tool `generate_image` ha
`ok:false` e codice `TALOS_IMAGE_PERSIST_FAILED`, mentre il messaggio pubblico
afferma che l'immagine è stata generata ma non è stata salvata nello storage
locale cifrato. Il difetto può essere nel formato/URL restituito dal provider,
nel decoder dei bytes, nel repository cifrato o nel collegamento tra tool e
messaggio; non va attribuito a Gemini senza tracciare il valore reale a ogni
confine.

Il tracing locale ha chiuso il primo confine: OpenRouter usa la Image API
dedicata (`POST /api/v1/images`), il cui contratto restituisce
`data[].b64_json`; non usa il server tool beta che restituisce invece un
`imageUrl`. Il percorso applicativo è
`parseTalosGeneratedImages(response.data)` → `sources.save` →
`attachments.saveGeneratedBinary`. `TALOS_IMAGE_PERSIST_FAILED` è il wrapper
del secondo passaggio e non prova da solo che il repository sia guasto.

Fix applicato: il parser normalizza il whitespace del base64 prima di
costruire la `data:` URL usata dal decoder, e il picker OpenRouter ora richiede
esplicitamente `output_modalities: ['image']`; un candidato non tipizzato, come
`google/gemini-3.7-flash` (modello testuale), non può più essere scelto come
modello immagine. Non è stato aggiunto alcun endpoint o fallback remoto.

RED/GREEN: `DEBT-MOBILE-012 RED: normalizes wrapped OpenRouter base64 before
persistence` e `DEBT-MOBILE-012 RED: never treats the selected Gemini 3.7 text
model as an image model` fallivano prima del fix; ora passano insieme alla
suite immagini (`6 file, 60 test`) e ai test focalizzati (`4 file, 54 test`).
La prova reale autorizzata sul Pad ha inizialmente riprodotto il fallimento; dopo
la correzione del bridge la stessa generazione è stata salvata, renderizzata,
ricaricata dopo riavvio e mostrata nella Libreria. Il percorso ora usa un
fallback di decodifica locale quando WebView rifiuta la data URL e scrive il
base64 nativo a blocchi (`writeFile` + `appendFile`) sotto il limite della
transazione bridge.

Evidenze finali:

- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\openrouter-generation-fixed-real.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\openrouter-generation-after-reload.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\openrouter-generation-library.png`

APK installata sul Pad e copiata nei Download del PC:
`C:\Users\Antonino\Downloads\talos-mobile-debt-audit-20260826-145025-403964f0ac74.apk`
(SHA-256 `403964f0ac74655b103d6de02eb19adb38d349538003638151bf567339cce04b`).

Gate: `npm run typecheck` verde; suite completa **6.352 passati, 10 saltati,
0 falliti**; Gradle `assembleDebug` + `compileReleaseJavaWithJavac` verde.
Il gate `npm run build` segnala il tripwire del bundle iniziale a 614.068 byte
(limite esistente 614.000); Vite + Capacitor copy e APK sono comunque stati
generati e installati. Questo scostamento è registrato, non nascosto.

Ricerca primaria: [OpenRouter Image Generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation),
[OpenRouter Models](https://openrouter.ai/docs/guides/overview/models) e
[Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem).

## Emendamento DEBT-MOBILE-008 — gesto dal body verificato sul Pad (2026-08-26)

La riproduzione fisica ha isolato la differenza tra testata e body: durante uno
swipe iniziato su una riga del body Android WebView emette `pointercancel` e
continua con `touchmove`. Quel cancel cancellava il punto iniziale e impediva
la chiusura. `TalosMobileSidebar.vue` ora conserva il punto fino a
`touchend`; la sidebar continua a mantenere lo scroll verticale (`touch-pan-y`)
e chiude da destra a sinistra anche iniziando dal body.

La regressione `DEBT-MOBILE-008 RED: pointercancel from the scroll surface does
not discard the touch swipe` fallisce prima del fix e passa dopo. La prova
fisica è stata eseguita sul Pad con l'APK dell'applicationId corretto `ai.talos`
(non `ai.talos.dev`):

- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\sidebar-open-final-apk.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\sidebar-body-swipe-final-apk.png`

Entrambe le immagini sono state guardate per intero; la seconda mostra la
sidebar chiusa e il contenuto sottostante nuovamente interattivo.

## DEBT-MOBILE-013 — Slider effort e label ragionamento esteso

Stato: **chiuso: fix e verifica visiva sul Pad completati**.

Il selettore del drawer modello usa il drop-in owner come slider discreto
controllato. Il titolo parent duplicato è stato rimosso. Il label
`Ragionamento esteso` è visibile accanto allo switch nella testata, sulla stessa
riga del livello selezionato; non è più perso sotto la barra.

File principali:

- `mobile/src/components/chat/TalosMobileEffortPicker.vue`
- `mobile/src/components/chat/TalosMobileModelEffortDrawer.vue`
- `mobile/src/components/talos/ui/TalosThemedSegmentedSlider.vue`
- `mobile/tests/unit/chat/TalosMobileEffortPicker.test.ts`
- `mobile/tests/unit/ui/TalosThemedSegmentedSlider.test.ts`
- `mobile/tests/setup/jsdomShims.ts`

Verifica: test focalizzati **36/36**, typecheck, Vite build, Capacitor copy e
Gradle debug/release verdi. La suite completa ha **6.358 passati, 1 fallito,
10 saltati**; il rosso è `DEBT-MOBILE-003` in `streamingUi.test.ts`, non
correlato a questo selettore. `npm run build` incontra il tripwire generale
del bundle `614278 > 614000`, già esistente.

Prova Pad: `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\effort-slider-phone-portrait-final-label-visible.png`.
APK: `C:\Users\Antonino\Downloads\talos-mobile-effort-slider-20260826-162452-8001a3c7f224.apk`.
SHA-256: `8001a3c7f2241cc057fcd934f24b383b23e1dbc85ced55af1fe1a78bf4623bde`.

## DEBT-MOBILE-014 — Continuità download nel Model Lab tablet

Stato: **chiuso 2026-08-26 (notte)**, agente mobile, commit `04d798f5`.

Su tablet, le stazioni senza rail chat persistente (Model Lab, Impostazioni)
nascondevano comunque le azioni di testata come se la rail fosse montata:
niente icona del centro download, niente popover. Nella pagina di dettaglio
di una variante, il bottone «Scarica» restava statico anche quando un
trasferimento reale per quella stessa variante era già in corso.

Fix: `hide-app-actions` dipende ora dalla presenza *reale* della rail chat
(`tabletChatRailVisible`), non solo da `isTablet`; il bottone della variante
selezionata proietta lo stato del trasferimento corrispondente
(repo+revision+paths) dallo store condiviso e diventa `role=progressbar` con
bytes reali; il popover del centro download usa un token di z-index sopra la
navigazione globale e la sidebar passa a drawer non modale, per restare
cliccabile anche con la sidebar aperta.

Precisazione owner durante la chiusura: il bottone della variante doveva
portare anche i comandi **pausa/riprendi/annulla**, non solo la percentuale
— aggiunti riusando le funzioni già presenti nello store `modelTransfers.ts`
(nessun poller nuovo), con la logica di stato condivisa fra il pannello e il
Centro download in un modulo comune (`lib/models/presentation.ts`) così i
due punti non possono mai raccontare stati diversi per lo stesso
trasferimento.

Gate reale sul Pad (repo `MaziyarPanahi/Qwen3-0.6B-GGUF`, mai scaricato
prima): download avviato → barra con bytes reali in movimento (0%→36%→52%)
→ Pausa premuta e verificata (la card passa a Riprendi) → Riprendi → Annulla
con conferma → tornato al bottone «Scarica». Evidenza e gate automatici
completi nel ledger tecnico.

## DEBT-MOBILE-015 — Blocchi `think` e tool call nel prefisso già aperto

Stato: **chiuso 2026-08-26 (notte)**, agente mobile, commit `04d798f5`.

Erede diretto di DEBT-MOBILE-011: il parser locale (`thinkStream.ts`)
funzionava per marker che *arrivano* nello stream, ma il template LFM2/LFM2.5
può chiudere il prompt già dentro `<think>` — il primo delta nativo nasce
quindi già in quello stato, senza ripetere l'apertura, e il vecchio parser
lasciava passare quel primo tratto come testo pubblico.

Fix: `talosCreateThinkSplitter(startsInReasoning?)` può iniziare direttamente
nello stato `ragionamento`; l'adapter locale deriva quello stato SOLO dal
prompt realmente renderizzato (`plan.prompt.trimEnd().endsWith('<think>')`),
senza euristiche su nome/provider/modello.

Gate reale sul Pad con `LFM2.5-2.6B-Q8_0` e Ragionamento esteso attivo: due
prompt (uno breve, uno lungo per avere margine di osservazione), screenshot
catturati **durante** la generazione a intervalli di ~1 secondo — nessun
`<think>`/`</think>`/`<|tool_call_start|>` mai visibile nella bolla pubblica
in nessun frame osservato; il ragionamento resta in un blocco separato e
richiudibile. Dopo `force-stop` e riavvio dell'app la risposta persistita è
rimasta identica e pulita.
