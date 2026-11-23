/* R1 gate E4/E16: TALOS measures text with the SAME function Ink 7.1.1 uses to lay it out (`string-width` 8.2.2, the
   one copy in the lockfile, hoisted beside Ink). The hand-rolled table this replaces disagreed with Ink on 17 of 63
   fixtures (SGR, tabs, ZWSP, flags, text-presentation symbols ☺ ⚠ © ™ ✔ ▶, combining marks, controls), and a row
   count computed with one width and rendered with another is how a frame overflows (review D-02/D-04).
   It is imported here, not declared in package.json, per the lane rule "no new dependency"; see the lane hand-back. */
import stringWidth from 'string-width';

const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
/* Simple narrow text: every code point is a grapheme on its own and one terminal column wide, so the length IS the width and the
   segmenter, the widest cost of laying out a long session, is skipped. The class is printable ASCII plus Latin-1/Latin Extended/IPA,
   Greek, Cyrillic, typographic punctuation, arrows, math and box drawing (the product's own text: Italian prose, “quotes”, —, …, →, │).
   It is not a guess: it is every BMP code point of those blocks that the runtime's Intl.Segmenter calls one grapheme and string-width
   8.2.2 calls one column, and all 3,381,921 ordered pairs of it segment as two graphemes (scripts/gen-simple-class.mjs; the tests pin it
   to the runtime). Combining marks, ZWJ/ZWSP, soft hyphen, bidi controls, variation selectors, wide and emoji forms, controls, tab,
   DEL, ESC and CR are outside it and take the full path. The same idea as sidorares/ntk PR 448 (29/09/2026) and pi issues 9730/9870.
   Proven against the previous implementation by test/tui/text-width-ascii-fast-path.test.ts. */
const SIMPLE_NARROW=/^[\u0020-\u007E\u00A0-\u00AC\u00AE-\u02FF\u0370-\u0482\u048A-\u052F\u2010-\u2029\u202F-\u205E\u2190-\u22FF\u2500-\u25FC\u25FF]*$/;
export function splitGraphemes(text:string){return SIMPLE_NARROW.test(text)?text.split(''):[...segmenter.segment(text)].map(x=>x.segment);}
export function displayWidth(text:string){const value=String(text);return SIMPLE_NARROW.test(value)?value.length:stringWidth(value);}
export function truncateDisplay(text:string,width:number){if(displayWidth(text)<=width)return text;if(width<=1)return '…';if(width>=2&&SIMPLE_NARROW.test(text))return `${text.slice(0,Math.floor(width)-1)}…`;let out='',used=0;for(const g of splitGraphemes(text)){const w=displayWidth(g);if(used+w+1>width)break;out+=g;used+=w;}return `${out}…`;}
/* Keeps both ends of a long value (a workspace path): the tail says which folder, the head says which drive/root. */
export function truncateMiddle(text:string,width:number){
  if(displayWidth(text)<=width)return text;if(width<=1)return '…';
  if(width>=2&&SIMPLE_NARROW.test(text)){const kept=Math.floor(width)-1,head=Math.floor(kept/2);return `${text.slice(0,head)}…${text.slice(text.length-(kept-head))}`;}
  const graphemes=splitGraphemes(text);const budget=width-1;let head='',tail='',used=0,left=0,right=graphemes.length-1;
  while(left<=right){
    const takeTail=displayWidth(tail)<=displayWidth(head);const g=takeTail?graphemes[right]!:graphemes[left]!;const w=displayWidth(g);
    if(used+w>budget)break;used+=w;
    if(takeTail){tail=g+tail;right--;}else{head+=g;left++;}
  }
  return `${head}…${tail}`;
}
/* Hard-wraps text into rows of at most `width` columns by grapheme, the way a terminal fills cells. Used where TALOS
   owns the line breaks itself (the composer, chrome), so the row count is exact before render (E4). */
export function wrapDisplay(text:string,width:number):string[]{
  const limit=Math.max(1,Math.floor(width));const rows:string[]=[];
  for(const line of String(text).split('\n')){
    if(limit>=1&&SIMPLE_NARROW.test(line)){if(line==='')rows.push('');else for(let at=0;at<line.length;at+=limit)rows.push(line.slice(at,at+limit));continue;}
    let row='',used=0;
    for(const g of splitGraphemes(line)){const w=displayWidth(g);if(used+w>limit&&row!==''){rows.push(row);row='';used=0;}row+=g;used+=w;}
    rows.push(row);
  }
  return rows;
}
/* R13 (collaudo 01/11: «s/etTimeout», «cons/ole.log» in the chat): Ink's `wrap` is wrap-ansi with `hard: true`, which breaks
   at spaces and cuts a word longer than the row AT the column, mid-word. A command has no spaces, so the person read it
   broken anywhere. This lays out the rows TALOS draws itself, one Ink.Text each (every row fits, so Ink never re-wraps it),
   and the height estimate counts the same rows. Breaks, in order: at spaces (eaten, as a soft wrap does); inside a token
   too long for the row, after the last `/ \ ; , . : = & | - ( ) [ ] { }` that keeps at least a third of the room — the
   shape of Hermes' preview wrap (hermes_cli/cli_render.py:958-965, textwrap with break_on_hyphens and break_long_words);
   only without one, a cut by grapheme. Nothing is lost but the spaces a break eats. */
const BREAK_AFTER=new Set(['/','\\',';',',','.',':','=','&','|','-','(',')','[',']','{','}']);
export function wrapReadable(text:string,width:number):string[]{
  const limit=Math.max(1,Math.floor(width));const rows:string[]=[];
  for(const line of String(text).split('\n')){
    let row='',used=0;
    const push=()=>{rows.push(row.trimEnd());row='';used=0;};
    for(const token of line.split(/( +)/u)){
      if(token==='')continue;
      const cells=displayWidth(token);
      if(used+cells<=limit){row+=token;used+=cells;continue;}
      if(token.startsWith(' ')){push();continue;}
      if(cells<=limit){if(row.trim()!=='')push();else{row='';used=0;}row=token;used=cells;continue;}
      let rest=splitGraphemes(token);
      while(rest.length){
        let room=limit-used;
        if(row.trim()!==''&&room<Math.ceil(limit/3)){push();room=limit;}
        let take=0,taken=0;
        while(take<rest.length&&taken+displayWidth(rest[take]!)<=room){taken+=displayWidth(rest[take]!);take++;}
        if(take===rest.length){row+=rest.join('');used+=taken;break;}
        if(take===0){if(row!=='')push();else{row=rest[0]!;used=displayWidth(row);rest=rest.slice(1);push();}continue;}
        let at=-1;for(let index=take-1;index>=0;index--)if(BREAK_AFTER.has(rest[index]!)){at=index;break;}
        const cut=at+1>=Math.ceil(take/3)?at+1:take;
        row+=rest.slice(0,cut).join('');rest=rest.slice(cut);push();
      }
    }
    if(row!==''||!rows.length||line==='')push();
  }
  return rows;
}
