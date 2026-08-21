# Fase 7 — ricognizione, non ancora decisione

> Mappa concreta dei tre passi che `DECISIONE-0.1.17.md` elenca al punto 3
> della risposta dell'owner. Fatta mentre la rimisura C0 girava sul
> dispositivo (2026-08-21). ⛔ Qui sotto sono FATTI verificati sul codice, non
> un'implementazione: i passi (b) e (c) toccano una politica e un file CI che
> `DECISIONE-0.1.17.md` §5 mette esplicitamente fra le cose «che non si
> decidono qui» — restano aperti finché non li guardi tu.

## (a) — spedire una libreria GPU nella build di rilascio

**Oggi**: `assembleRelease` (sia in `release.yml:255` sia in locale) non passa
mai `-PtalosResearchBackend`. Verificato: nessuna occorrenza in nessuno dei
due workflow. L'APK di rilascio è CPU-only per costruzione, non per scelta a
runtime.

**Cosa serve**: gli stessi due ingredienti che ho ricostruito per la mia
verifica locale — header Khronos (`CL/`) e un `libOpenCL.so` arm64 per il
*linking* — ma **non** presi dal telefono. Ho pescato il mio dal vendor del
Pad (`/vendor/lib64/libOpenCL.so`) solo perché mi serviva UN pin per
compilare; per la CI la libreria giusta è lo stub generico dell'ICD loader
Khronos (`KhronosGroup/OpenCL-ICD-Loader`, verificato raggiungibile ora), che
espone la stessa ABI standard e non lega la build a un chip preciso — il
driver vero si carica **a runtime** sul telefono della persona, non a build
time sul runner. Questo evita di vendorizzare un binario proprietario di un
singolo dispositivo dentro il repo.

⛔ Non fatto qui: decidere DOVE vive quello stub (vendorizzato nel repo? scaricato
al volo nel workflow?) è una scelta di supply-chain, e questo repo ha appena
chiuso F-01/F-02 sulla separazione di autorità della release — merita lo
stesso standard, non un colpo di mano.

## (b) — collegare la politica, correggendone la grandezza

**Oggi**: `TalosBackendChoice.choose()` non ha NESSUN chiamante in
`android/app/src/main/java/` — verificato con `grep ".choose("`, zero righe
fuori dal suo stesso test. `TalosLlamaPlugin` legge `gpuLayers` dalla
chiamata (`call.getInt("gpuLayers", 0)`) e lo porta fino a `nativeOpen` — il
lato Java/nativo è **già pronto a ricevere un valore vero**. Il buco è
tutto in TypeScript: `src/services/localEngine.ts:565` fa
`plugin.open({ path, ...options })`, e **nessun chiamante in `src/` assegna
mai `options.gpuLayers`** — verificato, zero righe. Risultato: sempre 0.

**Cosa NON basta**: ritoccare `WORTHWHILE_MARGIN` (oggi 1.25×). La metrica che
confronta è `Evidence.tokensPerSecond` — un numero solo, di decodifica. Questa
stessa sessione ha misurato che con la cura la decodifica GPU è **identica**
alla CPU (16.43→16.43 tok/s) e che su un prompt lungo può essere **più lenta**
(misura owner: 8.07 vs 8.51). Il vantaggio vero è nel **TTFT** — 50.5s → 7.9s
su un prompt da 2048 token — e quella cifra oggi non esiste da nessuna parte
in `Evidence`.

**Cosa serve**: `Evidence` porta un campo per il TTFT (o il prefill in
tok/s), e `choose()` confronta su quello, non sulla decodifica. Il margine
va ricavato da misure fresche — quelle della rimisura appena chiusa danno
CPU e GPU-con-cura nella STESSA configurazione (off/512), il confronto giusto
per fissare la soglia.

⛔ Non fatto qui: la forma esatta della nuova `Evidence`/`Decision` e la
soglia sono una decisione di prodotto — `DECISIONE-0.1.17.md` §5 la mette
esplicitamente fuori da quello che decide da sé, e le decisioni 1-3 sono
state approvate solo dopo un documento con prezzo misurato. Questa merita lo
stesso trattamento, non una riga cambiata di fretta.

## (c) — passare `gpuLayers` dal risultato invece dello zero

Meccanico una volta chiuso (b): il call site in `localEngine.ts:565` prende
il `Decision.backend` e, se non è `cpu`, passa `gpuLayers: -1` (tutti gli
strati, coerente con come li ho misurati in questa sessione) invece di
lasciare il campo assente.

## Cosa ho verificato con misure vere in questa sessione, utile a (b)

Nella configurazione vincitrice (off / microbatch 512 / con la cura
dell'abort), sullo stesso Pad:

| | CPU (floor) | OpenCL + cura |
|---|---:|---:|
| Stop nel prefill (9 giri) | p95 36 ms (owner, decisione 2) | **p95 36 ms** |
| decodifica dopo 2048 token | — | 16.43 tok/s, **identica** a senza cura |
| decodifica (prompt corto) | — | 19.59 tok/s, **identica** a senza cura |

La rimisura C0 completa (in corso mentre scrivo questo) aggiungerà il TTFT
CPU vs GPU nella stessa configurazione — il numero che manca per fissare la
soglia di (b).
