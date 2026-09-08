# Contratti congelati TCEC v1 — 2026-09-08
Questo documento completa i payload del piano approvato. Root è l'unico autore dei contratti. Gli agenti implementano soltanto file assegnati. Se un contratto è impraticabile, segnalare prima di modificarlo.
## JSON e convenzioni
API pubbliche async salvo parser/pianificazione pura. Errori con .code stabile. Dati JSON clonati, niente riferimenti mutabili prestati. sessionId/id string non vuota <=256. Date ISO UTC. Revisioni intere >=0. Tutte le letture sono session scoped. Il contenuto canonico del messaggio conserva role/content/tool_calls/tool_call_id/talos_provider_state e altri campi JSON originali; non viene convertito in protocollo vendor nel nucleo.
Record input {id, message, createdAt, origin?, assetRefs?:[]} dove message.role è system|developer|user|assistant|tool; message.content JSON/string/null; tool message deve avere tool_call_id; tool_calls sono coppie {id,type:'function',function:{name,arguments:string}}. Record persistito aggiunge schema:'talos.context.record.v1',sessionId,sequence,sha256. sha256 sul JSON.stringify(message), UTF8. Duplicato stesso id/hash = idempotente; stesso id/diversi bytes = CTX_RECORD_CONFLICT. Record JSON originario e normalizzazione operativa sono distinti.
Settings {auto:true, model:{mode:'follow-session'}|{mode:'explicit',provider,model}, triggerRatio:0.75,targetRatio:0.55,retainRecentTurns:2,focus:'',nativeMode:'off'|'qualified', semanticSearch:true}. Niente chiavi API o budget economici. Ratio 0<target<trigger<1; retain integer0..100; focus <=8000; schema strict non ignorare campi errati. Disabilitare auto non elimina archivio.
SourceRef {recordId,quote,start?,end?}, server calcola offsets con match esatto nel testo del record, non accetta offset inventati. Summary {schema:'talos.context.summary.v1',text,goal,decisions:[],constraints:[],completed:[],pending:[],resources:[],sources:[]} con entries delle cinque liste stringhe; goal/text stringhe nonvuote; sources almeno1 quando esistono record sostituiti; quote e recordId verificati. Fatti protetti separati dalla sintesi, non riscritti dal modello.
Fact {id,text,sources:[],status:'active'|'conflict'|'removed',revision,conflict?:{proposedText,sources:[]}}. Un aggiornamento esplicito owner può cambiare text; una proposta modello crea conflict, mai sovrascrive text. Rimozione logica non riscrive originali.
Version {schema:'talos.context.version.v1',id,sessionId,coveredThrough,sourceIds,sourceHash,summary,activeMessages,model:{provider,model},measurement,createdAt,restoredFrom?:id}. activeMessages = prefisso compilato/sintesi alla pubblicazione, originals separati. Ogni job copre prefisso chiuso; tail >coveredThrough si riaggancia alla lettura/ripristino.
Snapshot {schema:'talos.context.snapshot.v1',sessionId,revision,stateRevision,headSequence,settings,metadata,activeVersion:null|Version,facts:[],jobs:[]}. revision cambia su modifica contesto/originali; stateRevision cambia solo settings/pin/restore/pubblicazione, non append originali. Permette job di prefisso stabile con nuovo suffisso, validato da root e CAS finale.
Measurement {schema:'talos.context.tokens.v1',inputTokens,windowTokens,responseReserve,method:'runtime'|'provider'|'heuristic',exact:boolean,requestHash,provider,model,estimatedMarginTokens?:integer}. Anthropic provider exact:false. Usage {inputTokens?,outputTokens?,totalTokens?,cachedTokens?,cost?,currency?,requestId?}, unknown non0.
Job {schema:'talos.context.job.v1',id,sessionId,idempotencyKey,requestFingerprint,kind:'compact'|'regenerate'|'restore',state:'queued'|'preparing'|'summarizing'|'validating'|'ready'|'committed'|'paused'|'cancelled'|'failed',baseRevision,baseStateRevision,coveredThrough,model,createdAt,updatedAt,completedSegments:[],progress:{completed,total,phase},error?:{code,message},versionId?}. Job state progress non incrementa sessionrevision. Un job attivo per sessione. Idempotenza payload uguale = ritorna job; diversa = CTX_IDEMPOTENCY_CONFLICT.
Event {schema:'talos.context.event.v1',id,sessionId,jobId?,versionId?,kind,state?,createdAt,payload}. Outbox persistito con pubblicazione, consegna atleastonce, UI dedup id.
## StorePort — factory createSqliteContextStore({databasePath, vectorExtension?:boolean, faultPoint?:string})
Metodi (Promise):
- initSession({sessionId,settings,metadata={}}) -> Snapshot; idempotente non sovrascrive existing.
- readContextSnapshot({sessionId}) -> Snapshot|null.
- appendOriginalBatch({sessionId,records,expectedRevision?}) -> {records,revision,headSequence}; atomico.
- readOriginals({sessionId,afterSequence=0,throughSequence?,ids?,limit=1000}) -> Record[] ordinati sequence. Nessun wildcard di sessione.
- updateSessionSettings({sessionId,settings,expectedRevision}) -> Snapshot; incrementa stateRevision.
- listContextVersions({sessionId}) -> Version[] più recente prima.
- commitContextVersion({sessionId,expectedRevision,expectedStateRevision,jobId,version}) -> Version; singola tx verifica revisioni/prefix/jobnoncancellato, inserisce versione, attiva, jobcommitted, outbox. Mismatch CTX_STALE_REVISION.
- restoreContextVersion({sessionId,versionId,expectedRevision,newVersionId,createdAt}) -> Version; copia base, attiva nuova versione, lascia originali successivi; pubblica evento.
- claimContextJob({sessionId,job}) -> Job; job.id/idempotencyKey già assegnati root. CTX_JOB_ACTIVE se altro attivo. Uno stesso job può essere ripreso se paused.
- saveJobProgress({sessionId,job}) -> Job; job cancellato non riattivabile da risultato tardivo.
- readContextJob({sessionId,jobId}) -> Job|null.
- upsertProtectedFact({sessionId,fact,expectedRevision}) -> Fact; root distingue owner vs proposta.
- removeProtectedFact({sessionId,factId,expectedRevision}) -> Fact rimosso.
- readContextOutbox({sessionId,limit=100}) -> Event[] nonack.
- ackContextEvent({sessionId,eventId}) -> void.
- recordUsage({sessionId,jobId,operationId,usage}) -> void; uniqueoperationId evita doppio conteggio.
- readUsage({sessionId}) -> records[].
- putBlob({sessionId,id,bytes:Uint8Array,mimeType,sha256?}) -> {id,sha256,mimeType,byteLength}; verifica hash, link ownership sessione.
- readBlob({sessionId,id}) -> {id,sha256,mimeType,bytes}|null.
- replaceSearchChunks({sessionId,chunks}) -> void. Chunk {id,recordId,sequence,text,start,end,embedding?:number[]}; derivati, validare recordownership. sessione con zerochunk resta interrogabile.
- searchLexical({sessionId,query,limit=20}) -> {id,recordId,sequence,text,start,end,score}[]; FTS escaped input non SQL.
- searchVector({sessionId,embedding,limit=20}) -> stessi hit; soltanto se vera estensione caricata, altrimenti CTX_VECTOR_UNAVAILABLE.
- exportSession({sessionId}) -> {schema:'talos.context.archive.v1',session,records,versions,facts,jobs,usage,blobs:[{id,sha256,mimeType,base64}],manifest}.
- importSession({archive}) -> Snapshot; valida hashes/provenienza/duplicate e tx, mai sovrascrive sessione divergente.
- backup({destinationPath}) -> manifest dopo SQLitebackupAPI.
- health() -> {sqliteVersion,fts5,vector,integrity}.
- close() -> attende richieste pendenti, chiude worker.
Compatibilità nomi export moduli wrapper (opzioni,{store}): appendOriginalBatch,commitContextVersion,readContextSnapshot,saveJobProgress,claimContextJob,readContextOutbox,ackContextEvent.
Legacy: selectLastValidCheckpoint(records) -> {messages,versioneGiro,recordIndex}|null; verifica corpo prima scelta maxversion. importLegacySession({sessionId,jsonl,settings,metadata},{store}) -> Snapshot; JSONL sourcebytes immutabili conservati blob, coda corrotta segnalata, intermedia corruzione rifiutata, importbaseline completato inunatx tramite importSession.
Export: exportContextArchive({sessionId},{store}) -> archive JSON; verifyContextArchive(archive) -> archive validato; importContextArchive(archive,{store}) -> Snapshot. Nessuna cifra sensibile nuova, archivi privati non pubblicati.
## ModelPort
createContextModelAdapter({resolveModel,callModel,usagePolicy?}) -> {summarize,resolveModel}.
resolveModel({sessionModel,settings}) -> {provider,model,windowTokens,responseReserve,local,capabilities}. Nessuna nuova credenziale nelcontratto.
summarize({model,messages,maxOutputTokens,signal,operationId,focus?}) -> {text,finishReason,usage,model}; tools assenti, maxRetries0 nel request owner, stopreason esplicito. Backend passa callModel({provider,model,messages,maxOutputTokens,signal,tools:[]}); adapter non cerca process.env né modello alternativo.
prepareProviderContext({messages,provider,model,reset:false,capabilities?}) -> {messages,resetApplied,warnings}; preserva JSON originali fuori copia. Se reset e tool native non sicuri: rappresenta sequenze chiuse come dati e non replay falsifirme. Toolpendenti=CTX_PENDING_TOOLS.
## TokenCounterPort
createContextTokenCounter({fetchFn,resolveProfile,hashFn?}) -> {countPreparedContext}.
countPreparedContext({messages,tools=[],model:{provider,model,windowTokens,responseReserve},signal}) -> Measurement. resolveProfile(model) fornisce {baseURL,apiKey?,nativeRequestBuilder?}; credenziali mai ritornate/loggate. Conteggio native usa body corrispondente SDK e fixture wire. Provider/runtime/heuristica indicati. No rete verso provider diverso. RequestHash hashJSONsenzaapikey. Distinguere contatore mancante da auth/risposta malformata.
## ToolCatalogPort
createContextToolCatalog({tools,baseToolNames,validateArguments,authorize,invoke}) -> {searchToolCatalog,getToolDescriptor,resolveCatalogInvocation,validateCatalogArguments,descriptors}. Nessun nuovo esecutore shell.
searchToolCatalog({query,limit=5}) -> [{name,description,parameters}].
getToolDescriptor(name) -> descriptor|null; tutti i tool autorizzati raggiungibili anche lookupnomeesatto.
resolveCatalogInvocation({name,arguments,callId,signal}) -> risultato dell'invoke passato. Sempre schema+policy specifici, asyncauthorize; nessuna inferenza toolname daistruzioni output.
## Retrieval / compress / embeddings / assets
chunkContextRecords(records,{maxChars=1600,overlapChars=160}) -> Chunk[]. Stabili id/offset/recordId; arrays multimodali solo testo, niente embed base64/firme.
rankContextSources({lexical=[],semantic=[],limit=20}) -> hits con RRF deterministico e dedup id; nessuna query crosssession.
selectContextEvidence(hits,{maxChars=8000}) -> hits ritagliati con offset corretti, interi quando possibile.
createContextEmbeddingRuntime({binaryPath,modelPath,modelSha256,processPolicy,fetchFn,downloadModel?,modelStore?,clock?}) -> {ensureEmbeddingModel,embedContextBatch,health,close}; endpointloopback CPU --embedding --pooling last; downloadModel porta riusa HF; no auto download senza parametro approved:true.
ensureEmbeddingModel({approved:false,signal}) -> manifest/status; embedContextBatch({texts,kind:'query'|'document',signal}) -> number[][]; firma modello/profilo nell'indice; verifica dimensioni1024/finite/ordine. Priorità chat porta isChatBusy optional; se busy yield/pausa, no GPU implicita.
createToolOutputCompressor({binaryPath,processPolicy,store,timeoutMs=10000}) -> {compressCapturedToolOutput}.
compressCapturedToolOutput({sessionId,recordId,text,filter,command?,exitCode?,signal}) -> {text,originalRef,compressed,filter?,originalChars,outputChars,command,exitCode}; record originale deveessere già archiviato. Solo approvedRTK pipe --filter, UTF8<=10MiB, altrimenti testo invariato o excerpt bounded+ref senza lossarchivio. Nessun wrappereseguicomando.
createContextAssetAdapter({store,readAsset}) -> {archiveContextAsset,resolveContextAsset}.
archiveContextAsset({sessionId,id,mimeType,bytes?,sha256?}) -> blobmanifest. resolveContextAsset({sessionId,id,modelCapabilities}) -> bytes manifest o errore capacità/missing/hash. readAssetcallbackriusa immaginichat, non effettua rete arbitraria.
## Engine factory
createContextEngine({store,model,tokenCounter,retrieval?,embedding?,toolCatalog?,assets?,usagePolicy?,clock=()=>new Date().toISOString(),idFactory}) -> API approvata. Le porte nonconsentono dipendenze implicitamente create.
Metodi assumono {sessionId,...}; appendOriginal({sessionId,record}), prepareForRequest({sessionId,messages?,tools,sessionModel,signal}), startCompaction({sessionId,idempotencyKey,sessionModel,kind='compact',signal}), cancelCompaction({sessionId,jobId}), resumeCompaction({...}), getContextState({sessionId}), updateContextSettings({sessionId,patch,expectedRevision}), listContextVersions({sessionId}), restoreContextVersion({sessionId,versionId,expectedRevision}), upsertProtectedFact({sessionId,fact,expectedRevision,actor:'owner'|'model'}), removeProtectedFact({...}), resolveFactConflict({sessionId,factId,accept,expectedRevision}), searchContext({sessionId,query}), readContextSource({sessionId,sourceId}), exportContext({sessionId}), importContext({archive}).
prepareForRequest -> {messages,measurement,versionId,job?,waiting:false}; supera limite e non recupera = ContextEngineError codice esplicito, nessun send upstream.
startCompaction Promise ritorna job iniziale subito; metodo aggiuntivo waitForCompaction({sessionId,jobId}) per compatHTTP e prove (aggiunto qui/ledger primaedit). background error gestito job, nessun unhandledrejection.
## UI payload
GETstate -> Snapshot con measurement?,usage?,semanticStatus e capabilityflags reali. Jobs API{job}; versions{versions}; facts{facts}; sources{source}; errors{error:{code,message}}. Client frontend non modifica forma dei contratti. POSTjobs richiede idempotencyKey. Mutazioni facts/settings expectedRevision. Legacy/compact risposta {compattato} compatibile.
## Test primo RED
CTX-CONTRACTS: importa contracts.mjs assente, poi valida recordroles/toolpairs/settingsratio/summarysource/schema. Atteso ERR_MODULE_NOT_FOUND prima implementazione. Qualsiasi necessaria aggiunta publicmethod viene prima annotata qui e nelledger.

