/*
 * ⭐ 27/09/2026, decisione owner (memoria `decisioni-owner-capacita-sezioni-27-09`, punto 1: «memoria come Hermes») — GLI
 *   SCHEMI D'ATTACCO CHE NON ENTRANO NEL PROMPT. Le memorie entrano nel prompt di ogni sessione nuova: una voce avvelenata
 *   resterebbe lì per sempre. Hermes le controlla quando le carica e al posto di quella colpevole scrive una nota «bloccata»
 *   (`tools/memory_tool_store.py:125-137`: «live lists keep the raw text so the user can see and remove poisoned entries»).
 *
 * Porto di `tools/threat_patterns.py` di Hermes Agent (Nous Research, licenza MIT, clone `65ad529` del 23/09/2026), ambito
 *   «strict» — quello che Hermes usa per la memoria, e che comprende tutti gli schemi (`_SCOPE_SETS`: all ⊂ context ⊂
 *   strict). Stessi identificativi, stesse regex; stessa normalizzazione NFKC, e i caratteri invisibili si guardano sul
 *   testo GREZZO (NFKC potrebbe toglierli). Unica differenza: `hermes_env`/`hermes_config_mod` parlano dei file di Hermes
 *   e qui non hanno senso — restano, perché innocui, e un giorno potrebbero servire contro un testo copiato da là.
 * PURO: niente I/O.
 */

const MAX_CARATTERI = 65_536;
const RIEMPITIVO = String.raw`(?:\w+\s+){0,8}`;
const VARIABILE_SEGRETA = String.raw`\$\{?\w*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)S?\b`;
const MODIFICA = String.raw`(update|modify|edit|write|change|append|add\s+to)\s+[^\n]{0,2048}`;

