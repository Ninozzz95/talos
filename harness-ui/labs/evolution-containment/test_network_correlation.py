"""Synthetic adversarial tests: no OS access, credentials or networking."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import review_network_correlation as reviewer

IMAGE = r"\device\harddiskvolume5\fixture\parent.exe"
OWNER = "S-1-5-21-11-22-33-500"
STAMP = "2026-09-17T06:25:38.472Z"
TIME = 1789626338472

def fixture():
    app = (IMAGE + "\0").encode("utf-16le").hex()
    xml = f'''<?xml version="1.0"?><netEvents><item>
<header><timeStamp>{STAMP}</timeStamp><ipProtocol>6</ipProtocol>
<localAddrV4>127.0.0.1</localAddrV4><remoteAddrV4>127.0.0.1</remoteAddrV4>
<localPort>64917</localPort><remotePort>64924</remotePort>
<appId><data>{app}</data></appId><userId>{OWNER}</userId><packageSid>S-1-0-0</packageSid></header>
<type>FWPM_NET_EVENT_TYPE_PUBLIC_CLASSIFY_DROP</type><classifyDrop>
<filterId>80061</filterId><isLoopback>true</isLoopback><msFwpDirection>MS_FWP_DIRECTION_OUT</msFwpDirection></classifyDrop>
<internalFields><filterOrigin>AppContainer Loopback</filterOrigin><terminatingFiltersInfo><item>
<filterId>80061</filterId><actionType>FWP_ACTION_BLOCK</actionType>
<subLayer>FWPP_SUBLAYER_INTERNAL_FIREWALL_APP_ISOLATION</subLayer>
</item></terminatingFiltersInfo></internalFields></item></netEvents>'''
    return [
        {"check": "positive_control_prerequisite", "passed": True},
        {"diagnostic": "broker_tcp_subjects", "schema": "talos.tcp-ownership.v1", "used_for_verdict": False,
         "address": "127.0.0.1", "listener_pid": 4000, "listener_port": 64917, "listener_image_nt": IMAGE,
         "owner_sid": OWNER, "package_sid": "S-1-15-2-1-2-3", "started_ms": TIME-500,
         "finished_ms": TIME+2500, "subjects": [{"pid": 4001, "source_port": 64924, "target_port": 64917,
             "created_ms": TIME-400, "first_ms": TIME-10, "last_ms": TIME+1000,
             "tcp_state": 3, "image_match": True, "package_match": True, "owner_match": True}]},
        {"diagnostic": "broker_listener_binding", "address": "127.0.0.1", "port": 64917},
        {"diagnostic": "broker_wfp_localport_events", "used_for_verdict": False,
         "collection_modified": False, "text": xml},
        {"check": "no_additional_loopback_connection_observed", "passed": True},
        {"check": "loopback_explicit_denial", "passed": False, "error": "timeout is not access denial"},
        {"summary": "independent_checks", "attempted": 10, "failed": 1},
    ]

class CorrelationTests(unittest.TestCase):
    def test_matching_independent_flow_is_recognized_without_overriding_native_gate(self):
        data = fixture(); before = copy.deepcopy(data)
        result = reviewer.review(data)
        self.assertEqual(result["status"], "VERIFIED_FILTER_BLOCK")
        self.assertFalse(result["legacy_gate_changed"])
        self.assertFalse(result["full_containment_verified"])
        self.assertFalse(result["release_ready"])
        self.assertEqual(data, before)
        self.assertFalse(data[-2]["passed"])

    def test_utc_epoch_conversion(self):
        self.assertEqual(reviewer.timestamp_ms(STAMP), TIME)
        self.assertEqual(reviewer.timestamp_ms("1970-01-01T00:00:00.001Z"), 1)

    def test_duplicate_json_keys_are_rejected(self):
        with self.assertRaises(reviewer.EvidenceError):
            json.loads('{"passed":false,"passed":true}', object_pairs_hook=reviewer.no_duplicates)

    def test_bound_log_reader(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"input.jsonl"
            path.write_bytes(b"x"*(reviewer.MAX_LOG_BYTES+1))
            with self.assertRaises(reviewer.EvidenceError):
                reviewer.read_records(path)

    def test_invalid_utf8_log(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"input.jsonl"; path.write_bytes(b"\xff\xfe")
            with self.assertRaises(UnicodeError):
                reviewer.read_records(path)

    def test_parent_image_comparison_is_case_insensitive_but_not_basename_only(self):
        data = fixture(); data[1]["listener_image_nt"] = IMAGE.upper()
        self.assertEqual(reviewer.review(data)["status"], "VERIFIED_FILTER_BLOCK")
        data[1]["listener_image_nt"] = IMAGE.replace("fixture", "different")
        self.assertEqual(reviewer.review(data)["status"], "NO_CORRELATED_BLOCK")

    def test_empty_xml_is_not_a_block(self):
        data = fixture(); data[3]["text"] = "<netEvents/>"
        self.assertEqual(reviewer.review(data)["status"], "NO_CORRELATED_BLOCK")

    def test_no_data_is_not_proof(self):
        self.assertEqual(reviewer.review([])["status"], "INVALID_EVIDENCE")


def set_at(index, key, value):
    return lambda data: data[index].__setitem__(key, value)

def set_subject(key, value):
    return lambda data: data[1]["subjects"][0].__setitem__(key, value)

def xml_replace(old, new):
    return lambda data: data[3].__setitem__("text", data[3]["text"].replace(old, new))

CASES = {
    "missing_broker_observation": lambda d: d.pop(1),
    "duplicate_broker_observation": lambda d: d.insert(1, copy.deepcopy(d[1])),
    "duplicate_wfp_observation": lambda d: d.insert(3, copy.deepcopy(d[3])),
    "missing_positive_control": lambda d: d.pop(0),
    "failed_positive_control": set_at(0, "passed", False),
    "numeric_positive_control": set_at(0, "passed", 1),
    "extra_connection": set_at(4, "passed", False),
    "wrong_observation_schema": set_at(1, "schema", "v99"),
    "observer_claims_to_override_gate": set_at(1, "used_for_verdict", True),
    "collection_modified": set_at(3, "collection_modified", True),
    "wfp_claims_to_override_gate": set_at(3, "used_for_verdict", True),
    "observation_after_wfp": lambda d: d.__setitem__(slice(1,4), [d[2],d[3],d[1]]),
    "non_loopback_target": set_at(1, "address", "8.8.8.8"),
    "zero_listener_pid": set_at(1, "listener_pid", 0),
    "boolean_listener_pid": set_at(1, "listener_pid", True),
    "string_listener_port": set_at(1, "listener_port", "64917"),
    "different_listener_binding": set_at(2, "port", 64918),
    "too_long_window": set_at(1, "finished_ms", TIME+999999),
    "backwards_window": set_at(1, "finished_ms", TIME-600),
    "missing_package": set_at(1, "package_sid", None),
    "empty_subjects": set_at(1, "subjects", []),
    "ambiguous_subjects": lambda d: d[1]["subjects"].append(copy.deepcopy(d[1]["subjects"][0])),
    "parent_as_candidate": set_subject("pid", 4000),
    "wrong_source_port": set_subject("source_port", 64925),
    "same_source_target": set_subject("source_port", 64917),
    "invalid_source_port": set_subject("source_port", 65536),
    "wrong_target_port": set_subject("target_port", 64918),
    "not_syn_sent": set_subject("tcp_state", 5),
    "unverified_image": set_subject("image_match", False),
    "unverified_owner": set_subject("owner_match", False),
    "unverified_package": set_subject("package_match", False),
    "numeric_identity": set_subject("package_match", 1),
    "old_process": set_subject("created_ms", TIME-1000),
    "observation_before_creation": set_subject("first_ms", TIME-401),
    "inverted_samples": set_subject("last_ms", TIME-11),
    "future_samples": set_subject("last_ms", TIME+2600),
    "wrong_server_image": set_at(1, "listener_image_nt", r"\device\elsewhere\parent.exe"),
    "wrong_owner": set_at(1, "owner_sid", "S-1-5-21-999"),
    "xml_dtd": xml_replace("<netEvents>", '<!DOCTYPE netEvents [<!ENTITY a "value">]><netEvents>'),
    "xml_external_entity": xml_replace("<netEvents>", '<!DOCTYPE netEvents SYSTEM "file:///C:/private"><netEvents>'),
    "xml_namespace": xml_replace("<netEvents>", '<netEvents xmlns="unexpected">'),
    "xml_truncated": xml_replace("</netEvents>", ""),
    "xml_duplicate_port": xml_replace("<localPort>64917</localPort>", "<localPort>64917</localPort><localPort>64917</localPort>"),
    "xml_bad_protocol": xml_replace("<ipProtocol>6</ipProtocol>", "<ipProtocol>17</ipProtocol>"),
    "xml_wrong_address": xml_replace("<remoteAddrV4>127.0.0.1</remoteAddrV4>", "<remoteAddrV4>10.0.0.1</remoteAddrV4>"),
    "xml_swapped_ports": xml_replace("<localPort>64917</localPort><remotePort>64924</remotePort>", "<localPort>64924</localPort><remotePort>64917</remotePort>"),
    "xml_expired_event": xml_replace(STAMP, "2026-09-17T06:24:38.472Z"),
    "xml_future_event": xml_replace(STAMP, "2026-09-17T06:26:38.472Z"),
    "xml_wrong_package_at_listener": xml_replace("S-1-0-0", "S-1-15-2-1-2-3"),
    "xml_not_drop": xml_replace("FWPM_NET_EVENT_TYPE_PUBLIC_CLASSIFY_DROP", "FWPM_NET_EVENT_TYPE_CLASSIFY_ALLOW"),
    "xml_not_loopback": xml_replace("<isLoopback>true</isLoopback>", "<isLoopback>false</isLoopback>"),
    "xml_other_direction": xml_replace("MS_FWP_DIRECTION_OUT", "MS_FWP_DIRECTION_IN"),
    "xml_other_origin": xml_replace("AppContainer Loopback", "Unrelated rule"),
    "xml_filter_id_mismatch": xml_replace("<classifyDrop>\n<filterId>80061", "<classifyDrop>\n<filterId>999"),
    "xml_non_block_action": xml_replace("FWP_ACTION_BLOCK", "FWP_ACTION_PERMIT"),
    "xml_unrelated_sublayer": xml_replace("FWPP_SUBLAYER_INTERNAL_FIREWALL_APP_ISOLATION", "OTHER_LAYER"),
    "xml_appid_bad_utf16": xml_replace((IMAGE+"\0").encode("utf-16le").hex(), "00d80000"),
    "xml_appid_embedded_nul": xml_replace((IMAGE+"\0").encode("utf-16le").hex(), (IMAGE+"\0evil\0").encode("utf-16le").hex()),
}
for name, mutate in CASES.items():
    def test(self, mutation=mutate):
        data = fixture(); mutation(data)
        self.assertNotEqual(reviewer.review(data)["status"], "VERIFIED_FILTER_BLOCK")
    setattr(CorrelationTests, "test_reject_"+name, test)

if __name__ == "__main__":
    unittest.main()
