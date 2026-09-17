//! Protobuf generated from the checked-in schema, in capped length-prefixed frames.
use anyhow::{ensure, Result};
use prost::Message;
pub mod pb { include!(concat!(env!("OUT_DIR"), "/talos.prototype.v1.rs")); }
pub const MAX_FRAME: usize = 128 * 1024;
pub const MAX_COMPONENT: usize = 64 * 1024;
pub fn envelope(body: pb::envelope::Body) -> pb::Envelope { pb::Envelope {version:1,body:Some(body)} }
pub fn encode(message: &pb::Envelope) -> Result<Vec<u8>> {
    ensure!(message.version==1 && message.body.is_some(), "protocol version/body rejected");
    let bytes=message.encode_to_vec(); ensure!(bytes.len()<=MAX_FRAME,"oversized frame"); Ok(bytes)
}
pub fn decode(bytes: &[u8]) -> Result<pb::Envelope> {
    ensure!(!bytes.is_empty() && bytes.len()<=MAX_FRAME,"invalid frame size");
    let message=pb::Envelope::decode(bytes)?;
    // v1 intentionally rejects unknown/duplicate/noncanonical fields rather
    // than allowing alternate encodings to smuggle a second operation.
    let canonical=encode(&message)?;
    ensure!(canonical==bytes,"noncanonical or unknown fields"); Ok(message)
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn roundtrip() { let m=envelope(pb::envelope::Body::Data(pb::Data{contents:b"abc".to_vec(),denied:0}));
        assert_eq!(decode(&encode(&m).unwrap()).unwrap(),m); }
    #[test] fn unknown_and_duplicate_fields_rejected() { let m=envelope(pb::envelope::Body::Data(pb::Data{contents:vec![],denied:1}));
        let mut b=encode(&m).unwrap();b.extend([8,1]);assert!(decode(&b).is_err());
        let mut b=encode(&m).unwrap();b.extend([16,1]);assert!(decode(&b).is_err()); }
    #[test] fn sizes_and_versions() { assert!(decode(&[]).is_err());assert!(decode(&vec![0;MAX_FRAME+1]).is_err());
        assert!(decode(&[8,2]).is_err());assert!(decode(&[8,1]).is_err()); }
    #[test] fn bounded_arbitrary_input_does_not_panic() { let mut seed=42u32;
        for n in 0..2048 { let mut b=vec![0;n%257];for v in &mut b {seed=seed.wrapping_mul(1664525).wrapping_add(1013904223);*v=(seed>>24)as u8;}
            let _=decode(&b); } }
}
