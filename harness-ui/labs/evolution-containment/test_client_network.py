"""Synthetic two-channel witness tests. No privilege, OS or network operations."""
import copy
import json
import ntpath
from pathlib import Path
import unittest
import review_client_network as v
from test_containment_v2 import fixture as native_fixture
from test_network_correlation import TIME, IMAGE, OWNER


def encoded(value):
    return (json.dumps(value, sort_keys=True)+"\n").encode()


def fixture():
    records,_,_=native_fixture()
    for record in records:
        if 'launcher_elevated' in record:record['launcher_elevated']=False
        if 'elevated' in record:record['elevated']=False
    profile={"schema":"talos.client-host-profile.v1","os_major":10,"os_minor":0,"build":26200,
             "product_type":1,"process_machine":0,"native_machine":43620,"machine_type":34404,
             "elevated":False,"elevation_type":1,"integrity_rid":8192,"administrators_sid_present":False,
             "appcontainer":False,"restricted_sid_count":0,"scope":"windows11-arm64-x64-emulated",
             "standard_user":True,"accepted":True,"full_containment_verified":False}
    records.insert(0,profile)
    original=next(r for r in records if r.get('diagnostic')=='broker_wfp_localport_events')
    xml=original.pop('text').replace('MS_FWP_DIRECTION_OUT','MS_FWP_DIRECTION_IN').replace('</internalFields>','<processId>4000</processId></internalFields>').encode()
    original['error']='read-only WFP query failed: exit 1'
    selection={'schema':'talos.client-network-witness.selection.v1','scope':v.SCOPE,
               'selected_at_ms':TIME-2000,'checkout':'a'*40,'owner_sid':OWNER,
               'listener_image_dos':r'C:\fixture\parent.exe','listener_image_nt':IMAGE,
               'witness_directory':r'C:\evidence\network-observer','binary_sha256':'b'*64,
               'source_sha256':{name:v.sha(Path(v.__file__).with_name(name).read_bytes()) for name in v.SOURCES},'observer_elevated':True,
               'measured_runtime_elevated':False,'network_configuration_changed':False,
               'full_containment_verified':False,'release_ready':False}
    collection={'schema':'talos.client-network-witness.collection.v1','status':'COLLECTED_NOT_VERIFIED',
                'started_ms':TIME+3000,'finished_ms':TIME+3100,'netsh_exit_code':0,
                'arguments':['wfp','show','netevents',r'file=C:\evidence\network-observer\events.xml',
                    'protocol=6','localaddr=127.0.0.1','remoteaddr=127.0.0.1','localport=64917',
                    'remoteport=64924',r'appid=C:\fixture\parent.exe','userid='+OWNER,'timewindow=60'],
                'observer_elevated':True,'configuration_changed':False,'error':None}
    ci={'schema':'talos.client-ci-fixture.v1','checkout':'a'*40,'clientNativeExit':1,'binarySha256':'b'*64,
        'cleanupErrors':[],'error':None,**{key:True for key in ('provisionerElevated','accountCreated','accountRemoved',
        'profileRemoved','temporaryTreeRemoved','elevatedControlRejected')}}
    run={'status':'CLIENT_EXECUTED_NOT_CERTIFIED','nativeExitCode':1,'error':None,'binarySha256':'b'*64,'entrySha256':selection['source_sha256']['run-client.ps1']}
    bundle={'selection':encoded(selection),'collection':encoded(collection),'profile':encoded(profile),
            'fixture':encoded(ci),'run':encoded(run),'probes':b''.join(encoded(r) for r in records),'xml':xml}
    rehash(bundle)
    return bundle


def rehash(bundle):
    collection=v.load_json(bundle['collection'])
    for key,data in (('selection_sha256',bundle['selection']),('probes_sha256',bundle['probes']),('xml_sha256',bundle['xml'])):
        collection[key]=v.sha(data)
    bundle['collection']=encoded(collection)


def update(bundle,name,key,value):
    obj=v.load_json(bundle[name]);obj[key]=value;bundle[name]=encoded(obj)


