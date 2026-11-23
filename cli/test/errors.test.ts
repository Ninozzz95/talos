import assert from 'node:assert/strict';import test from 'node:test';import {TalosError,exitCodeForError,toTalosErrorEnvelope} from '../src/errors.ts';
test('oversized stdin is a stable input error',()=>{assert.equal(exitCodeForError(Object.assign(new Error('too large'),{code:'STDIN_TOO_LARGE'})),2);});
test('TalosError serializes a stable actionable envelope',()=>{
  const error=new TalosError({code:'SANDBOX_REQUIRED_UNAVAILABLE',component:'execution-broker',retryable:false,hint:'Install the Windows sandbox backend',docs:'https://learn.microsoft.com/windows/win32/secauthz/createprocessinsandbox',traceId:'trace-1'},new Error('processmodel.dll export missing'));
  assert.deepEqual(toTalosErrorEnvelope(error),{code:'SANDBOX_REQUIRED_UNAVAILABLE',component:'execution-broker',retryable:false,cause:{name:'Error',message:'processmodel.dll export missing'},hint:'Install the Windows sandbox backend',docs:'https://learn.microsoft.com/windows/win32/secauthz/createprocessinsandbox',traceId:'trace-1'});
  assert.equal(exitCodeForError(error),10);
});
test('an error carrying its taxonomy token in message keeps that code in the envelope',()=>{
  // `findTalosRepoRoot` throws `new Error('TALOS_RUNTIME_NOT_FOUND')` with no `code` property, and
  // `exitCodeForError` reads that message to return 2. An envelope that answered INTERNAL_ERROR would
  // contradict its own exit code on the one failure a person meets before anything else works.
  const error=new Error('TALOS_RUNTIME_NOT_FOUND');
  assert.equal(toTalosErrorEnvelope(error).code,'TALOS_RUNTIME_NOT_FOUND');
  assert.equal(exitCodeForError(error),2);
});
test('a taxonomy token followed by a colon keeps the token as the code and never the payload after it',()=>{
  // Measured sources: config/load.ts (CONFIG_UNKNOWN_KEY, SECRET_FIELD_FORBIDDEN), security/rule-parser.ts
  // (PERMISSION_RULE_INVALID), security/mxc-execution-backend.ts (MXC_BACKEND_UNAVAILABLE with a space).
  const rows:[string,string][]=[
    ['CONFIG_UNKNOWN_KEY:bogusKey','CONFIG_UNKNOWN_KEY'],
    ['SECRET_FIELD_FORBIDDEN:config.providerRuntime.apiKey','SECRET_FIELD_FORBIDDEN'],
    ['PERMISSION_RULE_INVALID:x','PERMISSION_RULE_INVALID'],
    ['MXC_BACKEND_UNAVAILABLE: x','MXC_BACKEND_UNAVAILABLE']
  ];
  for(const [message,code] of rows){
    const error=new Error(message);
    assert.equal(toTalosErrorEnvelope(error).code,code,message);
    // The envelope code must lead to the same exit code as the raw error it came from.
    assert.equal(exitCodeForError({code}),exitCodeForError(error),message);
  }
});
test('CLI usage prose receives one stable envelope code and one exit taxonomy',()=>{
  for(const message of ['Unsupported model operation: x','Invalid permission mode: BOGUS','Unknown option: --bogus']){
    const error=new Error(message);
    const envelope=toTalosErrorEnvelope(error);
    assert.equal(envelope.code,'CLI_USAGE_ERROR',message);
    assert.equal(exitCodeForError(error),2,message);
    assert.equal(exitCodeForError({code:envelope.code}),2,message);
  }
  for(const message of ['MXC backend down','OK then: CONFIG_UNKNOWN_KEY'])assert.equal(toTalosErrorEnvelope(new Error(message)).code,'INTERNAL_ERROR',message);
});
test('a lone word or a drive letter before a colon is prose, not a code',()=>{
  // Every colon-form throw measured in cli/src and harness-ui/src joins its token with an underscore;
  // a bare word before a colon is how people and upstream services write sentences and paths.
  const windowsPath=(...parts:string[])=>parts.join(String.fromCharCode(92));
  const prose=['ERROR: disk full','WARNING: x','OK: all good','FATAL: password authentication failed for user','A: b',windowsPath('C:','PROGRAM FILES'),windowsPath('C:','Users','x','file.txt'),'INTERRUPTED: stopped','CANCELLED: by user','ERROR:PROVIDER_UNREACHABLE','ERROR_: x'];
  for(const message of prose)assert.equal(toTalosErrorEnvelope(new Error(message)).code,'INTERNAL_ERROR',message);
  // A whole-message token still counts, including a single word, and keeps its exit code.
  const kept:[string,string,number][]=[['INTERRUPTED','INTERRUPTED',130],['TALOS_RUNTIME_NOT_FOUND','TALOS_RUNTIME_NOT_FOUND',2],['CONFIG_UNKNOWN_KEY:bogusKey','CONFIG_UNKNOWN_KEY',11]];
  for(const [message,code,exit] of kept){
    const error=new Error(message);
    assert.equal(toTalosErrorEnvelope(error).code,code,message);
    assert.equal(exitCodeForError(error),exit,message);
    assert.equal(exitCodeForError({code}),exit,message);
  }
});
test('a prose message is not a code and falls back to INTERNAL_ERROR',()=>{
  assert.equal(toTalosErrorEnvelope(new Error('processmodel.dll export missing')).code,'INTERNAL_ERROR');
  assert.equal(toTalosErrorEnvelope('a bare string').code,'INTERNAL_ERROR');
  assert.deepEqual(toTalosErrorEnvelope(new Error('offline'),{component:'provider-gateway',retryable:true,traceId:'trace-2'}),{code:'INTERNAL_ERROR',component:'provider-gateway',retryable:true,cause:{name:'Error',message:'offline'},traceId:'trace-2'});
});
