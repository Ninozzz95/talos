const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
export function splitGraphemes(text:string){return [...segmenter.segment(text)].map(x=>x.segment);}
function isWide(cp:number){return cp>=0x1100&&(cp<=0x115f||cp===0x2329||cp===0x232a||(cp>=0x2e80&&cp<=0xa4cf)||(cp>=0xac00&&cp<=0xd7a3)||(cp>=0xf900&&cp<=0xfaff)||(cp>=0xfe10&&cp<=0xfe6f)||(cp>=0xff00&&cp<=0xff60)||(cp>=0xffe0&&cp<=0xffe6)||(cp>=0x1f300&&cp<=0x1faff));}
export function displayWidth(text:string){return splitGraphemes(text).reduce((n,g)=>{if(!g)return n;if(/\p{Extended_Pictographic}/u.test(g))return n+2;const cp=g.codePointAt(0)??0;return n+(isWide(cp)?2:1);},0);}
export function truncateDisplay(text:string,width:number){if(displayWidth(text)<=width)return text;if(width<=1)return '…';let out='';for(const g of splitGraphemes(text)){if(displayWidth(out+g)+1>width)break;out+=g;}return `${out}…`;}