def alter_record(bundle,key,value,field,new):
    records=[v.load_json(r) for r in bundle['probes'].splitlines()]
    next(r for r in records if r.get(key)==value)[field]=new
    bundle['probes']=b''.join(encoded(r) for r in records)


class WitnessTests(unittest.TestCase):
    def test_two_channels_preserve_native_failure_and_inputs(self):
        data=fixture();before=copy.deepcopy(data);result=v.evaluate(data)
        self.assertEqual(result['status'],'CLIENT_NETWORK_BLOCK_OBSERVED',result)
        self.assertEqual(data,before)
        for key in ('release_ready','full_containment_verified','producer_authenticated','native_evidence_rewritten','runtime_elevated_for_observation','native_x64_client_verified'):
            self.assertIs(result[key],False)
        self.assertTrue(result['privileged_ci_observer_required'])

    def test_raw_hash_changes_are_refused(self):
        for name in ('selection','xml','probes'):
            data=fixture();data[name]+=b' '
            self.assertEqual(v.evaluate(data)['status'],'REJECT',name)

    def test_no_dtd_entities_duplicates_or_nonfinite_values(self):
        for raw in (b'{"x":1,"x":2}',b'{"x":NaN}',b'{"x":Infinity}'):
            with self.assertRaises(ValueError):v.load_json(raw)
        data=fixture();data['xml']=data['xml'].replace(b'<netEvents>',b'<!DOCTYPE netEvents [<!ENTITY x "bad">]><netEvents>');rehash(data)
        self.assertEqual(v.evaluate(data)['status'],'REJECT')

    def test_utf16_is_strict(self):
        data=fixture();text=data['xml'].decode();data['xml']=b'\xff\xfe'+text.encode('utf-16le');rehash(data)
        self.assertEqual(v.evaluate(data)['status'],'CLIENT_NETWORK_BLOCK_OBSERVED')
        for raw in (b'\xff\xfe\x41',b'\xff\xfe\x00\xd8',b'\xff'):
            with self.assertRaises(ValueError):v.xml_text(raw)

    def test_collection_script_does_not_mutate_network_policy(self):
        text=Path(__file__).with_name('ci-observe-client-network.ps1').read_text()
        self.assertIn("@('wfp','show','netevents'",text)
        self.assertIn('ArgumentList.Add($arg)',text)
        self.assertIn('[Environment]::SystemDirectory',text)
        for forbidden in ('Invoke-Expression','CheckNetIsolation','New-NetFirewallRule','Set-NetFirewallProfile','wfp set','wfp capture'):
            self.assertNotIn(forbidden,text)

    def test_every_non_network_check_is_mandatory(self):
        data=fixture();records=[v.load_json(r) for r in data['probes'].splitlines()]
        for index,record in enumerate(records):
            if record.get('passed') is not True:continue
            candidate=copy.deepcopy(data);mutated=copy.deepcopy(records);mutated[index]['passed']=False
            candidate['probes']=b''.join(encoded(r) for r in mutated);rehash(candidate)
            self.assertEqual(v.evaluate(candidate)['status'],'REJECT',record)


