/*
 * ⭐⭐⭐ B1 slice 19 — THE KERNEL'S CREDENTIAL DENYLIST, COPIED INTO THE CLI AND PINNED TO THE KERNEL.
 *
 * ⛔⛔ NOT FOR ANYTHING THAT REACHES A COMMAND LINE. Round 1 of this slice used this rule to filter the
 *   environment the MXC SDK serialises as `--config-base64` on the `wxc-exec.exe` command line, and
 *   adversarial review measured 24 of 29 realistic secret-bearing names that carry no credential shape
 *   (DATABASE_URL, SENTRY_DSN, GH_PAT, MYSQL_PWD, HTTPS_PROXY with credentials, …) decoded out of it. A
 *   name-shape denylist cannot know what a VALUE holds. The probe now carries an allowlist
 *   (`PROBE_ENVIRONMENT_NAMES`, `execution-backends.ts`) and a brokered command carries no environment.
 *   Today this module has no production consumer; it stays, with its parity test, as the one CLI copy of
 *   the kernel's rule for a child whose environment never touches a command line.
 *
 * ⛔ THIS IS THE KERNEL'S RULE, COPIED, NOT A SECOND OPINION. `harness-ui/src/kernel/talosHarness.mjs`
 *   already scrubs every child it starts with `ambienteSenzaCredenziali()`: a denylist by SHAPE
 *   (a closed list covered one key in five) with its non-secrets declared one by one. The kernel does
 *   not export the shape or the exceptions, so they are copied letter for letter, and
 *   `test/security/credential-free-environment.test.ts` reads the kernel source and judges a table of
 *   names with the kernel's own `eUnaCredenziale`: a drift on either side turns it red.
 * ⛔ A denylist and not an allowlist, for the kernel's reason: a typed `npm test` needs dozens of
 *   variables nobody can list in advance.
 */

/** Named explicitly by the kernel as well as matched by shape (`CHIAVI_CREDENZIALI_DA_NASCONDERE`). */
export const CREDENTIAL_NAMES_ALWAYS_HIDDEN:readonly string[]=Object.freeze(['OPENROUTER_API_KEY']);

/** The kernel's `FORMA_DI_CREDENZIALE`, byte for byte. Deliberately wide: what is not a secret is listed below. */
export const CREDENTIAL_NAME_SHAPE=/TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|_KEY$|^KEY_|APIKEY|API_KEY|ACCESS_KEY|AUTH/i;

/**
 * The kernel's `NON_SONO_SEGRETI`: names the shape matches by accident and that real commands need.
 * `SSH_AUTH_SOCK` is the agent socket path (without it `git push` inside a command stops working),
 * `GPG_AGENT_INFO` the same for signatures, `KEYBOARD_LAYOUT` and `AUTHORITY` match by chance.
 */
export const NOT_CREDENTIALS:ReadonlySet<string>=new Set(['SSH_AUTH_SOCK','GPG_AGENT_INFO','KEYBOARD_LAYOUT','AUTHORITY']);

/** True when a variable of this name must not enter a child process. The same verdict as the kernel's `eUnaCredenziale`. */
export function isCredentialName(name:string):boolean{
  const key=String(name??'');
  if(NOT_CREDENTIALS.has(key))return false;
  if(CREDENTIAL_NAMES_ALWAYS_HIDDEN.includes(key))return true;
  return CREDENTIAL_NAME_SHAPE.test(key);
}

/**
 * A fresh object with every variable of `source` whose name is not a credential. Never the live
 * `process.env`: a caller that later mutates the result cannot touch this process's environment, and
 * an `undefined` value is left out rather than turned into the string "undefined".
 */
export function credentialFreeEnvironment(source:Record<string,string|undefined>=process.env):Record<string,string>{
  const clean:Record<string,string>={};
  for(const [name,value] of Object.entries(source)){
    if(value===undefined||isCredentialName(name))continue;
    clean[name]=value;
  }
  return clean;
}
