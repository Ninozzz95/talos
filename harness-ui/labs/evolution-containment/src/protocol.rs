//! Bounded experiment frame, NOT the future Protobuf Evolution ABI.
//! No field in this frame authenticates its sender or grants any authority.
#![cfg_attr(not(windows), allow(dead_code))]
pub const FRAME_BYTES: usize = 32;
pub const MAGIC: [u8; 4] = *b"TSP1";
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub struct Report {
    pub read_error: u32,
    pub write_error: u32,
    pub immutable_error: u32,
    pub network_error: u32,
    pub env_absent: u32,
    pub descendant: u32,
    pub scratch_written: u32,
}
impl Report {
    pub fn encode(self) -> [u8; FRAME_BYTES] {
        let mut bytes = [0; FRAME_BYTES];
        bytes[..4].copy_from_slice(&MAGIC);
        for (chunk, value) in bytes[4..].chunks_exact_mut(4).zip([
            self.read_error, self.write_error, self.immutable_error,
            self.network_error, self.env_absent, self.descendant, self.scratch_written,
        ]) {
            chunk.copy_from_slice(&value.to_le_bytes());
        }
        bytes
    }
    pub fn decode(bytes: &[u8]) -> Result<Self, &'static str> {
        if bytes.len() != FRAME_BYTES || bytes[..4] != MAGIC {
            return Err("FRAME_INVALID");
        }
        let value = |offset| u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
        let report = Self {
            read_error: value(4), write_error: value(8), immutable_error: value(12),
            network_error: value(16), env_absent: value(20), descendant: value(24),
            scratch_written: value(28),
        };
        if report.env_absent > 1 || report.scratch_written > 1 {
            return Err("FRAME_BOOLEAN_INVALID");
        }
        Ok(report)
    }
}
/// Evidence comes from OS handles, NEVER from Report fields.
pub fn peer_matches(expected_pid: u32, actual_pid: u32, in_job: bool, container: bool, same_sid: bool) -> bool {
    expected_pid != 0 && expected_pid == actual_pid && in_job && container && same_sid
}

#[cfg(test)]
mod tests {
    use super::*;
    fn report() -> Report { Report { read_error: 5, write_error: 5, immutable_error: 5,
        network_error: 10013, env_absent: 1, descendant: 42, scratch_written: 1 } }
    #[test] fn round_trip() { assert_eq!(Report::decode(&report().encode()), Ok(report())); }
    #[test] fn sizes_are_exact() {
        for size in 0..=256 {
            if size != FRAME_BYTES { assert!(Report::decode(&vec![0; size]).is_err()); }
        }
    }
    #[test] fn wrong_version_rejected() {
        let mut bytes = report().encode(); bytes[3] = b'2'; assert!(Report::decode(&bytes).is_err());
    }
    #[test] fn invalid_booleans_rejected() {
        for offset in [20, 28] {
            let mut bytes = report().encode(); bytes[offset..offset + 4].copy_from_slice(&2u32.to_le_bytes());
            assert!(Report::decode(&bytes).is_err());
        }
    }
    #[test] fn arbitrary_fixed_frames_never_panic() {
        let mut seed = 42u32;
        for _ in 0..4096 {
            let mut bytes = [0; FRAME_BYTES];
            for byte in &mut bytes { seed = seed.wrapping_mul(1664525).wrapping_add(1013904223); *byte = (seed >> 24) as u8; }
            let _ = Report::decode(&bytes);
        }
    }
    #[test] fn all_identity_factors_required() {
        for mask in 0..16 {
            assert_eq!(peer_matches(42, if mask & 1 != 0 { 42 } else { 43 }, mask & 2 != 0, mask & 4 != 0, mask & 8 != 0), mask == 15);
        }
        assert!(!peer_matches(0, 0, true, true, true));
    }
}
