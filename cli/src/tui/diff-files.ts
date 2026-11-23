/*
 * Stage 7.16 (mockup diff, `seedDiffFiles`/`diffBody`; Claude Code /diff shows `git diff HEAD` with the untracked files —
 * owner 03/10, labelled «new»): the /diff sheet's rows. `git diff HEAD` read through the one unified-diff parser
 * (diff-model.ts) into the mockup's shape — a path, its + and − counts, what happened to it, its hunks with their marks — and
 * an untracked file as all its lines added. Pure: the app runs git.
 */
import {t} from '../i18n/index.ts';
import {parseUnifiedDiff,type DiffFile as ModelFile} from './diff-model.ts';
import type {DiffFile} from './panel/sheet.ts';

const bare=(path:string,prefix:string)=>path.startsWith(prefix)?path.slice(prefix.length):path;
function noteOf(file:ModelFile):string{
  /* git's own header lines, matched as patterns: they are git's words, never the person's */
  const meta=file.rows.filter(row=>row.kind==='meta').map(row=>row.text);
  if(meta.some(line=>/^Binary files /u.test(line)))return t('panel.diff.note.binary');
  if(meta.some(line=>/^new file mode/u.test(line)))return t('panel.diff.note.added');
  if(meta.some(line=>/^deleted file mode/u.test(line)))return t('panel.diff.note.deleted');
  const from=meta.map(line=>/^rename from (.+)$/u.exec(line)?.[1]).find(Boolean);
  if(from)return t('panel.diff.note.renamed',{from});
  return t('panel.diff.note.modified');
}
/** `git diff HEAD` as the sheet's files, in git's order. */
export function gitDiffFiles(text:string):DiffFile[]{
  return parseUnifiedDiff(text).files.map(file=>{
    const deleted=file.newPath==='/dev/null';
    const path=deleted?bare(file.oldPath,'a/'):bare(file.newPath,'b/');
    const hunks:string[]=[];let add=0,del=0;
    for(const row of file.rows){
      if(row.kind==='hunk')hunks.push(row.text);
      else if(row.kind==='add'){add++;hunks.push('+'+row.text);}
      else if(row.kind==='remove'){del++;hunks.push('-'+row.text);}
      else if(row.kind==='context')hunks.push(' '+row.text);
    }
    return{path,add,del,note:noteOf(file),hunks};
  });
}
/** An untracked file: every line added; `null` when it is not text a line count can be given for. */
export function untrackedDiffFile(path:string,content:string|null):DiffFile{
  if(content===null)return{path,add:0,del:0,note:t('panel.diff.note.newBinary'),hunks:[]};
  const lines=content===''?[]:content.replace(/\r?\n$/u,'').split(/\r?\n/u);
  return{path,add:lines.length,del:0,note:t('panel.diff.note.new'),hunks:lines.length?[`@@ -0,0 +1,${lines.length} @@`,...lines.map(line=>'+'+line)]:[]};
}
/** The mockup's subtitle: «main · 3 files · +17 −5 · not committed»; a clean tree says so. */
export function diffSubtitle(branch:string|null,files:readonly DiffFile[]):string{
  const head=branch?`${branch} · `:'';
  if(!files.length)return head+t('panel.diff.clean');
  const add=files.reduce((sum,file)=>sum+file.add,0),del=files.reduce((sum,file)=>sum+file.del,0);
  return head+t(files.length===1?'panel.diff.files.one':'panel.diff.files.other',{count:files.length,add,del});
}
/** One file's patch, for `c`: its own hunks under the two path lines. */
export function patchOf(file:DiffFile):string{
  return[`--- a/${file.path}`,`+++ b/${file.path}`,...file.hunks].join('\n')+'\n';
}
