//! Collect independent lab results without hiding failures behind an early return.
//! This is test infrastructure, not the Evolution Proof Gate.
use super::Result;
use std::fmt::Write;

pub(super) fn json_string(text: &str) -> String {
    let mut encoded = String::from("\"");
    for ch in text.chars() {
        match ch {
            '"' => encoded.push_str("\\\""),
            '\\' => encoded.push_str("\\\\"),
            '\n' => encoded.push_str("\\n"),
            '\r' => encoded.push_str("\\r"),
            '\t' => encoded.push_str("\\t"),
            '\u{0000}'..='\u{001f}' => { let _ = write!(encoded, "\\u{:04x}", ch as u32); }
            _ => encoded.push(ch),
        }
    }
    encoded.push('"');
    encoded
}

#[derive(Default)]
pub(super) struct Checks {
    attempted: usize,
    failures: Vec<String>,
}
impl Checks {
    pub(super) fn record(&mut self, name: &str, result: Result<()>) {
        self.attempted += 1;
        match result {
            Ok(()) => println!("{{\"check\":{},\"passed\":true}}", json_string(name)),
            Err(error) => {
                let bounded: String = error.chars().take(4096).collect();
                println!("{{\"check\":{},\"passed\":false,\"error\":{}}}",
                    json_string(name), json_string(&bounded));
                self.failures.push(format!("{name}: {bounded}"));
            }
        }
    }
    pub(super) fn finish(self) -> Result<()> {
        println!("{{\"summary\":\"independent_checks\",\"attempted\":{},\"failed\":{}}}",
            self.attempted, self.failures.len());
        if self.attempted == 0 { return Err("no checks executed".into()); }
        if self.failures.is_empty() { Ok(()) }
        else { Err(self.failures.join("; ")) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn empty_run_is_not_success() { assert!(Checks::default().finish().is_err()); }
    #[test] fn later_success_cannot_erase_failure() {
        let mut checks = Checks::default();
        checks.record("network", Err("timeout is not access denial".into()));
        checks.record("tree", Ok(()));
        assert!(checks.finish().unwrap_err().contains("network"));
    }
    #[test] fn all_failures_survive_collection() {
        let mut checks = Checks::default();
        checks.record("first", Err("a".into())); checks.record("second", Err("b".into()));
        assert_eq!(checks.finish(), Err("first: a; second: b".into()));
    }
    #[test] fn nonempty_all_pass_run_succeeds() {
        let mut checks = Checks::default(); checks.record("observed", Ok(()));
        assert_eq!(checks.finish(), Ok(()));
    }
    #[test] fn diagnostics_are_json_escaped_not_rust_debug_escaped() {
        assert_eq!(json_string("\"\\\n\r\t\0\u{1b}è"), "\"\\\"\\\\\\n\\r\\t\\u0000\\u001bè\"");
        for ch in '\u{0000}'..='\u{001f}' { assert!(!json_string(&ch.to_string()).contains(ch)); }
    }
}
