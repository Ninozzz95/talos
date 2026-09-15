// Eseguito dal Node incluso in Electron, prima del vero server. Solo IPC privato.
// Su Windows SIGTERM da ChildProcess.kill forza la terminazione: il messaggio
// permette invece al server esistente di chiudere PTY e risorse con il suo handler.
let chiusura = false;
function chiudi() {
  if (chiusura) return;
  chiusura = true;
  const timer = setTimeout(() => process.exit(0), 4500);
  timer.unref();
  if (process.listenerCount('SIGTERM')) process.emit('SIGTERM');
  else process.exit(0);
}
process.on('message', messaggio => {
  if (messaggio?.tipo === 'chiudi') chiudi();
  if (messaggio?.tipo === 'misura' && process.connected) process.send({ tipo: 'misura', pid: process.pid, versions: process.versions, memoria: process.memoryUsage() }, () => {});
});
process.once('disconnect', chiudi);
// Non propagare la modalità speciale alle shell aperte dal Terminale.
delete process.env.ELECTRON_RUN_AS_NODE;
