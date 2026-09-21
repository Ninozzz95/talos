// Real native-binary load failure for the V8 CLI matrix: process.dlopen on a
// nonexistent .node file raises a genuine ERR_DLOPEN_FAILED at require time.
process.dlopen(module, require('path').join(__dirname, 'no-such-binary.node'))
