import assert from 'node:assert/strict';
import {describeError} from '../../src/i18n/error-view.ts';
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {displayCode,hasEnglishFor} from '../../src/i18n/error-view.ts';
import {looksItalian} from '../../src/i18n/kernel-map.ts';

/*
 * R2 lane E, gate E5: every code that can reach a failure line has English words of its own, or is in the ratchet list
 * below and gets its family's sentence (Q-R2-2). The list may only SHRINK: a new code without an entry turns this red, and
 * mapping a listed code turns it red until the code is removed from the list. `BASELINE` is the count at R2 lane E
 * (2026-09-24); raising it is a visible decision in review, never a silent one.
 *
 * Collected: codes thrown in `cli/src` and in every kernel module the CLI loads (the transitive closure of the files named
 * by `importTalosModule`, `join(src,'…')` and `talos-composition.ts`), by the shapes those files use to throw them:
 * `new XError('CODE'`, `fail('CODE'`, `error('CODE'`, `new XError('message', 'CODE')`, and `code: 'CODE'`.
 */
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const CLI=join(ROOT,'cli','src');const KERNEL=join(ROOT,'harness-ui','src');
const CODE='[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+';
const SHAPES=[
  new RegExp(`(?:new [A-Za-z]*Error|\\bfail|\\bruleError|\\berror|\\berrore)\\(\\s*['\`](${CODE})(?:['\`:])`,'gu'),
  new RegExp(`\\bcode\\s*:\\s*['\`](${CODE})['\`]`,'gu'),
  new RegExp(`Error\\(\\s*(?:'[^'\\n]*'|"[^"\\n]*"|\`[^\`\\n]*\`)\\s*,\\s*'(${CODE})'\\s*[,)]`,'gu'),
];
function walk(dir:string):string[]{return readdirSync(dir).flatMap(name=>{const full=join(dir,name);return statSync(full).isDirectory()?walk(full):[full];});}
function kernelEntries(){
  const names=new Set<string>();
  for(const file of walk(CLI).filter(f=>f.endsWith('.ts'))){
    const text=readFileSync(file,'utf8');
    for(const m of text.matchAll(/importTalosModule\([^,]+,\s*'([^']+\.mjs)'\)|join\(src,\s*'([^']+\.mjs)'\)/gu))names.add((m[1]??m[2])!);
  }
  names.add('kernel/talosHarness.mjs');
  return[...names].map(name=>join(KERNEL,name)).filter(existsSync);
}
function kernelClosure(){
  const seen=new Set<string>();const queue=kernelEntries();
  while(queue.length){
    const file=queue.pop()!;if(seen.has(file)||/\.test\./u.test(file))continue;seen.add(file);
    for(const m of readFileSync(file,'utf8').matchAll(/(?:from\s*|import\(\s*|import\s+)['"](\.{1,2}\/[^'"]+\.m?js)['"]/gu)){
      const next=resolve(dirname(file),m[1]!);if(next.startsWith(KERNEL)&&existsSync(next))queue.push(next);
    }
  }
  return[...seen];
}
function thrownCodes(files:string[]){
  const codes=new Set<string>();
  for(const file of files){const text=readFileSync(file,'utf8');for(const shape of SHAPES)for(const m of text.matchAll(shape))codes.add(m[1]!);}
  return codes;
}

const BASELINE=526;
const UNMAPPED:readonly string[]=[
  'ACP_BUSY','ACP_CANCELLED','ACP_CLOSE_FAILED','ACP_NOT_CONFIGURED','ACP_PROCESS_EXITED','ACP_PROTOCOL_INVALID',
  'ACP_REQUEST_FAILED','ACP_REQUEST_UNSUPPORTED','ACP_RUNTIME_INVALID','ACP_START_FAILED','ACP_TIMEOUT',
  'ACP_VERSION_UNSUPPORTED','AGENT_TREE_INVALID','APPROVAL_NOT_PENDING','ARGS_INVALID','ATTACHMENT_BINARY_UNSUPPORTED',
  'ATTACHMENT_COUNT_LIMIT','ATTACHMENT_IMAGE_SIGNATURE','ATTACHMENT_IMAGE_TOO_LARGE','ATTACHMENT_IMAGE_TOTAL_LIMIT',
  'ATTACHMENT_INVALID','ATTACHMENT_ITEM_TOO_LARGE','ATTACHMENT_PROMPT_REQUIRED','ATTACHMENT_TEXT_TOO_LARGE',
  'ATTACHMENT_TEXT_TOTAL_LIMIT',
  /* 0.6.7 (seventh review of 0.6.6, S4): seven automation codes got their own words */
  'AUTOMATION_STORE_MISCONFIGURED','AUTOMATION_TIMEZONE_INVALID',
  'AUXILIARY_CALL_NOT_ROUTED','AUXILIARY_ROUTE_UNAVAILABLE','CAPABILITIES_INVALID',
  'CAPABILITY_NOT_ALLOWED','CAPABILITY_REQUIRED','CAPTURE_LIMIT_INVALID','CATALOG_CONFIGURATION_REQUIRED',
  'CATALOG_UNREACHABLE','CATALOG_UPSTREAM_ERROR','CHECKPOINT_ACTIVE_RUN_CONFLICT',
  'CLI_ENTRY_UNAVAILABLE','COMMAND_FIELD_DUPLICATE','COMMAND_FIELD_UNKNOWN','COMMAND_FRONT_MATTER_INVALID',
  'COMMAND_INVALID','COMMAND_LIST_TAKES_NO_ARGUMENTS','COMMAND_NAME_DUPLICATE','COMMAND_NAME_REQUIRED',
  'COMMAND_SHOW_TAKES_ONE_NAME','COMMAND_TOO_LARGE','COMMAND_VARIABLE_UNKNOWN','CONFIG_INVALID',
  'CONFIG_INVALID_EXIT_OUTPUT','CONFIG_INVALID_KEYMAP','CONFIG_INVALID_OUTPUT_FORMAT','CONFIG_INVALID_PERMISSION_MODE',
  'CONFIG_INVALID_REASONING_EFFORT','CONFIG_INVALID_THEME','CONFIG_INVALID_UI','CONFIG_KEYMAP_SCOPE_INVALID',
  'CONFIG_MIGRATION_BACKUP_NOT_FOUND','CONFIG_PATH_CONFLICT','CONFIG_PATH_INVALID','CONFIG_PATH_NOT_FOUND',
  'CONFIG_PATH_REQUIRED','CONFIG_PERMISSIONS_OPERATION_INVALID','CONFIG_SCOPE_INVALID','CONFIG_SET_REQUIRES_PATH_VALUE',
  'CONFIG_UNKNOWN_KEY','CONFIG_VALUE_MUST_BE_JSON','CONFIG_VERSION_INVALID','CONFIG_VERSION_UNSUPPORTED',
  'CTX_EVENT_CONFLICT','CTX_INVALID_RESERVE','CTX_MODEL_MISMATCH','CTX_MODEL_NOT_CONFIGURED',
  'CTX_MODEL_PORT_INVALID',/* CTX_PENDING_TOOLS: words of its own in 0.6.13 */'CTX_PROVIDER_SERIALIZATION',
  'CTX_SESSION_MISMATCH','CTX_SESSION_NOT_FOUND','CTX_SUMMARY_TOOLS',
  'CTX_TOKEN_AUTH','CTX_TRANSPORT_UNAVAILABLE','CTX_USAGE_DENIED','CWD_NOT_ALLOWED',
  'CWD_NOT_FOUND','CWD_REQUIRED','CWD_ROOT_INVALID','DIAGNOSTIC_CONTENT_EXPORT_DISABLED',
  'DIAGNOSTIC_OPERATION_REQUIRED','DIAGNOSTIC_OUT_REQUIRED','ENV_INVALID','ENV_KEYS_INVALID',
  'EXECUTABLE_DIGEST_INVALID','EXECUTABLE_DIGEST_MISMATCH','EXECUTABLE_INVALID','EXECUTABLE_NOT_ALLOWED',
  'EXECUTABLE_NOT_FILE','EXECUTABLE_NOT_FOUND','EXECUTABLE_PATH_INVALID','EXECUTION_BACKEND_FAILED',
  'EXECUTION_BROKER_FACTORY_RETURNED_NOTHING','EXTENSION_ALREADY_INSTALLED','EXTENSION_COMPONENT_COLLISION',
  'EXTENSION_COMPONENT_MODIFIED','EXTENSION_HOOKS_INVALID','EXTENSION_ID_INVALID','EXTENSION_INCOMPATIBLE',
  'EXTENSION_MANIFEST_INVALID','EXTENSION_MANIFEST_MISSING','EXTENSION_MCP_INVALID','EXTENSION_PATH_ABSOLUTE',
  'EXTENSION_PATH_COLLISION','EXTENSION_PATH_TRAVERSAL','EXTERNAL_EDITOR_FAILED','EXTERNAL_EDITOR_NOT_CONFIGURED',
  'EXTERNAL_EDITOR_PARSE_FAILED','FILE_EXISTS','FILE_NOT_FOUND','FILE_TOO_LARGE','FORGE_INVALID','FORGE_NOT_FOUND',
  'FORGE_OWNER_ACTION_FAILED','FORGE_OWNER_ADOPTION_REQUIRED','FORGE_READ_FAILED','FORGE_REGISTRY_FULL',
  'FORGE_REVISION_INVALID','FORGE_SESSION_REQUIRED','FORGE_STORE_INVALID','FORGE_VERSION_NOT_FOUND',
  'FORGE_VERSION_NOT_NEWER','HISTORY_RECOVERY_AMBIGUOUS','HOOK_COMPATIBILITY_HASH_MISSING','HOOK_CONFIG_MALFORMED',
  'HOOK_EVENT_NOT_DECLARED','HOOK_EVENT_REQUIRED','HOOK_HISTORY_ARGUMENTS_INVALID','HOOK_HISTORY_LIMIT_INVALID',
  'HOOK_ID_INVALID','HOOK_INVALID','HOOK_LIST_TAKES_NO_ARGUMENTS','HOOK_MALFORMED','HOOK_NOT_FOUND','HOOK_QUARANTINED',
  'HOOK_READ_FAILED','HOOK_RELEASE_TAKES_ONE_ID','HOOK_RESOURCE_NOT_FOUND','HOOK_TRUST_INVALIDATED',
  'HOOK_TRUST_REQUIRED','HOOK_TRUST_TAKES_ONE_ID','HOOK_UNTRUST_TAKES_ONE_ID','IMAGE_ATTACHMENT_MATERIALIZE_FAILED',
  'IMAGE_ATTACHMENT_UNAVAILABLE','INTERNAL_ERROR','KERNEL_COMMAND_PATH_UNAVAILABLE','KEYMAP_CHORD_INVALID',
  'KEYMAP_CONFLICT','KEYMAP_DUPLICATE_CHORD','KEYMAP_RESERVED_CHORD','KEYMAP_UNKNOWN_BINDING',
  'LIBRARY_CONTEXT_UNSUPPORTED','LIBRARY_EXPORT_OUT_REQUIRED','LIBRARY_INVALID','LIBRARY_MALFORMED',
  'LIBRARY_NAME_EMPTY','LIBRARY_POLICY_MALFORMED','LIBRARY_POLICY_READ_FAILED',
  'LIBRARY_READ_FAILED','LIBRARY_TOO_LARGE',
  'LOCAL_SESSION_COMPACTION_UNAVAILABLE','LOG_TAIL_INVALID','MCP_COMPATIBILITY_HASH_MISSING','MCP_CONFIG_MALFORMED',
  'MCP_CONFIG_READ_FAILED','MCP_INVALID','MCP_PROBE_FAILED','MCP_RESOURCE_NOT_FOUND','MCP_SERVER_ID_INVALID',
  'MCP_SERVER_NOT_FOUND','MCP_TOOL_OWNER_UNRESOLVED','MCP_TRUST_INVALIDATED','MCP_TRUST_REQUIRED',
  'MEMORY_DATA_ROOT_REQUIRED','MEMORY_INVALID','MEMORY_NOT_FOUND','MEMORY_REPO_ROOT_REQUIRED',
  'MODEL_DESTINATION_INVALID','MODEL_DESTINATION_MISCONFIGURED','MODEL_IMAGE_UNSUPPORTED','MODEL_NOT_CHOSEN',
  'MODEL_REQUIRED','MXC_EXECUTION_CANCELLED','MXC_EXECUTION_TIMEOUT',
  'MXC_OUTPUT_LIMIT_EXCEEDED','MXC_OUTPUT_LIMIT_INVALID','MXC_WINDOWS_SANDBOX_POLICY_REQUIRED',
  'NOTES_REPO_ROOT_REQUIRED','NOTE_FORMAT_INVALID','NOTE_INVALID','NOTE_LINK_KIND_INVALID',
  'NOTE_LINK_TARGET_NOT_FOUND','NOTE_NOT_FOUND','NOT_A_FILE','OWNER_RUNTIME_CONTRACT_INVALID',
  'OWNER_RUNTIME_LOAD_FAILED','OWNER_RUNTIME_PATH_INVALID','PATH_NOT_FILE','PATH_NOT_FOUND','PATH_OPEN_FAILED',
  'PATH_ROOT_UNREADABLE','PATH_UNRESOLVABLE','PERMISSION_AUTO_DENIED','PERMISSION_AUTO_UNAVAILABLE','PERMISSION_DENIED',
  'PERMISSION_DRY_RUN_COMMAND_REQUIRED','PERMISSION_DRY_RUN_RESOURCE_REQUIRED','PERMISSION_DRY_RUN_SERVER_REQUIRED',
  'PERMISSION_DRY_RUN_TARGET_REQUIRED','PERMISSION_DRY_RUN_TOOL_INVALID','PERMISSION_ENGINE_ERROR',
  'PERMISSION_MODE_IGNORED','PERMISSION_REQUIRED','PLATFORM_UNSUPPORTED','PLUGIN_COMANDO_ESEGUE_CODICE',
  'PLUGIN_COMANDO_FUORI_DAL_PACCHETTO','PLUGIN_COMANDO_NON_LEGGIBILE','PLUGIN_COMPATIBILITY_HASH_MISSING',
  'PLUGIN_DANGEROUS','PLUGIN_ID_AMBIGUO','PLUGIN_ID_INVALID','PLUGIN_INVALID','PLUGIN_LIST_TAKES_NO_ARGUMENTS',
  'PLUGIN_MALFORMED','PLUGIN_NOT_FOUND','PLUGIN_PACKAGE_BYTES_TOO_LARGE','PLUGIN_PACKAGE_FILE_TOO_LARGE',
  'PLUGIN_PACKAGE_SYMLINK_UNSUPPORTED','PLUGIN_PACKAGE_TOO_LARGE','PLUGIN_READ_FAILED','PLUGIN_REGISTRY_FAILED',
  'PLUGIN_REGISTRY_UNAVAILABLE','PLUGIN_RELEASE_TAKES_ONE_ID','PLUGIN_SOURCE_REQUIRED','PLUGIN_TOOL_OWNER_UNRESOLVED',
  'PLUGIN_TRUST_INVALIDATED','PLUGIN_TRUST_TAKES_ONE_ID','PLUGIN_UNTRUST_TAKES_ONE_ID','POLICY_INVALID',
  'POLICY_REQUIRED','PROCESS_FAILED','PROCESS_START_FAILED','PROFILE_PATH_UNAVAILABLE',
  'PROJECT_COMMAND_ARGUMENT_INVALID','PROJECT_KEYMAP_IGNORED','PROJECT_NOT_ALLOWED','PROJECT_REASONING_EFFORT_IGNORED',
  'PROJECT_REFERENCE_CHANGED','PROJECT_REFERENCE_NOT_FILE','PROJECT_REFERENCE_NOT_FOUND',
  'PROJECT_REFERENCE_OUTSIDE_WORKSPACE','PROJECT_TRUST_NESTED_REPOSITORY_CONSENT_REQUIRED',
  'PROJECT_TRUST_STORE_INVALID','PROTOCOL_CURSOR_SESSION_MISMATCH','PROVIDER_AUTH_FAILED',
  'PROVIDER_CATALOG_UNAVAILABLE','PROVIDER_CLOUD_CREDENTIAL_INVALID','PROVIDER_CLOUD_TOKEN_EXPIRED',
  'PROVIDER_CONFIG_REQUIRED','PROVIDER_CONSENT_ANSWER_INVALID','PROVIDER_CONSENT_UNAVAILABLE',
  'PROVIDER_ENDPOINT_INVALID','PROVIDER_ENVIRONMENT_KEY_NOT_FOUND','PROVIDER_FALLBACK_CONTRACT_REQUIRED',
  'PROVIDER_FALLBACK_INVALID','PROVIDER_FALLBACK_NOT_CONNECTED','PROVIDER_FALLBACK_TOOLS_UNSUPPORTED',
  'PROVIDER_HEALTH_ERROR','PROVIDER_INVALID','PROVIDER_KEY_BENCHED','PROVIDER_KEY_ORIGIN',
  'PROVIDER_KEY_TEST_UNAVAILABLE','PROVIDER_NOT_CHOSEN','PROVIDER_NOT_CONFIGURED','PROVIDER_PROBE_MISCONFIGURED',
  'PROVIDER_PROBE_UNAVAILABLE','PROVIDER_REASONING_UNSUPPORTED','PROVIDER_TIMEOUT_INVALID',
  'QUERY_INVALID','QUEUE_ENTRY_NOT_FOUND','QUEUE_SESSION_CHANGED','QUEUE_STORE_INVALID','QUEUE_STORE_LIMIT',
  'QUEUE_STORE_READ_FAILED','QUEUE_STORE_WRITE_FAILED','QUEUE_TEXT_REQUIRED','REASONING_EFFORT_CAPABILITY_UNKNOWN',
  'REASONING_EFFORT_REQUIRED','REASONING_EFFORT_RUNTIME_UNAVAILABLE','REASONING_EFFORT_UNSUPPORTED',
  'RENDER_COORDINATOR_DISPOSED','REPLAY_EVENT_CONFLICT','RESEARCH_CONFLICT','RESEARCH_CONTROL_ID_REQUIRED',
  'RESEARCH_CONTROL_UNAVAILABLE','RESEARCH_DEPTH_INVALID','RESEARCH_ID_INVALID','RESEARCH_INVALID','RESEARCH_NOT_FOUND',
  'RESEARCH_QUERY_REQUIRED','RESEARCH_READ_FAILED','RESEARCH_STORE_INVALID','RESOURCE_CONFIG_MALFORMED',
  'RESOURCE_IDENTITY_MISMATCH','RESOURCE_ID_DUPLICATE','RESOURCE_NOT_FOUND',
  'RESOURCE_OUTSIDE_WORKSPACE','RESOURCE_PACKAGE_TOO_LARGE','RULE_NOT_NARROWED','RUNTIME_HTTP_ERROR',
  'RUNTIME_OPERATION_ID_UNAVAILABLE','RUNTIME_OPERATION_INTERRUPTED','RUNTIME_REPLAY_FAILED','RUNTIME_RESPONSE_INVALID',
  'RUNTIME_RESTORE_FAILED','RUNTIME_START_FAILED','RUNTIME_SUPERVISOR_CLOSED','RUNTIME_UNREACHABLE',
  'SANDBOX_CWD_NOT_GRANTED','SANDBOX_EVIDENCE_MISMATCH','SANDBOX_PATH_INVALID','SEARCH_BLOCKED',
  'SEARCH_ENDPOINT_INVALID','SEARCH_FAILED','SEARCH_KEY_INVALID','SEARCH_KEY_REQUIRED','SEARCH_SOURCE_INVALID',
  'SEARCH_STORE_UNAVAILABLE','SEARCH_UNREACHABLE','SECRET_FIELD_FORBIDDEN','SECRET_INPUT_REQUIRES_TTY',
  'SESSION_COMPACT_UNAVAILABLE','SESSION_CONTEXT_UNAVAILABLE','SESSION_EXPORT_FORMAT_INVALID',
  'SESSION_EXPORT_OUT_REQUIRED','SESSION_FORK_FAILED','SESSION_FORK_UNAVAILABLE','SESSION_ID_REQUIRED',
  'SESSION_IMPORT_FILE_REQUIRED','SESSION_IMPORT_ID_INVALID','SESSION_IMPORT_INVALID','SESSION_INTERRUPTED',
  'SESSION_METADATA_INVALID','SESSION_METADATA_LIMIT','SESSION_METADATA_READ_FAILED','SESSION_METADATA_WRITE_FAILED',
  'SESSION_MODEL_UNKNOWN','SESSION_QUEUE_UNAVAILABLE','SESSION_RESUME_FAILED',
  'SESSION_RESUME_UNAVAILABLE','SESSION_SCHEMA_UNSUPPORTED','SESSION_SEARCH_QUERY_REQUIRED','SESSION_SETTINGS_FAILED',
  'SESSION_SETTINGS_UNAVAILABLE','SESSION_SHARE_OUT_REQUIRED','SESSION_SHELL_FAILED','SESSION_SHELL_UNAVAILABLE',
  'SESSION_STEER_FAILED','SESSION_STEER_REJECTED','SESSION_STEER_UNAVAILABLE',
  'SESSION_STORE_CORRUPT','SESSION_STORE_DELETE_FAILED','SESSION_STORE_READ_FAILED','SESSION_STORE_WRITE_FAILED',
  'SESSION_TAG_REQUIRED','SHELL_COMMAND_REQUIRED','SHELL_COMPOSITION_INVALID','SHELL_COMPOSITION_UNSUPPORTED',
  'SHELL_NOT_ALLOWED','SHELL_SYNTAX_NOT_ALLOWED','SKILL_MALFORMED','SKILL_READ_FAILED','SKILL_REGISTRY_INVALID',
  'STDIN_TOO_LARGE','STEER_CORRELATION_FAILED',
  'STEER_TEXT_REQUIRED','TALOS_DOCUMENT_EMPTY','TALOS_DOCUMENT_FORMAT_UNKNOWN','TALOS_DOCUMENT_REPORT_PDF_ONLY',
  'TALOS_DOCUMENT_SOURCE_BODY_REQUIRED','TALOS_FILENAME_BUDGET_INVALID','TALOS_FORGE_CAPABILITY_FAILED',
  'TALOS_FORGE_CAPABILITY_UNAVAILABLE','TALOS_FORGE_MAX_TRANSITIONS','TALOS_FORGE_NODE_MISSING',
  'TALOS_FORGE_NODE_TYPE_UNKNOWN','TALOS_FORGE_PATH_UNSAFE','TALOS_FORGE_SET_ROOT_FORBIDDEN','TALOS_IMAGE_BAD_RESPONSE',
  'TALOS_IMAGE_NO_IMAGE','TALOS_IMAGE_PERSIST_CONFIG_INVALID','TALOS_IMAGE_PERSIST_CORRUPT',
  'TALOS_IMAGE_PERSIST_INVALID','TALOS_IMAGE_PERSIST_NOT_FOUND','TALOS_IMAGE_UNREACHABLE','TALOS_IMAGE_UPSTREAM_ERROR',
  'TALOS_LABS','TALOS_RUNTIME_ROOT_INVALID','TALOS_SEARCH_CREDENTIAL_MISSING','TALOS_SEARCH_ENDPOINT_MISSING',
  'TALOS_SEARCH_SOURCE_UNKNOWN','TALOS_SEARCH_TRANSPORT_UNEXPECTED_HOST','TALOS_WEB_ADDRESS_NOT_PUBLIC',
  'TALOS_WEB_REDIRECT_DOWNGRADE','TALOS_WEB_REDIRECT_INVALID','TALOS_WEB_REDIRECT_LOOP','TALOS_WEB_RESPONSE_TOO_LARGE',
  'TALOS_WEB_TIMEOUT','TALOS_WEB_TOO_MANY_REDIRECTS','TALOS_WEB_URL_BLOCKED','TASK_AGENT_NOT_DELEGATED',
  'TASK_BOARD_EDGE_KIND_INVALID','TASK_BOARD_REPO_ROOT_REQUIRED','TASK_BOARD_TARGET_NOT_FOUND',
  'TASK_CATALOG_INVALID','TASK_CATALOG_UNAVAILABLE','TASK_DEPENDENCY_CYCLE','TASK_DEPENDENCY_SELF','TASK_INVALID',
  'TASK_NOT_FOUND','TIMEOUT_INVALID','TRANSCRIPT_COPY_LIMIT','TRUST_MIGRATION_BACKUP_CONFLICT',
  'TRUST_MIGRATION_BACKUP_INVALID','TRUST_MIGRATION_REQUIRED','TRUST_MIGRATION_ROLLBACK_INVALID',
  'TRUST_MIGRATION_ROLLBACK_STALE','TRUST_MIGRATION_ROLLBACK_UNAVAILABLE','TRUST_MIGRATION_SNAPSHOT_CHANGED',
  'TRUST_QUARANTINE_STORE_INVALID','TRUST_SCOPE_QUARANTINED','TUI_DEPENDENCY_UNAVAILABLE','UPDATE_ACTIVE_RUN',
  'UPDATE_ASSET_NOT_FOUND','UPDATE_ATTEMPTS_INVALID','UPDATE_CHANNEL_INVALID','UPDATE_CHECKSUM_MISMATCH',
  'UPDATE_HTTP_ERROR','UPDATE_MANIFEST_ASSET_NOT_FOUND','UPDATE_MANIFEST_INVALID','UPDATE_RELEASE_METADATA_INVALID',
  'UPDATE_RELEASE_NOT_FOUND','UPDATE_RETRY_DELAY_INVALID','UPDATE_SIZE_MISMATCH','UPDATE_TIMEOUT',
  'UPDATE_TIMEOUT_INVALID','UPDATE_VERSION_INVALID','WINDOWS_REQUIRED','WORKFLOW_BODY_FORBIDDEN',
  'WORKFLOW_COMMAND_AMBIGUOUS','WORKFLOW_COMMAND_ARGS_INVALID','WORKFLOW_COMMAND_INVALID','WORKFLOW_COMMAND_NOT_FOUND',
  'WORKFLOW_ENTRY_AMBIGUOUS','WORKFLOW_ENTRY_INVALID','WORKFLOW_ENTRY_NOT_FOUND','WORKFLOW_ENTRY_NOT_RUNNABLE',
  'WORKFLOW_KIND_INVALID','WORKFLOW_SKILL_AMBIGUOUS','WORKFLOW_SKILL_INVALID','WORKFLOW_SKILL_NOT_FOUND',
  'WORKFLOW_STEPS_FORBIDDEN','WORKFLOW_STEPS_INVALID','WORKFLOW_STEPS_REQUIRED','WORKFLOW_STEP_INVALID',
  'WORKFLOW_STEP_TYPE_INVALID','WORKFLOW_TOO_MANY_STEPS','ZIP_CENTRAL_INVALID',
  'ZIP_CRC_MISMATCH','ZIP_DATA_INVALID','ZIP_DEFLATE_INVALID','ZIP_DUPLICATE_ENTRY','ZIP_ENCRYPTED_UNSUPPORTED',
  'ZIP_ENTRY_INVALID','ZIP_ENTRY_TOO_LARGE','ZIP_EOCD_NOT_FOUND','ZIP_LOCAL_INVALID','ZIP_METHOD_UNSUPPORTED',
  'ZIP_MULTIDISK_UNSUPPORTED','ZIP_SIZE_MISMATCH','ZIP_TOO_LARGE','ZIP_TOO_MANY_ENTRIES',
];

test('E5: every code that can reach a failure line has English words, or is on the ratchet list (which only shrinks)',()=>{
  const files=[...walk(CLI).filter(f=>f.endsWith('.ts')),...kernelClosure()];
  const codes=thrownCodes(files);
  assert.ok(codes.size>300,`the collector found only ${codes.size} codes: it is not looking where the codes are`);
  const unmapped=[...codes].filter(code=>!hasEnglishFor(code)).sort();
  const listed=new Set(UNMAPPED);
  const added=unmapped.filter(code=>!listed.has(code));
  const nowMapped=[...listed].filter(code=>!unmapped.includes(code));
  assert.deepEqual(added,[],`codes with no English and not on the list (give them words in i18n/en/errors.ts): ${added.join(', ')}`);
  assert.deepEqual(nowMapped,[],`codes that now have English: remove them from UNMAPPED: ${nowMapped.join(', ')}`);
  assert.ok(UNMAPPED.length<=BASELINE,`the ratchet list grew from ${BASELINE} to ${UNMAPPED.length}`);
});

/*
 * Desktop CE alignment (2026-09-25): the collector above never read the Context Engine. `talos-composition.ts` loads
 * `context-engine/src` and four `harness-ui/src/context-*.mjs` files through `join(contextRoot|harnessRoot,…)`, which
 * `kernelEntries` does not match, so the 38 codes the engine throws were never counted (35 had no English, two of them
 * new with the alignment). They are collected here, with a list of their own that may only SHRINK, so the ratchet above
 * keeps its baseline. Codes already on `UNMAPPED` are not listed twice.
 */
const CONTEXT_ENGINE=join(ROOT,'context-engine','src');
function contextFiles(){
  const composition=readFileSync(join(CLI,'runtime','talos-composition.ts'),'utf8');
  const harness=[...composition.matchAll(/join\(harnessRoot,\s*'([^']+\.mjs)'\)/gu)].map(m=>join(KERNEL,m[1]!));
  return[...walk(CONTEXT_ENGINE).filter(f=>f.endsWith('.mjs')),...harness.filter(existsSync)];
}
const CE_BASELINE=33;
const CE_UNMAPPED:readonly string[]=[
  'CTX_ARCHIVE_INVALID','CTX_ASSET_MISSING','CTX_BACKUP_FAILED','CTX_FACT_ACTOR_INVALID','CTX_FACT_CONFLICT_NOT_FOUND',
  'CTX_IDEMPOTENCY_CONFLICT','CTX_INVALID_INPUT','CTX_INVALID_PROFILE','CTX_INVALID_SOURCE',
  'CTX_JOB_CANCELLED','CTX_JOB_NOT_FOUND','CTX_LEGACY_CORRUPT','CTX_LEGACY_NO_CHECKPOINT','CTX_MEASUREMENT_MISMATCH',
  'CTX_NOT_ENABLED','CTX_PORT_MISSING','CTX_PROJECTION_MISALIGNED','CTX_ROUTE_NOT_FOUND',
  'CTX_SCHEMA_UNSUPPORTED','CTX_SERVICE_CLOSED','CTX_SOURCE_NOT_FOUND','CTX_STORE_CLOSED',
  'CTX_UNARCHIVED_CONTEXT','CTX_WORKER_EXIT',
];
test('E5 (CE): every Context Engine code that can reach a failure line has English words, or is on its own list (which only shrinks)',()=>{
  const files=contextFiles();
  assert.ok(files.some(f=>f.endsWith('context-desktop-service.mjs')),`the composition's context files were not found: ${files.length}`);
  const codes=thrownCodes(files);
  assert.ok(codes.size>30,`the collector found only ${codes.size} Context Engine codes: it is not looking where the codes are`);
  const kernelListed=new Set(UNMAPPED);
  const unmapped=[...codes].filter(code=>!hasEnglishFor(code)&&!kernelListed.has(code)).sort();
  const listed=new Set(CE_UNMAPPED);
  const added=unmapped.filter(code=>!listed.has(code));
  const nowMapped=[...listed].filter(code=>!unmapped.includes(code));
  assert.deepEqual(added,[],`Context Engine codes with no English and not on CE_UNMAPPED: ${added.join(', ')}`);
  assert.deepEqual(nowMapped,[],`codes that now have English or left the engine: remove them from CE_UNMAPPED: ${nowMapped.join(', ')}`);
  assert.ok(CE_UNMAPPED.length<=CE_BASELINE,`the Context Engine list grew from ${CE_BASELINE} to ${CE_UNMAPPED.length}`);
});

test('D-05: a code spelled in Italian is never printed as it is: it has an English display code',()=>{
  const files=[...walk(CLI).filter(f=>f.endsWith('.ts')),...kernelClosure()];
  const italian=[...thrownCodes(files)].filter(code=>looksItalian(displayCode(code).toLowerCase().replace(/_/gu,' ')));
  assert.deepEqual(italian,[],`Italian codes without an English display code (kernel-map.ts DISPLAY_CODES): ${italian.join(', ')}`);
});

test('E5: the codes the review put on screen are mapped, not on the list',()=>{
  for(const code of ['PROVIDER_REQUEST_ERROR','PROVIDER_KEY_MISSING','SANDBOX_REQUIRED_UNAVAILABLE','PROJECT_TRUST_REQUIRED','fermato','giri-esauriti','ripetizione'])
    assert.equal(hasEnglishFor(code),true,code);
});

test('a model that refuses: the common sentence, and the way out of each surface',()=>{
  const empty={code:'PROVIDER_EMPTY_RESPONSE',classe:'rifiuto-del-modello',message:'The model refused to answer this conversation.'};
  assert.equal(describeError(empty).what,'The model refused to answer this conversation.');
  assert.equal(describeError(empty,{screen:true}).todo,'Choose another model with /model.');
  assert.equal(describeError(empty).todo,'Choose another model with --model.');
  const partial=describeError({code:'rifiuto-del-modello',message:'⛔ the model stopped and refused to continue: the text that arrived is kept.'},{screen:true});
  assert.equal(partial.code,'MODEL_REFUSED');assert.match(partial.what,/refused to continue/u);
  assert.equal(partial.todo,'Choose another model with /model.');
  const plain=describeError({code:'PROVIDER_EMPTY_RESPONSE',message:'x'});
  assert.notEqual(plain.what,'The model refused to answer this conversation.','an empty answer that is no refusal stays what it was');
});

/* Core block 2 (decision 374, computer-use/file-approvati.mjs): the two codes of the computer use files say what happened AND
   what to do, and the Italian-spelled one reaches the screen under its English name. */
test('the two codes of the computer use files: what happened, what to do, and NON_UGUALE shown in English',()=>{
  const aside=describeError({code:'COMPUTER_USE_FILE_NOT_SET_ASIDE',message:'TALOS did not save the computer use settings: a.json was changed outside TALOS and could not be read or could not be moved aside (EBUSY), so nothing was written.'});
  assert.match(aside.what,/did not save the computer use settings/u);
  assert.match(aside.todo??'',/Close any program that has the file open/u);
  const changed=describeError({code:'NON_UGUALE',message:'the file does not match after the write'});
  assert.equal(changed.code,'FILE_CHANGED_AFTER_WRITE');
  assert.match(changed.what,/read differently right after/u);
  assert.match(changed.todo??'',/computer use keeps the approved settings/u);
  assert.equal(JSON.stringify(changed).includes('NON_UGUALE'),false,'the Italian code is on no line');
});
