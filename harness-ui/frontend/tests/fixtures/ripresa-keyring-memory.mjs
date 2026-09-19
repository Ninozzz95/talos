// Solo test. Non importare da codice prodotto: nessun accesso al portachiavi OS.
const passwords = new Map();
export class Entry {
  constructor(service, account) { this.key = JSON.stringify([service, account]); }
  getPassword() { return passwords.get(this.key) ?? null; }
  setPassword(value) { passwords.set(this.key, value); }
  deletePassword() { passwords.delete(this.key); }
}
