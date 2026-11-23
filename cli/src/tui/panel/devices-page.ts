/*
 * C10 of the redesign: Devices, the paired devices as a page. Each with its state, when it was paired and last seen, and the folders it may
 * work in. n pairs a new one with the pairing card of /remote, unchanged (QR, the 6-digit code before the yes; Mobile 01/11); d twice
 * revokes one. The data is the remote coordinator's own (`stato`, `cartelle.consensiDi`), as `talos remote list` and `folders` read it.
 */
import {cleanDeviceName} from '../../remote/device-name.ts';
import {t,type MessageId} from '../../i18n/index.ts';
import {S,wrap,type PanelItem,type SegRow} from './sheet.ts';

export type DeviceFolder={name:string;path:string;blocked:boolean};
export type DeviceRow={id:string;name:string;state:'online'|'offline'|'revoked-by-phone';pairedAt:string|null;lastSeenAt:string|null;route:'relay'|'direct'|null;folders:readonly DeviceFolder[]|null};
export type DevicesData={available:boolean;error:string|null;pc:string|null;devices:readonly DeviceRow[];
  /* Mobile 01/11: remote control is off; the list stays (a lost phone is revoked exactly then), and the page says it */off?:boolean};

/** The kernel's devices as the page shows them: paired ones, and those the device itself revoked (revoked here, they leave). */
export function deviceRows(telefoni:readonly any[],folders:ReadonlyMap<string,readonly DeviceFolder[]>=new Map()):DeviceRow[]{
  return telefoni.filter(p=>typeof p?.id==='string'&&(!p.revocatoAlle||p.revocatoDa==='telefono')).map(p=>({id:p.id,name:cleanDeviceName(p.nome??p.id),
    state:p.revocatoAlle?'revoked-by-phone':p.inLinea?'online':'offline',pairedAt:typeof p.collegatoAlle==='string'?p.collegatoAlle:null,lastSeenAt:typeof p.ultimaVoltaAlle==='string'?p.ultimaVoltaAlle:null,
    route:p.inLinea?(p.percorso?.tipo==='relay'?'relay':'direct'):null,folders:folders.get(p.id)??null}));
}
const STATE:Record<DeviceRow['state'],[MessageId,string]>={online:['panel.devices.online','ok'],offline:['panel.devices.offline','dim'],'revoked-by-phone':['panel.devices.revokedByPhone','warn']};
const when=(at:string|null)=>{const d=at?new Date(at):null;return d&&Number.isFinite(d.getTime())?d.toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):t('panel.devices.never');};

export function deviceItems(data:DevicesData):PanelItem[]{
  return data.devices.map(device=>{const [word,role]=STATE[device.state];
    return{id:device.id,label:device.name,badge:t(word),badgeRoles:[role,'band'],
      meta:device.state==='online'?t(device.route==='relay'?'panel.devices.viaRelay':'panel.devices.direct'):t('panel.devices.seen',{when:when(device.lastSeenAt)})};});
}
export function deviceDetail(data:DevicesData,id:string|undefined,width:number):SegRow[]{
  const device=data.devices.find(row=>row.id===id);if(!device)return[];const [word,role]=STATE[device.state];
  const pair=(label:MessageId,value:string,roles=''):SegRow=>[S(t(label).padEnd(12),'faint'),S(value,roles)];
  const out:SegRow[]=[[S(device.name,'b')],[S('')],pair('panel.devices.state',t(word),role),pair('panel.devices.paired',when(device.pairedAt)),pair('panel.devices.lastSeen',device.state==='online'?t('panel.devices.now'):when(device.lastSeenAt)),
    [S('')],[S(t('panel.devices.folders'),'faint')]];
  if(device.folders===null)out.push([S(t('panel.devices.foldersUnread'),'dim')]);
  else if(!device.folders.length)out.push([S(t('panel.devices.noFolders'),'dim')]);
  else for(const folder of device.folders)out.push([S(folder.name.padEnd(16),folder.blocked?'warn':''),S(folder.blocked?t('panel.devices.blocked'):folder.path,folder.blocked?'warn':'dim')]);
  if(device.state==='revoked-by-phone')out.push([S('')],...wrap(t('panel.devices.revokedNote'),width).map(line=>[S(line,'faint')] as SegRow));
  return out;
}
