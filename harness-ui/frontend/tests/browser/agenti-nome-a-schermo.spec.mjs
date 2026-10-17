/*
 * Il NOME di un agente e i suoi FILE a schermo, nel pannello Agenti e nel suo dettaglio (13/10/2026 sera).
 * La seconda passata del bugfixer ha trovato il carattere di inversione della scrittura (U+202E) nel diagramma
 * (`SECONDA-NOME-03`, `SECONDA-FILE-01`); curato lì, la foto mostrava lo stesso nome capovolto nel pannello accanto:
 * «Leggi fotoe exe.jpg imussair». Una funzione sola per tutti (`src/components/testo-a-schermo.js`).
 * Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { apri, figlia, finita } from './aiuto-deleghe-diagramma.mjs';

/* un carattere dal suo numero: quelli che cambiano il verso della scrittura non si vedono, e in un sorgente non devono stare crudi */
const car = (...codici) => String.fromCodePoint(...codici);
const INVERTE = new RegExp(`[${car(0x202A)}-${car(0x202E)}${car(0x2066)}-${car(0x2069)}${car(0x200E)}${car(0x200F)}${car(0x061C)}]`, 'u');
const NOME = `Leggi foto${car(0x202E)}gpj.exe e riassumi`;
const FILE = `immagini/foto${car(0x202E)}gpj.exe`;
const scena = () => [
  finita('a', 10, 70, { taskCorto: NOME, task: `Sei un agente delegato.\n${NOME}`, attivita: { file: [{ percorso: 'src/prezzi.js', letto: true, scritto: true }, { percorso: FILE, letto: true }], chiamate: 2, passi: [] } }),
  figlia('b', 12, { taskCorto: 'Controlla le valute' }),
];

test('AGENTI-NOME-01 — nel pannello Agenti il nome di un agente non porta il carattere di inversione: riga, nome letto, descrizione', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { scritture } = await apri(page, scena());
  const riga = page.locator('#railAgenti [data-sessione-figlia="a"]');
  await expect(riga).toBeVisible();
  const visti = await riga.evaluate((n) => ({ testo: n.innerText, nomeLetto: n.getAttribute('aria-label') ?? '', titoli: [...n.querySelectorAll('[title]')].map((x) => x.getAttribute('title')).join('|') }));
  expect(Object.entries(visti).filter(([, v]) => INVERTE.test(v)).map(([k]) => k), `il carattere di inversione arriva a schermo nel pannello: ${JSON.stringify(visti.testo)}`).toEqual([]);
  // il controllo positivo: il nome c'è, e si legge nel verso giusto
  expect(visti.testo).toContain('Leggi fotogpj.exe e riassumi');
  // AL CONTRARIO: un nome normale resta com'è
  await expect(page.locator('#railAgenti [data-sessione-figlia="b"]')).toContainText('Controlla le valute');
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

test('AGENTI-NOME-02 — nel dettaglio dell’agente (pannello): nome, consegna e file senza quel carattere; il file resta nell’elenco e si apre col suo percorso VERO', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, scena());
  await grafo.getByRole('button', { name: 'Torna alla chat', exact: true }).click();
  await page.locator('#railAgenti [data-sessione-figlia="a"]').click();
  const dettaglio = page.locator('[data-c="DettaglioAgente"]');
  await expect(dettaglio).toBeVisible();
  const visti = await dettaglio.evaluate((n) => ({ testo: n.innerText, titoli: [...n.querySelectorAll('[title]')].map((x) => x.getAttribute('title')).join('|') }));
  expect(Object.entries(visti).filter(([, v]) => INVERTE.test(v)).map(([k]) => k), `il carattere di inversione arriva a schermo nel dettaglio dell’agente: ${JSON.stringify(visti.testo.slice(0, 200))}`).toEqual([]);
  expect(visti.testo).toContain('Leggi fotogpj.exe e riassumi');
  // i file: due righe, quella dal nome ingannevole c'è (è un fatto), a schermo pulita, e porta il percorso vero per aprirla
  const file = dettaglio.locator('.talos-agente__file');
  await expect(file.first()).toBeVisible();
  const righe = await file.evaluateAll((n) => n.map((x) => ({ testo: x.innerText, percorso: x.dataset.percorso })));
  // il dettaglio li elenca in più di un posto (panoramica e sezione File): i file DIVERSI sono due
  expect(new Set(righe.map((r) => r.percorso)).size, JSON.stringify(righe.map((r) => r.testo))).toBe(2);
  expect(righe.some((r) => r.testo.includes('fotogpj.exe')), JSON.stringify(righe.map((r) => r.testo))).toBe(true);
  expect(righe.some((r) => r.percorso === FILE), 'il percorso vero resta sul pulsante: è quello che apre il file').toBe(true);
  expect(errori).toEqual([]);
});
