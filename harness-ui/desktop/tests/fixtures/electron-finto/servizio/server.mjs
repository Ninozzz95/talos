/*
 * Il servizio locale FINTO che `main.mjs` avvia (`TALOS_DESKTOP_HARNESS_DIR` punta qui): ascolta solo su 127.0.0.1, alla porta che gli dà
 * il guscio, scrive la stretta di mano e risponde a `/api/v1/health`. Nessun modello, nessun portachiavi, nessuna chiave.
 * Se ne va quando il guscio se ne va (`child-bootstrap.mjs`, «disconnect») e comunque dopo 60 secondi.
 */
import http from 'node:http';
import { writeFileSync } from 'node:fs';

const porta = Number(process.env.TALOS_HARNESS_UI_PORT);
const stretta = process.env.TALOS_HARNESS_UI_REPORT_FILE;
const server = http.createServer((req, res) => {
  if (req.url === '/api/v1/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return; }
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"ok":false}');
});
server.listen(porta, '127.0.0.1', () => { writeFileSync(stretta, JSON.stringify({ host: '127.0.0.1', port: porta })); });
process.once('SIGTERM', () => { server.close(); process.exit(0); });
setTimeout(() => process.exit(0), 60000);
