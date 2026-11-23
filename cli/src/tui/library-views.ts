/*
 * Stage 7.23 (mockup library «2.4 MB · PDF · 212 pages · indexed»; owner 03/10: the mockup's sheet, the rest as /library
 * commands): the library's files as /library shows them — the size on the right, under the name its kind and, for text,
 * how many lines, with «made by TALOS» for a file TALOS made; the detail shows its first lines.
 */
import {extname} from 'node:path';
import {t,tn} from '../i18n/index.ts';
import type {LibraryPreview,LibraryView} from '../services/library-facade.ts';
import {sizeText,type LibraryRow} from './panel/commands.ts';

const KINDS:Record<string,string>={'.md':'Markdown','.markdown':'Markdown','.txt':'Text','.ts':'TypeScript','.tsx':'TypeScript','.js':'JavaScript','.mjs':'JavaScript','.py':'Python','.yml':'YAML','.yaml':'YAML','.htm':'HTML','.html':'HTML'};
export const PREVIEW_LINES=4;
export function fileKind(name:string,mediaType:string):string{
  const ext=extname(name).toLowerCase();
  if(KINDS[ext])return KINDS[ext]!;
  if(ext)return ext.slice(1).toUpperCase();
  return mediaType.startsWith('image/')?t('panel.library.image'):mediaType.split('/').pop()!.toUpperCase();
}
export function libraryRows(rows:readonly LibraryView[],previews:ReadonlyMap<string,LibraryPreview|null>):LibraryRow[]{
  return rows.map(row=>{
    const preview=previews.get(row.id)??null;
    const lines=preview?.mode==='text'&&preview.text!==null?preview.text.replace(/\n$/u,'').split('\n'):null;
    const desc=[fileKind(row.name,row.mediaType),
      ...(row.fileType==='image'&&!/^image/u.test(fileKind(row.name,row.mediaType))?[t('panel.library.image')]:[]),
      ...(lines&&!preview!.truncated?[tn('panel.library.lines',lines.length)]:[]),
      ...(row.origin==='generated'?[t('panel.library.generated')]:[])].join(' · ');
    return{id:row.id,name:row.name,meta:preview?sizeText(preview.size):'',desc,
      /* FE-048: a file is read only when its row is chosen: not asked yet is not «no preview» */
      preview:lines?[...lines.slice(0,PREVIEW_LINES),...(lines.length>PREVIEW_LINES||preview!.truncated?['…']:[])]:previews.has(row.id)?[t('panel.library.noPreview')]:[t('screen.loading.preview')]};
  });
}
