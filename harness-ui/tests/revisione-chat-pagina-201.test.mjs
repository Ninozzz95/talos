/*
 * Adversarial review of the "chat and page" block (05/11/2026), decision 201 (`browser_page`).
 * Each test states the behaviour the decision needs; a RED test is a finding (see REVISIONE-BLOCCO-CHAT-E-PAGINA-2026-11-05.md).
 * Source for the redaction list: keyhog url_redaction.rs, docs.rs (read 05/11/2026): case-insensitive names, presigned signatures.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { indirizzoPulito, notaPaginaBrowser } from '../src/kernel/pagina-del-browser.mjs';
import { creaLeggiPaginaBrowser } from '../src/pagina-browser-ospite.mjs';

test('REV201-SEGRETI-01: the address the model sees hides the values of common credential parameters', () => {
    const segreti = ['api_key', 'apikey', 'id_token', 'refresh_token', 'client_secret', 'X-Amz-Signature', 'X-Amz-Security-Token', 'jwt', 'auth_token', 'sessionid', 'sid', 'pwd'];
    const trapelati = segreti.filter((nome) => indirizzoPulito(`https://example.com/p?${nome}=VALORE-SEGRETO&q=1`).includes('VALORE-SEGRETO'));
    assert.deepEqual(trapelati, [], `parametri con valore in chiaro nella nota: ${trapelati.join(', ')}`);
});

test('REV201-SEGRETI-02: the note carries no secret from the query string', () => {
    const nota = notaPaginaBrowser({ url: 'https://example.com/cb?api_key=VALORE-SEGRETO', titolo: 'x' });
    assert.ok(!nota.includes('VALORE-SEGRETO'));
});

test('REV201-VIVA-01: the live lane reads the tab only if it still shows the page the note named', async () => {
    /* a second conversation (same window, one live tab) opened another page in the meantime */
    const browser = {
        stato: () => ({ schede: [{ sessionId: 'browser-di-questa-pagina', url: 'https://banca.example/conto' }] }),
        leggi: async () => ({ url: 'https://banca.example/conto', testo: 'SALDO 12345' }),
    };
    const leggi = creaLeggiPaginaBrowser({ browserVivoFn: () => browser, leggiPaginaFn: async () => ({ corpo: 'copia pubblica' }) });
    const esito = await leggi({ pagina: { url: 'https://giornale.example/articolo', titolo: 'Articolo', via: 'vivo' } });
    assert.ok(!(esito.ok === true && /SALDO/.test(esito.testo)), 'il modello ha letto una pagina diversa da quella detta nella nota, senza carta');
});
