export type LiveAssistant={id:string;text:string};
export function assistantStreamView(message:LiveAssistant|null){return message?{label:'TALOS',id:message.id,text:message.text}:null;}
