"""Synthetic v2 acceptance tests. No Windows, network or real user data."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import review_containment_v2 as v
from test_network_correlation import fixture as network_fixture, TIME

SPEC_BYTES = (json.dumps(v.SPEC, indent=2) + '\n').encode()

def fixture():
    network = network_fixture()
    observation, binding, wfp = network[1:4]
    run_name = 'TALOS.Spike.4000.1789626338000000000'
    records = [{'schema':'talos.containment-spike.v1', 'windows_x64':True, 'launcher_elevated':True}]
    def check(name, **extra):
        records.append({'check':name, 'passed':True, **extra})
    def token(role):
        records.append({'diagnostic':'process_token', 'role':role, 'user_matches_owner':True,
                        'appcontainer':role == 'contained-child', 'elevated':True,
                        'integrity_sid':'S-1-16-4096' if role == 'contained-child' else 'S-1-16-8192'})
    def group(pids):
        count = len(pids)
        records.append({'diagnostic':'job_accounting', 'returned_bytes':48, 'total':count,
                        'active':count, 'terminated':0, 'pid_list_status':0, 'assigned':count,
                        'listed':count, 'pid_list':pids})
        for pid in pids:
            records.append({'diagnostic':'job_member', 'pid':pid, 'image_basename':'probe.exe',
                            'image_error':0, 'appcontainer':True, 'wait_status':258})
    token('parent'); check(v.PREFIX_CHECKS[0]); token('control-child')
    check(v.PREFIX_CHECKS[1]); check(v.PREFIX_CHECKS[2]); token('contained-child')
    records.append({'probe':run_name+'.contained', 'read_error':5, 'write_error':5,
                    'immutable_error':5, 'network_error':2**32-1})
    check(v.PREFIX_CHECKS[3]); check(v.PREFIX_CHECKS[4]); group([4001,4002])
    check(v.PREFIX_CHECKS[5]); check(v.PREFIX_CHECKS[6])
    records.append({'check':'loopback_explicit_denial', 'passed':False,
                    'error':'loopback denial was not WSAEACCES (observed 4294967295); timeout/refusal is not evidence'})
    for suffix, role, label in [('uncontained-peer','control-child',v.SUFFIX_CHECKS[0]),
                                 ('foreign-sid','contained-child',v.SUFFIX_CHECKS[1]),
                                 ('bad-frame','contained-child',v.SUFFIX_CHECKS[2])]:
        token(role); check(run_name+'.'+suffix); check(label)
    for count in (5,4):
        for _ in range(count): token('contained-child')
        group(list(range(5000+count*10, 5000+count*10+count)))
        check('active_process_cap', limit=count, observed_active=count, fifth_launch_denied=count==4)
    check('process_limit_enforced')
    records.extend([observation,binding,wfp])
    for name in v.SUFFIX_CHECKS[4:]: check(name)
    records.append({'summary':'independent_checks','attempted':10,'failed':1})
    hashes = {name:'a'*64 for name in (*v.ROOT_FILES, 'src/main.rs')}
    hashes[v.SPEC_NAME] = v.digest(SPEC_BYTES)
    selection = {'schema':'talos.lab-preselection.v2', 'contract_id':v.CONTRACT_ID,
                 'contract_sha256':v.digest(SPEC_BYTES), 'checkout':'b'*40,
                 'selected_at_ms':TIME-1000, 'source_sha256':hashes}
    manifest = {'schema':'talos.containment-spike.run.v1', 'checkout':'b'*40,
                'architecture':'X64','toolchain':'1.90.0','os':'Microsoft Windows NT 10.0.20348.0',
                'status':'FAIL','probeExitCode':1,'correlationExitCode':0,
                'error':v.NATIVE_ERROR,'binarySha256':'c'*64,
                'inputs':[{'path':name,'sha256':hashes[name]} for name in (*v.ROOT_FILES[:6], 'src/main.rs')]}
    return records, manifest, selection


def at(records, key, value):
    return next(r for r in records if r.get(key)==value)


class ContractTests(unittest.TestCase):
    def test_valid_scope_pass_preserves_legacy_failure_and_input(self):
        args=fixture(); before=copy.deepcopy(args)
        result=v.evaluate(*args,SPEC_BYTES)
        self.assertEqual(result['status'],'SCOPED_PASS', result)
        self.assertEqual(result['legacy_status'],'FAIL')
        for key in ['release_ready','full_containment_verified','windows_client_verified',
                    'producer_authenticated','legacy_evidence_rewritten']:
            self.assertIs(result[key],False)
        self.assertEqual(args,before)

    def test_real_os_error_still_requires_independent_block(self):
        records,manifest,selection=fixture()
        at(records,'probe',next(r['probe'] for r in records if 'probe' in r))['network_error']=10013
        legacy=at(records,'check','loopback_explicit_denial');legacy['passed']=True;del legacy['error']
        records[-1]['failed']=0
        records.extend([{'check':'temporary_profiles_and_fixtures_removed','passed':True},
                        {'result':'PASS','scope':'synthetic-containment-probes-only','standard_user_verified':False}])
        manifest.update(status='PASS',probeExitCode=0,error=None)
        self.assertEqual(v.evaluate(records,manifest,selection,SPEC_BYTES)['status'],'SCOPED_PASS')
        at(records,'diagnostic','broker_wfp_localport_events')['text']='<netEvents/>'
        self.assertEqual(v.evaluate(records,manifest,selection,SPEC_BYTES)['status'],'REJECT')

    def test_every_native_gate_must_be_present(self):
        records,manifest,selection=fixture()
        for index, record in enumerate(records):
            if 'check' not in record:continue
            data=copy.deepcopy(records);data.pop(index)
            with self.subTest(check=record['check']):
                self.assertEqual(v.evaluate(data,manifest,selection,SPEC_BYTES)['status'],'REJECT')

    def test_no_other_failure_is_overridden(self):
        records,manifest,selection=fixture()
        for index, record in enumerate(records):
            if record.get('passed') is not True:continue
            data=copy.deepcopy(records);data[index]['passed']=False
            with self.subTest(check=record.get('check')):
                self.assertEqual(v.evaluate(data,manifest,selection,SPEC_BYTES)['status'],'REJECT')

    def test_duplicate_or_nonfinite_json_rejected(self):
        for raw in [b'{"a":1,"a":2}',b'{"value":NaN}',b'{"value":Infinity}',b'{"value":-Infinity}']:
            with self.subTest(raw=raw),self.assertRaises(ValueError):v.strict_json(raw)

    def test_cli_rejects_historical_run_without_preselection(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory);records,manifest,_=fixture()
            (path/'probes.jsonl').write_text('\n'.join(json.dumps(r) for r in records))
            (path/'run.json').write_text(json.dumps(manifest))
            result=subprocess.run([sys.executable,str(Path(v.__file__)), 'replay',str(path)],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('REJECT',result.stdout)
            self.assertFalse((path/'v2-result.json').exists())

    def test_begin_refuses_existing_evidence_without_overwriting(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory);marker=path/'keep.txt';marker.write_text('unchanged')
            result=subprocess.run([sys.executable,str(Path(v.__file__)), 'begin',str(path)],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertEqual(marker.read_text(),'unchanged')


def rset(key,value,field,new):
    return lambda r,m,s: at(r,key,value).__setitem__(field,new)

def mset(field,value):return lambda r,m,s: m.__setitem__(field,value)
def sset(field,value):return lambda r,m,s: s.__setitem__(field,value)

CASES={
    'missing_selection':lambda r,m,s:s.clear(),
    'wrong_contract':sset('contract_id','legacy-v1'),
    'changed_spec_hash':sset('contract_sha256','0'*64),
    'late_selection':sset('selected_at_ms',TIME),
    'stale_selection':sset('selected_at_ms',TIME-700000),
    'boolean_time':sset('selected_at_ms',True),
    'different_checkout':sset('checkout','d'*40),
    'invalid_checkout':sset('checkout','main'),
    'empty_sources':sset('source_sha256',{}),
    'unsafe_source':lambda r,m,s:s['source_sha256'].__setitem__('../evil','e'*64),
    'absolute_source':lambda r,m,s:s['source_sha256'].__setitem__('/evil','e'*64),
    'windows_source':lambda r,m,s:s['source_sha256'].__setitem__('C:\\evil','e'*64),
    'source_case_collision':lambda r,m,s:s['source_sha256'].__setitem__('CARGO.TOML','e'*64),
    'bad_digest':lambda r,m,s:s['source_sha256'].__setitem__('Cargo.toml','not-a-digest'),
    'source_changed':lambda r,m,s:m['inputs'][0].__setitem__('sha256','e'*64),
    'source_omitted':lambda r,m,s:m['inputs'].pop(),
    'duplicate_source':lambda r,m,s:m['inputs'].append(copy.deepcopy(m['inputs'][0])),
    'new_unmeasured_native_source':lambda r,m,s:s['source_sha256'].__setitem__('src/extra.rs','e'*64),
    'missing_binary':mset('binarySha256',None),
    'wrong_manifest':mset('schema','unknown'),
    'client_os_not_server':mset('os','Microsoft Windows NT 10.0.26100.0'),
    'different_toolchain':mset('toolchain','1.99.0'),
    'different_architecture':mset('architecture','Arm64'),
    'erased_failure':mset('status','PASS'),
    'wrong_exit':mset('probeExitCode',0),
    'boolean_exit':mset('probeExitCode',True),
    'companion_failed':mset('correlationExitCode',1),
    'companion_boolean':mset('correlationExitCode',False),
    'unrelated_runner_error':mset('error','build failed'),
    'missing_header':lambda r,m,s:r.pop(0),
    'duplicate_header':lambda r,m,s:r.insert(0,copy.deepcopy(r[0])),
    'unknown_native_check':lambda r,m,s:r.insert(-1,{'check':'new-unknown','passed':True}),
    'duplicate_check':lambda r,m,s:r.insert(-1,{'check':'profile_cleanup','passed':True}),
    'numeric_check':rset('check','profile_cleanup','passed',1),
    'conflicting_check':rset('check','profile_cleanup','error','failed'),
    'summary_zero_checks':rset('summary','independent_checks','attempted',0),
    'summary_erased_failure':rset('summary','independent_checks','failed',0),
    'summary_boolean_failure':rset('summary','independent_checks','failed',True),
    'trailing_fake_pass':lambda r,m,s:r.append({'result':'PASS'}),
    'trailing_diagnostic':lambda r,m,s:r.append({'diagnostic':'late'}),
    'extra_native_probe':lambda r,m,s:r.insert(3,{'probe':'another'}),
    'missing_accounting':lambda r,m,s:r.remove(at(r,'diagnostic','job_accounting')),
    'wrong_job_count':rset('diagnostic','job_accounting','active',3),
    'job_member_excluded':rset('diagnostic','job_accounting','listed',1),
    'job_numeric_state':rset('diagnostic','job_accounting','pid_list_status',False),
    'job_duplicate_pid':rset('diagnostic','job_accounting','pid_list',[4001,4001]),
    'job_wrong_pid':rset('diagnostic','job_accounting','pid_list',[1,2]),
    'job_missing_member':lambda r,m,s:r.remove(at(r,'diagnostic','job_member')),
    'job_helper':rset('diagnostic','job_member','image_basename','conhost.exe'),
    'job_not_alive':rset('diagnostic','job_member','wait_status',0),
    'job_not_contained':rset('diagnostic','job_member','appcontainer',False),
    'job_image_failed':rset('diagnostic','job_member','image_error',5),
    'cap_not_enforced':rset('check','active_process_cap','observed_active',8),
    'cap_wrong_boolean':rset('check','active_process_cap','fifth_launch_denied',0),
    'missing_token':lambda r,m,s:r.remove(at(r,'diagnostic','process_token')),
    'token_owner_false':rset('diagnostic','process_token','user_matches_owner',False),
    'token_role_wrong':rset('diagnostic','process_token','role','foreign'),
    'missing_wfp':lambda r,m,s:r.remove(at(r,'diagnostic','broker_wfp_localport_events')),
    'wfp_empty':rset('diagnostic','broker_wfp_localport_events','text','<netEvents/>'),
    'collection_changed':rset('diagnostic','broker_wfp_localport_events','collection_modified',True),
    'missing_tcp':lambda r,m,s:r.remove(at(r,'diagnostic','broker_tcp_subjects')),
}
for name,mutation in CASES.items():
    def test(self, mutate=mutation):
        args=fixture();mutate(*args)
        result=v.evaluate(*args,SPEC_BYTES)
        self.assertEqual(result['status'],'REJECT',result)
    setattr(ContractTests,'test_reject_'+name,test)

if __name__=='__main__':unittest.main()
