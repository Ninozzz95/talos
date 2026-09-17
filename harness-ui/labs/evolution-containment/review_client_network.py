"""Correlate a standard-user client probe with a separate read-only CI witness.

This is a laboratory evidence check, not production authority or authentication.
Native FAIL and denied standard-user diagnostic access remain unchanged on disk.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import ntpath
from pathlib import Path
import re
import sys
import review_network_correlation as net

SCOPE = "windows11-arm64-x64-emulated-standard-user-ipv4-loopback"
SOURCES = ("ci-observe-client-network.ps1", "ci-client-standard-user.ps1", "run-client.ps1",
           "review_client_network.py", "test_client_network.py", "review_network_correlation.py")
HEX = re.compile(r"[0-9a-f]{64}")
require = net.require


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def exact(actual, expected, message):
    require(json.dumps(actual, sort_keys=True, allow_nan=False) ==
            json.dumps(expected, sort_keys=True, allow_nan=False), message)


def load_json(raw: bytes):
    def invalid(text):
        raise net.EvidenceError("non-finite JSON: " + text)
    return json.loads(raw.decode("utf-8-sig"), object_pairs_hook=net.no_duplicates, parse_constant=invalid)


def bounded(path: Path, maximum=net.MAX_LOG_BYTES) -> bytes:
    require(not path.is_symlink(), "symlink evidence refused")
    with path.open("rb") as file:
        raw = file.read(maximum + 1)
    require(len(raw) <= maximum, "evidence size limit exceeded")
    return raw


def xml_text(raw: bytes) -> str:
    require(0 < len(raw) <= 524288, "invalid XML byte size")
    if raw.startswith(b"\xff\xfe"):
        return raw[2:].decode("utf-16le", errors="strict")
    return raw.decode("utf-8-sig", errors="strict")


def native_checks(records, profile, fixture, run):
    require(0 < len(records) <= 512 and all(type(r) is dict for r in records), "invalid records")
    exact(records[0], profile, "host profile does not match native first record")
    expected = {"schema":"talos.client-host-profile.v1", "os_major":10, "os_minor":0,
                "build":26200, "product_type":1, "native_machine":43620, "machine_type":34404,
                "elevated":False, "elevation_type":1, "integrity_rid":8192,
                "administrators_sid_present":False, "appcontainer":False, "restricted_sid_count":0,
                "scope":"windows11-arm64-x64-emulated", "standard_user":True, "accepted":True,
                "full_containment_verified":False}
    for key, value in expected.items():
        exact(profile.get(key), value, "wrong measured profile: " + key)
    require(type(profile.get("process_machine")) is int and profile["process_machine"] in (0,34404), "invalid WOW64 machine")
    require(fixture.get("schema") == "talos.client-ci-fixture.v1", "wrong CI fixture schema")
    for key in ("provisionerElevated","accountCreated","accountRemoved","profileRemoved",
                "temporaryTreeRemoved","elevatedControlRejected"):
        require(fixture.get(key) is True, "incomplete CI fixture: " + key)
    exact(fixture.get("cleanupErrors"), [], "CI cleanup failed")
    exact(fixture.get("error"), None, "CI provisioner failed")
    exact(fixture.get("clientNativeExit"), 1, "legacy client exit changed")
    require(run.get("status") == "CLIENT_EXECUTED_NOT_CERTIFIED" and run.get("error") is None, "client wrapper failed")
    exact(run.get("nativeExitCode"), 1, "native FAIL not preserved")
    _, header = net.unique(records, "schema", "talos.containment-spike.v1")
    exact(header.get("launcher_elevated"), False, "launcher was elevated")
    require(header.get("windows_x64") is True, "wrong process architecture")
    checks = [r for r in records if "check" in r]
    _, summary = net.unique(records,"summary","independent_checks")
    exact(summary, {"summary":"independent_checks","attempted":10,"failed":1}, "native summary changed")
    required = ("parent_scratch_positive_control", "unrestricted_positive_control", "positive_control_prerequisite",
                "private_and_immutable_files_denied", "environment_excluded_and_scratch_effect_observed",
                "job_close_terminates_observed_tree", "contained_filesystem_environment_and_tree_case",
                "uncontained_peer_rejected", "foreign_container_rejected", "malformed_frame_rejected",
                "process_limit_enforced", "no_additional_loopback_connection_observed",
                "fixture_cleanup", "foreign_profile_cleanup", "profile_cleanup")
    for name in required:
        _, item = net.unique(records,"check",name)
        require(item.get("passed") is True and "error" not in item, "native check failed: " + name)
    failures = [r for r in checks if r.get("passed") is not True]
    exact([r.get("check") for r in failures], ["loopback_explicit_denial"], "other native failures")
    require(failures[0].get("passed") is False, "invalid native failure type")
    require(not any("result" in r for r in records), "unexpected native success record")
    probes = [r for r in records if "probe" in r]
    require(len(probes) == 1, "ambiguous contained report")
    probe = probes[0]
    for key in ("read_error","write_error","immutable_error"):
        exact(probe.get(key), 5, "file denial not observed")
    exact(probe.get("network_error"), 4294967295, "expected original timeout sentinel")
    exact(failures[0].get("error"), "loopback denial was not WSAEACCES (observed 4294967295); timeout/refusal is not evidence", "unrecognized native failure")
    groups = [r for r in records if r.get("diagnostic") == "job_accounting"]
    exact([r.get("active") for r in groups], [2,5,4], "unexpected full Job counts")
    for group, count in zip(groups,(2,5,4)):
        for key in ("listed","assigned"):
            exact(group.get(key),count,"Job list does not match accounting")
        exact(group.get("pid_list_status"),0,"Job enumeration failed")
        ids=group.get("pid_list")
        require(type(ids) is list and len(ids)==count and all(type(x) is int and x>0 for x in ids)
                and len(set(ids))==count,"invalid full Job PID list")
        index=records.index(group)
        members=records[index+1:index+1+count]
        exact([m.get("pid") for m in members],ids,"Job members missing or reordered")
        for member in members:
            require(member.get("diagnostic")=="job_member" and member.get("appcontainer") is True
                    and member.get("image_basename")=="probe.exe","unexpected Job member")
            exact(member.get("wait_status"),258,"member not observed alive")
            exact(member.get("image_error"),0,"member image unavailable")
    require(sum(r.get("diagnostic")=="job_member" for r in records)==11,"extra Job members")
    caps=[r for r in checks if r.get("check")=="active_process_cap"]
    exact(caps,[{"check":"active_process_cap","limit":c,"observed_active":c,"fifth_launch_denied":c==4,"passed":True} for c in (5,4)],"process cap not observed")
    tokens=[r for r in records if r.get("diagnostic")=="process_token"]
    exact([r.get("role") for r in tokens], ["parent","control-child","contained-child","control-child"]+["contained-child"]*11, "token observations missing")
    for token in tokens:
        require(token.get("elevated") is False and token.get("user_matches_owner") is True,"elevated or wrong-owner measured process")
    return groups[0]["pid_list"]


def match_flow(records, selection, collection, xml):
    pos, positive=net.unique(records,"check","positive_control_prerequisite")
    obs_pos, obs=net.unique(records,"diagnostic","broker_tcp_subjects")
    end, no_extra=net.unique(records,"check","no_additional_loopback_connection_observed")
    require(pos < obs_pos < end and positive.get("passed") is True and no_extra.get("passed") is True,"native observer ordering")
    require(obs.get("schema")=="talos.tcp-ownership.v1" and obs.get("used_for_verdict") is False,"unknown TCP observer")
    require(obs.get("address")=="127.0.0.1" and obs.get("owner_sid")==selection["owner_sid"],"wrong endpoint/owner")
    require(net.nt_image(obs.get("listener_image_nt"))==net.nt_image(selection["listener_image_nt"]),"different full listener image")
    started=net.integer(obs.get("started_ms"),"start",1)
    finished=net.integer(obs.get("finished_ms"),"end",started+1,started+60000)
    selected=net.integer(selection.get("selected_at_ms"),"selection",started-600000,started)
    collected=net.integer(collection.get("started_ms"),"query start",finished,started+60000)
    net.integer(collection.get("finished_ms"),"query end",collected,collected+15000)
    listener=net.integer(obs.get("listener_pid"),"listener",1,2**32-1)
    target=net.integer(obs.get("listener_port"),"target",1,65535)
    _, binding=net.unique(records,"diagnostic","broker_listener_binding")
    exact(binding.get("port"),target,"listener binding differs")
    require(binding.get("address")=="127.0.0.1","wrong binding address")
    subjects=obs.get("subjects")
    require(type(subjects) is list and len(subjects)==1 and type(subjects[0]) is dict,"ambiguous TCP owner")
    subject=subjects[0]
    pid=net.integer(subject.get("pid"),"subject",1,2**32-1)
    source=net.integer(subject.get("source_port"),"source",1,65535)
    require(pid!=listener and source!=target,"subject aliases listener")
    exact(subject.get("target_port"),target,"wrong TCP target")
    exact(subject.get("tcp_state"),3,"not a SYN_SENT observation")
    for key in ("image_match","package_match","owner_match"):
        require(subject.get(key) is True,"TCP identity unverified: "+key)
    require(type(obs.get("package_sid")) is str and re.fullmatch(r"S-1-15-2-(?:\d+-)+\d+",obs["package_sid"]) is not None,"invalid package identity")
    created=net.integer(subject.get("created_ms"),"created",started,finished)
    first=net.integer(subject.get("first_ms"),"first",created,finished)
    last=net.integer(subject.get("last_ms"),"last",first,finished)
    earliest,latest=max(started,first-100),min(finished,last+100)
    args=['wfp','show','netevents','file='+ntpath.join(selection['witness_directory'],'events.xml'),
          'protocol=6','localaddr=127.0.0.1','remoteaddr=127.0.0.1',f'localport={target}',f'remoteport={source}',
          'appid='+selection['listener_image_dos'],'userid='+selection['owner_sid'],'timewindow=60']
    exact(collection.get("arguments"),args,"witness query not exactly scoped/read-only")
    matches=[]
    for event in net.xml_events(xml):
        if any(net.scalar(event,path)!=value for path,value in (
            ("header/ipProtocol","6"),("header/localAddrV4","127.0.0.1"),("header/remoteAddrV4","127.0.0.1"),
            ("header/localPort",str(target)),("header/remotePort",str(source)))):
            continue
        when=net.timestamp_ms(net.scalar(event,"header/timeStamp"))
        if not earliest<=when<=latest: continue
        if net.app_image(event)!=net.nt_image(selection['listener_image_nt']): continue
        if net.scalar(event,'header/userId')!=selection['owner_sid']: continue
        if any(net.scalar(event,path)!=value for path,value in (
            ("header/packageSid","S-1-0-0"),("type","FWPM_NET_EVENT_TYPE_PUBLIC_CLASSIFY_DROP"),
            ("classifyDrop/isLoopback","true"),("classifyDrop/msFwpDirection","MS_FWP_DIRECTION_IN"),
            ("internalFields/filterOrigin","AppContainer Loopback"))): continue
        # Windows 11 reports this block on the receiving listener. Its process
        # identity is additional OS evidence, not the candidate's reported PID.
        if net.scalar(event, 'internalFields/processId') != str(listener): continue
        filter_id=net.scalar(event,"classifyDrop/filterId")
        require(filter_id.isdecimal() and int(filter_id)>0,"invalid filter ID")
        filters=[f for f in event.findall('internalFields/terminatingFiltersInfo/item') if net.scalar(f,'filterId')==filter_id]
        if len(filters)!=1:continue
        if net.scalar(filters[0],'actionType')!='FWP_ACTION_BLOCK' or net.scalar(filters[0],'subLayer')!='FWPP_SUBLAYER_INTERNAL_FIREWALL_APP_ISOLATION':continue
        matches.append({'timestamp_ms':when,'subject_pid':pid,'source_port':source,'listener_port':target,'filter_id':int(filter_id)})
    require(matches,"no matching OS block for this non-admin client flow")
    return matches,pid


def evaluate(bundle: dict[str,bytes]) -> dict:
    result={"schema":"talos.client-network-observation.v1","status":"REJECT","scope":SCOPE,
            "producer_authenticated":False,"full_containment_verified":False,"release_ready":False,
            "native_evidence_rewritten":False,"runtime_elevated_for_observation":False,
            "privileged_ci_observer_required":True,"native_x64_client_verified":False}
    try:
        selection=load_json(bundle['selection']);collection=load_json(bundle['collection'])
        run=load_json(bundle['run']);fixture=load_json(bundle['fixture']);profile=load_json(bundle['profile'])
        records=[load_json(line) for line in bundle['probes'].splitlines() if line.strip()]
        require(selection.get('schema')=='talos.client-network-witness.selection.v1' and selection.get('scope')==SCOPE,'unknown selection')
        require(selection.get('observer_elevated') is True and selection.get('measured_runtime_elevated') is False,'observer/runtime role mismatch')
        require(selection.get('network_configuration_changed') is False,'network configuration changed')
        require(re.fullmatch(r'S-1-5-21-\d+-\d+-\d+-\d+',selection.get('owner_sid','')) is not None,'invalid fixture owner')
        require(type(selection.get('checkout')) is str and re.fullmatch(r'[0-9a-f]{40}',selection['checkout']) is not None,'invalid checkout')
        require(selection['checkout']==fixture.get('checkout'),'checkout mismatch')
        sources=selection.get('source_sha256')
        require(type(sources) is dict and set(sources)==set(SOURCES),'incomplete source selection')
        for value in [*sources.values(),selection.get('binary_sha256')]:
            require(type(value) is str and HEX.fullmatch(value) is not None,'invalid source/binary digest')
        for name in SOURCES:
            require(sources[name] == sha(bounded(Path(__file__).with_name(name))),
                    'selected source differs from replayed source: ' + name)
        for name in ('listener_image_dos','witness_directory'):
            value=selection.get(name)
            require(type(value) is str and re.match(r'^[A-Za-z]:\\',value) and not any(ord(c)<32 for c in value),'unsafe CI-owned path')
            require(ntpath.normpath(value)==value and '"' not in value,'non-normalized CI-owned path')
        require(collection.get('schema')=='talos.client-network-witness.collection.v1' and collection.get('status')=='COLLECTED_NOT_VERIFIED','witness did not collect')
        require(collection.get('observer_elevated') is True and collection.get('configuration_changed') is False and collection.get('error') is None,'witness errors or configuration changed')
        exact(collection.get('netsh_exit_code'),0,'netsh query failed')
        for key,data in (('selection_sha256',bundle['selection']),('probes_sha256',bundle['probes']),('xml_sha256',bundle['xml'])):
            require(collection.get(key)==sha(data),'witness bytes changed: '+key)
        for value in (run.get('binarySha256'),fixture.get('binarySha256')):
            require(value==selection['binary_sha256'],'binary mismatch')
        require(run.get('entrySha256')==sources['run-client.ps1'],'client entry mismatch')
        tree=native_checks(records,profile,fixture,run)
        matches,pid=match_flow(records,selection,collection,xml_text(bundle['xml']))
        require(pid in tree,'TCP subject not in measured Job tree')
        return {**result,'status':'CLIENT_NETWORK_BLOCK_OBSERVED','matches':matches,'legacy_native_exit':1,
                'standard_user_profile_observed':True,'non_network_checks_observed':True,
                'evidence_sha256':{key:sha(value) for key,value in bundle.items()}}
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,RecursionError,net.ET.ParseError) as error:
        return {**result,'reason':str(error)}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('evidence',type=Path)
    args=parser.parse_args();root=args.evidence
    names={'selection':'network-observer/selection.json','collection':'network-observer/collection.json',
           'xml':'network-observer/events.xml','probes':'standard-user/probes.jsonl',
           'run':'standard-user/client-run.json','profile':'standard-user/host-profile.json','fixture':'ci-fixture.json'}
    try: result=evaluate({key:bounded(root/name) for key,name in names.items()})
    except (OSError,ValueError) as error: result={'schema':'talos.client-network-observation.v1','status':'REJECT','reason':str(error),'full_containment_verified':False,'release_ready':False}
    text=json.dumps(result,indent=2,ensure_ascii=False)+'\n'
    # Result is supplementary and may be recomputed; raw evidence is never overwritten.
    (root/'client-network-result.json').write_text(text,encoding='utf-8');print(text,end='')
    return 0 if result['status']=='CLIENT_NETWORK_BLOCK_OBSERVED' else 1

if __name__=='__main__': sys.exit(main())