CASES={
 'wrong_event_direction':lambda b:b.__setitem__('xml',b['xml'].replace(b'MS_FWP_DIRECTION_IN',b'MS_FWP_DIRECTION_OUT')),
 'missing_listener_process':lambda b:b.__setitem__('xml',b['xml'].replace(b'<processId>4000</processId>',b'')),
 'candidate_pid_is_not_listener':lambda b:b.__setitem__('xml',b['xml'].replace(b'<processId>4000</processId>',b'<processId>4001</processId>')),
 'unrelated_listener_process':lambda b:b.__setitem__('xml',b['xml'].replace(b'<processId>4000</processId>',b'<processId>9999</processId>')),
 'witness_failed':lambda b:update(b,'collection','status','FAIL'),
 'witness_not_elevated':lambda b:update(b,'selection','observer_elevated',False),
 'runtime_elevated':lambda b:update(b,'selection','measured_runtime_elevated',True),
 'configuration_changed':lambda b:update(b,'collection','configuration_changed',True),
 'nonzero_netsh':lambda b:update(b,'collection','netsh_exit_code',1),
 'bool_netsh':lambda b:update(b,'collection','netsh_exit_code',False),
 'unknown_scope':lambda b:update(b,'selection','scope','server2022'),
 'owner_changed':lambda b:update(b,'selection','owner_sid','S-1-5-21-9-8-7-1001'),
 'wrong_nt_image':lambda b:update(b,'selection','listener_image_nt',IMAGE.replace('fixture','another')),
 'late_selection':lambda b:update(b,'selection','selected_at_ms',TIME+999999),
 'old_selection':lambda b:update(b,'selection','selected_at_ms',TIME-999999),
 'query_before_probe':lambda b:update(b,'collection','started_ms',TIME),
 'query_too_late':lambda b:update(b,'collection','started_ms',TIME+999999),
 'query_too_long':lambda b:update(b,'collection','finished_ms',TIME+99000),
 'old_wfp':lambda b:b.__setitem__('xml',b['xml'].replace(b'06:25:38.472Z',b'06:24:38.472Z')),
 'empty_wfp':lambda b:b.__setitem__('xml',b'<netEvents/>'),
 'allow_not_block':lambda b:b.__setitem__('xml',b['xml'].replace(b'FWP_ACTION_BLOCK',b'FWP_ACTION_PERMIT')),
 'unrelated_filter':lambda b:b.__setitem__('xml',b['xml'].replace(b'AppContainer Loopback',b'Unrelated filter')),
 'reversed_ports':lambda b:b.__setitem__('xml',b['xml'].replace(b'<localPort>64917</localPort>',b'<localPort>64924</localPort>')),
 'query_unscoped':lambda b:update(b,'collection','arguments',['wfp','show','netevents']),
 'account_not_removed':lambda b:update(b,'fixture','accountRemoved',False),
 'cleanup_failed':lambda b:update(b,'fixture','cleanupErrors',['failed']),
 'profile_not_removed':lambda b:update(b,'fixture','profileRemoved',False),
 'tree_not_removed':lambda b:update(b,'fixture','temporaryTreeRemoved',False),
 'negative_control_not_rejected':lambda b:update(b,'fixture','elevatedControlRejected',False),
 'wrapper_failed':lambda b:update(b,'run','error','unexpected'),
 'binary_changed':lambda b:update(b,'fixture','binarySha256','d'*64),
 'checkout_changed':lambda b:update(b,'fixture','checkout','d'*40),
 'incomplete_sources':lambda b:update(b,'selection','source_sha256',{}),
 'native_exit_erased':lambda b:update(b,'run','nativeExitCode',0),
 'token_elevated':lambda b:alter_record(b,'diagnostic','process_token','elevated',True),
 'missing_subject':lambda b:alter_record(b,'diagnostic','broker_tcp_subjects','subjects',[]),
 'different_package':lambda b:alter_record(b,'diagnostic','broker_tcp_subjects','package_sid',None),
 'listener_disagreement':lambda b:alter_record(b,'diagnostic','broker_listener_binding','port',1),
 'extra_connection':lambda b:alter_record(b,'check','no_additional_loopback_connection_observed','passed',False),
 'helper_hidden':lambda b:alter_record(b,'diagnostic','job_member','image_basename','conhost.exe'),
 'bad_counts':lambda b:alter_record(b,'diagnostic','job_accounting','active',3),
 'bool_pid':lambda b:alter_record(b,'diagnostic','job_accounting','pid_list',[True,4002]),
 'native_failure_erased':lambda b:alter_record(b,'check','loopback_explicit_denial','passed',True),
}
for name,mutation in CASES.items():
    def test(self,mutate=mutation):
        data=fixture();mutate(data);rehash(data)
        self.assertEqual(v.evaluate(data)['status'],'REJECT')
    setattr(WitnessTests,'test_reject_'+name,test)

if __name__=='__main__':unittest.main()
