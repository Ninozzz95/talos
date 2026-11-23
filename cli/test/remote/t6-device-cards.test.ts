/*
 * 0.6.15 T6: the device tools' approval cards on the real dialog model (approval-dialog.ts `approvalDialogModel`): the collapsed card
 * and the full review name the device and the folder. Before, the card read «Allow a folder to a device» and nothing else: the
 * person would have allowed a folder without seeing which one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

const telefono={idCorto:'abcd1234',nome:'Pixel',piattaforma:'Android',inLinea:true,ultimaVoltaAlle:null};
const pendingFor=(azione:Record<string,unknown>):PendingTuiApproval=>({requestId:'r',sessionId:'s',action:permissionActionFromApproval({azione}),rawPayload:azione,reason:'x'} as PendingTuiApproval);

test('the folder card: the collapsed card and the full review say which device and which folder',()=>{
  const azione={tipo:'remote_phone_folder_allow',telefono,cartella:{cartellaId:'F1',nome:'shop-api',percorso:'C:/work/shop-api'}};
  const collapsed=approvalDialogModel(pendingFor(azione),{expanded:false});
  assert.match(collapsed.summary,/Allow “Pixel” \(id abcd1234\) to work in C:\/work\/shop-api/u);
  const full=approvalDialogModel(pendingFor(azione),{expanded:true});
  assert.match(full.fullPayload,/^Allow “Pixel” \(id abcd1234\) to work in C:\/work\/shop-api\nfrom the device it can read, write and run commands there/u,'one line per part in the full review');
});

test('remote control on and off, a revoke, a file: each card says what changes',()=>{
  assert.match(approvalDialogModel(pendingFor({tipo:'remote_control',acceso:true,ponte:null,ponteProposto:'proprio',telefoni:1,inLinea:0}),{expanded:false}).summary,/^Turn remote control on · through your own server · paired devices: 1$/u);
  assert.match(approvalDialogModel(pendingFor({tipo:'remote_control',acceso:false,ponte:'n0',telefoni:3,inLinea:2}),{expanded:false}).summary,/^Turn remote control off · connected devices disconnect: 2 of 3$/u);
  assert.match(approvalDialogModel(pendingFor({tipo:'remote_phone_revoke',telefono}),{expanded:false}).summary,/^Revoke “Pixel” \(id abcd1234\)/u);
  assert.match(approvalDialogModel(pendingFor({tipo:'remote_device_send_file',telefono,file:{nome:'a.txt',dimensione:12,percorso:'C:/work/a.txt'},dispositivi:1}),{expanded:false}).summary,/^Send a\.txt \(12 B\) to “Pixel” \(id abcd1234\) · C:\/work\/a\.txt$/u);
});
