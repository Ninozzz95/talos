#![forbid(unsafe_code)]

//! Native-side constants for the TALOS Evolution Protocol.
//!
//! E0-3 deliberately contains no Protobuf implementation. The schema remains
//! authoritative in `harness-ui/evolution-protocol/proto/evolution.proto`.
//! A later researched slice will choose the concrete codec when the first
//! process actually needs to parse the wire.

/// Evolution Protocol major version supported by this scaffold.
pub const PROTOCOL_MAJOR: u32 = 1;

/// Initial additive minor version.
pub const PROTOCOL_MINOR: u32 = 0;

/// Maximum size of one control payload, excluding the 4-byte frame prefix.
pub const MAX_CONTROL_FRAME_BYTES: usize = 1024 * 1024;

/// Fixed size of the little-endian control-frame length prefix.
pub const FRAME_LENGTH_PREFIX_BYTES: usize = 4;

#[must_use]
pub const fn protocol_version_string() -> &'static str {
    "1.0"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v1_constants_match_frozen_contract() {
        assert_eq!(PROTOCOL_MAJOR, 1);
        assert_eq!(PROTOCOL_MINOR, 0);
        assert_eq!(MAX_CONTROL_FRAME_BYTES, 1_048_576);
        assert_eq!(FRAME_LENGTH_PREFIX_BYTES, 4);
        assert_eq!(protocol_version_string(), "1.0");
    }
}
