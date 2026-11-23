/* The Context Engine's host values, the same the Desktop passes (harness-ui/src/context-runtime.mjs:195; form of 05/11/2026, OK
   from the Desktop at 13:55): which user message is the person's (a kernel note is not), what a cleared output says to read it
   again, the summary's recovery line, and the mechanical anchor index as TEXT (the Desktop's own wrapper: the bare function
   returns an object). `usagePolicy` and `pesoDelBloccoFirmato` stay the Desktop's. */
export type ContextHostModules={
  runtime:{eRichiestaDellaPersonaPerIlRegistro:(message:unknown)=>boolean;PUNTATORE_USCITA_TOLTA:string};
  compaction:{RIGA_RECUPERO:string;indiceMeccanico:(messages:unknown[])=>{testo?:string|null}|null|undefined};
};
export function contextEngineHostOptions({runtime,compaction}:ContextHostModules){
  return{
    isPersonRequest:runtime.eRichiestaDellaPersonaPerIlRegistro,
    clearedToolPointer:runtime.PUNTATORE_USCITA_TOLTA,
    recoveryHint:compaction.RIGA_RECUPERO,
    anchorIndex:(messages:unknown[])=>compaction.indiceMeccanico(messages)?.testo??null,
  };
}
