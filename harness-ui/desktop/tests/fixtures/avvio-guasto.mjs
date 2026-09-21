import { app, dialog, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
app.setAppPath(root);
globalThis.r01Dialoghi = [];
dialog.showMessageBox = async opzioni => {
  globalThis.r01Dialoghi.push(opzioni);
  return new Promise(resolve => { globalThis.r01Rispondi = response => resolve({ response }); });
};
shell.openPath = async () => { globalThis.r01RegistroAperto = true; return ''; };
await import(pathToFileURL(join(root, 'main.mjs')).href);
