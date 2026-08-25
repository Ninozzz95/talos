# Harness drawer layering — upstream conformance closure

Data: 2026-08-25

## Problema misurato

La suite `tests/unit/upstream/shadcnConformance.test.ts` confronta i 24 file
generati da `shadcn-vue@2.8.0` con gli hash upstream congelati. Il lavoro
Harness del commit `9e939800` ha esteso intenzionalmente
`mobile/src/components/ui/drawer/DrawerContent.vue` con la prop locale
`overlayClass`, inoltrata a `DrawerOverlay`. Questa porta consente alla sidebar
globale di assegnare allo sfondo oscurante lo stesso livello superiore del
contenuto, impedendo che Codice resti sopra una parte della navigazione.

Il file locale vale
`bcb7ce90f3d336b3d0850fffa4d1490c0a88eee48053d2e8a49050cb7efe5e01`; il
manifest conserva correttamente l'hash upstream immutabile
`4b6261a328f0eca2171c61b382c6241b54996c2c5366f24bf4c1502f8834c531`, ma non
registrava ancora la variante accettata.

## Fonti ufficiali e pin

- Documentazione Drawer ufficiale shadcn-vue:
  https://www.shadcn-vue.com/docs/components/drawer
- Repository ufficiale `unovue/shadcn-vue`:
  https://github.com/unovue/shadcn-vue
- Pacchetto npm verificato il 25/8 con `npm view shadcn-vue@2.8.0`:
  versione `2.8.0`, integrità
  `sha512-iCRrUYGJ52rJkivBpk+O2ZW+2u30UOvA4sMTu8kw24r2UPkpO57NwLBMegPeC/ifPESSiOOrtMjvYTV5lpCf9w==`,
  licenza MIT, repository `https://github.com/unovue/shadcn-vue.git`.

La documentazione ufficiale descrive Drawer come componente mobile e il
repository dichiara esplicitamente che i componenti sono open code,
personalizzabili ed estendibili dall'app che li possiede. L'upstream genera
`DrawerOverlay` dentro `DrawerContent`; senza una porta locale il consumatore
non può assegnare una classe diversa al solo overlay.

## Decisione upstream

**Adattare dietro il wrapper TALOS già posseduto.** Conservare intatto l'hash
upstream nel record `files`, aggiungere un record chiuso in `adaptations` con
hash accettato, motivo e questo dossier. Nessun nuovo package, fork o copia del
componente. Il test continua a rifiutare qualsiasi hash diverso da upstream o
dalla singola variante dichiarata.

Alternative respinte:

- rimuovere `overlayClass`: riapre la regressione visiva in cui la navigazione
  globale finisce sotto Codice;
- rendere generico il test o accettare qualunque hash: elimina il drift gate;
- applicare un selettore globale fragile al portal overlay: legherebbe TALOS
  all'ordine DOM invece che a una porta esplicita e tipizzata.

Scenario permanente: `HARNESS-DRAWER-UPSTREAM-ADAPTATION-01`.