/** [regex, id] — l'ordine è quello di Hermes. */
const SCHEMI = [
  [String.raw`ignore\s+${RIEMPITIVO}(previous|all|above|prior)\s+${RIEMPITIVO}instructions`, 'prompt_injection'],
  [String.raw`system\s+prompt\s+override`, 'sys_prompt_override'],
  [String.raw`disregard\s+${RIEMPITIVO}(your|all|any)\s+${RIEMPITIVO}(instructions|rules|guidelines)`, 'disregard_rules'],
  [String.raw`act\s+as\s+(if|though)\s+${RIEMPITIVO}you\s+${RIEMPITIVO}(have\s+no|don't\s+have)\s+${RIEMPITIVO}(restrictions|limits|rules)`, 'bypass_restrictions'],
  [String.raw`<!--[^>]{0,512}(?:ignore|override|system|secret|hidden)[^>]{0,512}-->`, 'html_comment_injection'],
  [String.raw`<\s*div\s+style\s*=\s*["'][^>]{0,2048}display\s*:\s*none`, 'hidden_div'],
  [String.raw`translate\s+[^\n]{0,512}\s+into\s+\w+(?:[\s-]+\w+){0,2}\s+and\s+(execute|run|eval)\b`, 'translate_execute'],
  [String.raw`do\s+not\s+${RIEMPITIVO}tell\s+${RIEMPITIVO}the\s+user`, 'deception_hide'],
  [String.raw`you\s+are\s+${RIEMPITIVO}now\s+(?:a|an|the)\s+`, 'role_hijack'],
  [String.raw`pretend\s+${RIEMPITIVO}(you\s+are|to\s+be)\s+`, 'role_pretend'],
  [String.raw`output\s+${RIEMPITIVO}(system|initial)\s+prompt`, 'leak_system_prompt'],
  [String.raw`(respond|answer|reply)\s+without\s+${RIEMPITIVO}(restrictions|limitations|filters|safety)`, 'remove_filters'],
  [String.raw`you\s+have\s+been\s+${RIEMPITIVO}(updated|upgraded|patched)\s+to`, 'fake_update'],
  [String.raw`\bname\s+yourself\s+\w+`, 'identity_override'],
  [String.raw`register\s+(as\s+)?a?\s*node`, 'c2_node_registration'],
  [String.raw`(heartbeat|beacon|check[\s\-]?in)\s+(to|with)\s+`, 'c2_heartbeat'],
  [String.raw`pull\s+(down\s+)?(?:new\s+)?task(?:ing|s)?\b`, 'c2_task_pull'],
  [String.raw`connect\s+to\s+the\s+network\b`, 'c2_network_connect'],
  [String.raw`you\s+must\s+(?:\w+\s+){0,3}(register|connect|report|beacon)\b`, 'forced_action'],
  [String.raw`only\s+use\s+one[\s\-]?liners?\b`, 'anti_forensic_oneliner'],
  [String.raw`never\s+${RIEMPITIVO}(?:create|write)\s+${RIEMPITIVO}(?:script|file)\s+${RIEMPITIVO}disk`, 'anti_forensic_disk'],
  [String.raw`unset\s+\w*(?:CLAUDE|CODEX|HERMES|AGENT|OPENAI|ANTHROPIC)\w*`, 'env_var_unset_agent'],
  [String.raw`\b(?:cobalt\s*strike|sliver|havoc|mythic|metasploit|brainworm)\b`, 'known_c2_framework'],
  [String.raw`\bc2\s+(?:server|channel|infrastructure|beacon)\b`, 'c2_explicit'],
  [String.raw`\bcommand\s+and\s+control\b`, 'c2_explicit_long'],
  [String.raw`curl\s+[^\n]{0,2048}${VARIABILE_SEGRETA}`, 'exfil_curl'],
  [String.raw`wget\s+[^\n]{0,2048}${VARIABILE_SEGRETA}`, 'exfil_wget'],
  [String.raw`cat\s+[^\n]{0,2048}(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)`, 'read_secrets'],
  [String.raw`(send|post|upload|transmit)\s+[^\n]{0,2048}\s+(to|at)\s+https?://`, 'send_to_url'],
  [String.raw`(include|output|print|share)\s+${RIEMPITIVO}(conversation|chat\s+history|previous\s+messages|full\s+context|entire\s+context)`, 'context_exfil'],
  [String.raw`authorized_keys`, 'ssh_backdoor'],
  [String.raw`(?:\b(?:echo|cat|cp|mv|dd|tee|install|printf|rsync|scp|ln|append|add|write|sed|chmod|chown|truncate|rm|touch|curl|wget|git)\b|\bopen\s*\(|>>?)[^\n]{0,512}(?:\$HOME/\.ssh|~/\.ssh)`, 'ssh_access'],
  [String.raw`\$HOME/\.hermes/\.env|~/\.hermes/\.env`, 'hermes_env'], // `\~` di Python non è un escape valido col flag `u`
  [String.raw`${MODIFICA}(?:AGENTS\.md|CLAUDE\.md|\.cursorrules|\.clinerules)`, 'agent_config_mod'],
  [String.raw`${MODIFICA}\.hermes/(config\.yaml|SOUL\.md)`, 'hermes_config_mod'],
  // `(?-i:…)`: il valore che è il NOME di una variabile d'ambiente (SHOUTY_SNAKE) non è un segreto (Hermes #116221).
  [String.raw`(?:api[_-]?key|token|secret|password)\s*[=:]\s*["'](?!(?-i:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)["'])[A-Za-z0-9+/=_-]{20,}`, 'hardcoded_secret'],
].map(([sorgente, id]) => [new RegExp(sorgente, 'iu'), id]);

const INVISIBILI = new Set([...'​‌‍⁠⁢⁣⁤﻿‪‫‬‭‮⁦⁧⁨⁩']);

/**
 * Gli identificativi degli schemi trovati (vuoto = pulito). I caratteri invisibili si dicono `invisible_unicode_U+XXXX`.
 * @param {string} testo
 * @returns {string[]}
 */
export function minacceNelTesto(testo) {
  const grezzo = String(testo ?? '').slice(0, MAX_CARATTERI);
  if (!grezzo) return [];
  const trovate = [...new Set([...grezzo].filter((c) => INVISIBILI.has(c)))]
    .map((c) => `invisible_unicode_U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
  const normale = grezzo.normalize('NFKC');
  for (const [regex, id] of SCHEMI) if (regex.test(normale)) trovate.push(id);
  return trovate;
}
