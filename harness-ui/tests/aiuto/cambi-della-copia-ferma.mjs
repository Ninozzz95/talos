/*
 * I SOLI cambi della copia ferma della 0.2.1 (`src/kernel/fermo-0.2.1-5e9fdc1b9/cancellazioni-critiche.mjs`) rispetto al file del commit
 * 5e9fdc1b9 (nono giro dei permessi, 14/11/2026, giudice v1880-v1881): l'ambiente letto UNA volta per chiamata, solo nel modo di leggere.
 * `permessi-doppio-controllo.test.mjs` (FERMO-COMMIT) applica questi cambi, uno per uno e ognuno una volta sola, al file del commit e
 * vuole gli stessi byte della copia ferma: un byte cambiato altrove è una prova rossa.
 */
export const IMPRONTA_DELLA_COPIA_FERMA = '9484d89beaab932317aaffefe646d402242ade59c11162cc9d75a42c84ea1ea8';

export const CAMBI_DELLA_COPIA_FERMA = Object.freeze([
  [
    `  const trovato = Object.entries(ctx.ambiente ?? {}).find(([k]) => (ctx.windows ? k.toUpperCase() === n : k === n))
  return typeof trovato?.[1] === 'string' && trovato[1] !== '' ? trovato[1] : null
}
`,
    `  const trovato = ambienteDi(ctx).get(n)
  return typeof trovato === 'string' && trovato !== '' ? trovato : null
}

/**
 * Nono giro dei permessi (14/11/2026, giudice v1880-v1881): l'UNICO cambio di questa copia ferma, solo nel modo di leggere, ogni risultato
 * identico. Prima ogni variabile (\`valoreDi\`) e, per le cartelle dei progetti, ogni bersaglio (\`veriDi\`) rifaceva
 * \`Object.entries(ctx.ambiente)\`: \`rm -rf "$a$a…$a"/x\` di 16 KB teneva il cancello 1,2-1,9 s. Ora l'ambiente si scorre UNA volta per
 * chiamata: la Map vive nel contesto, che nasce in \`cancellazioneCritica\` e muore con lei (mai tenuta fra due chiamate: una variabile
 * cambiata fra due comandi conta). Come prima vale la PRIMA voce col nome giusto (su Windows senza badare alle maiuscole), e le cartelle
 * dei progetti si leggono dal nome ESATTO \`TALOS_HARNESS_UI_PROJECT_DIRS\`, anche su Windows.
 */
function ambienteDi(ctx) {
  if (ctx.ambienteLetto) return ctx.ambienteLetto
  const voci = new Map()
  let progetti = null
  for (const [k, v] of Object.entries(ctx.ambiente ?? {})) {
    const n = ctx.windows ? k.toUpperCase() : k
    if (!voci.has(n)) voci.set(n, v)
    if (progetti === null && k === 'TALOS_HARNESS_UI_PROJECT_DIRS') progetti = cartelleDeiProgetti(v)
  }
  ctx.progettiDellAmbiente = progetti ?? []
  return (ctx.ambienteLetto = voci)
}
`,
  ],
  [
    `const cartelleDeiProgetti = (ambiente) => {
  const grezzo = Object.entries(ambiente ?? {}).find(([k]) => k === 'TALOS_HARNESS_UI_PROJECT_DIRS')?.[1]
  return typeof grezzo === 'string' ? grezzo.split(';').map((x) => x.trim()).filter(Boolean) : []
}
`,
    `const cartelleDeiProgetti = (grezzo) => (typeof grezzo === 'string' ? grezzo.split(';').map((x) => x.trim()).filter(Boolean) : [])
`,
  ],
  [
    `  const progetti = cartelleDeiProgetti(ctx.ambiente)
`,
    `  const progetti = (ambienteDi(ctx), ctx.progettiDellAmbiente)
`,
  ],
]);

/** Applica i cambi al testo del file del commit: `null` se un pezzo da cambiare non c'è esattamente una volta. */
export function applicaICambi(testo) {
  let t = testo;
  for (const [prima, dopo] of CAMBI_DELLA_COPIA_FERMA) {
    if (t.split(prima).length !== 2) return null;
    t = t.replace(prima, () => dopo);
  }
  return t;
}
