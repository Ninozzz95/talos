import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const analyzer = fileURLToPath(new URL('./voice-analyze-step-trace.mjs', import.meta.url));

test('writes the five named B0 answers from literal trace evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'talos-voice-b0-'));
  const rawPath = join(directory, 'voice-step-trace.raw.json');
  const graphPath = join(directory, 'voice-graph-audit.json');
  const outputPath = join(directory, 'voice-step-trace.json');
  const profiles = writeProfiles(directory);
  writeFileSync(rawPath, JSON.stringify(rawArtifact(profiles)), 'utf8');
  writeFileSync(graphPath, JSON.stringify(graphAudit()), 'utf8');

  execFileSync(
    process.execPath,
    [analyzer, '--raw', rawPath, '--graph-audit', graphPath, '--output', outputPath],
    { encoding: 'utf8' },
  );

  const artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.deepEqual(Object.keys(artifact.answers), [
    'dominantGraphPerFrame',
    'decodeStepCacheSlope',
    'outsideOrtSessionRun',
    'arOnlyLongTextRtf',
    'underrunsByEvent',
  ]);
  assert.equal(artifact.answers.dominantGraphPerFrame.graph, 'local_fixed_sampled_frame');
  assert.equal(artifact.answers.dominantGraphPerFrame.medianMsPerFrame, 28);
  assert.ok(Math.abs(artifact.answers.decodeStepCacheSlope.slopeMsPerCacheToken - 0.2) < 1e-12);
  assert.equal(artifact.answers.decodeStepCacheSlope.growsWithCache, true);
  assert.ok(Math.abs(artifact.answers.decodeStepCacheSlope.rSquared - 1) < 1e-12);
  assert.ok(Math.abs(artifact.answers.outsideOrtSessionRun.medianMsPerFrame - 10.1) < 1e-12);
  assert.ok(Math.abs(artifact.answers.arOnlyLongTextRtf.rtf - 0.75) < 1e-12);
  assert.ok(Math.abs(artifact.answers.arOnlyLongTextRtf.q4MedianRollingRtf16 - 0.75) < 1e-12);
  assert.equal(artifact.answers.underrunsByEvent.total, 1);
  assert.equal(artifact.answers.underrunsByEvent.unknownCount, 1);
  assert.equal(artifact.answers.underrunsByEvent.events[0].runMode, 'T0');
  assert.equal(artifact.answers.underrunsByEvent.events[0].attribution, 'UNKNOWN');
  assert.equal(artifact.orderedBlocks.length, 5);
  assert.equal(artifact.orderedBlocks.at(-1).block, 'B1_LAZY_ROLE_SESSIONS');
  assert.equal(artifact.orderedBlocks.at(-1).closedWithoutOwnership, true);
  const codecBlock = artifact.orderedBlocks.find((block) => block.block === 'B4_CODEC_ACTOR');
  assert.ok(Math.abs(codecBlock.ownedQ4MeanMsPerFrame - 2.5) < 1e-12);
  assert.equal(artifact.phaseBudget.measurementWindow, 'Q4');
  assert.ok(Math.abs(artifact.phaseBudget.totalOwnedQ4MeanMsPerFrame - 66.6) < 1e-12);
  assert.ok(Math.abs(artifact.phaseBudget.additiveResidualMsPerFrame) < 1e-12);
  assert.ok(Math.abs(artifact.orderedBlocks.reduce((sum, block) => sum + block.sharePercent, 0) - 100) < 1e-12);
  assert.ok(Math.abs(artifact.controls.diagnosticsObserverEffect.deltaRtf - 0.171875) < 1e-12);
  assert.equal(artifact.controls.diagnosticsObserverEffect.status, 'SINGLE_ORDERED_PAIR_NON_CAUSAL');
  assert.equal(artifact.b9.appliesRegardlessOfLever, true);
  assert.equal(artifact.installedGraphAudit.modelSha256, 'a'.repeat(64));
  assert.ok(artifact.ortProfileQualification.operatorTimeNs.MatMul > 0);
  const phaseBudgetSvg = readFileSync(join(directory, 'voice-step-phase-budget.svg'), 'utf8');
  assert.match(phaseBudgetSvg, /B0 Q4 additive phase budget/);
  assert.match(phaseBudgetSvg, /26\.000 ms/);
});

test('removes B5 when the installed graph audit finds no cache Concat', () => {
  const directory = mkdtempSync(join(tmpdir(), 'talos-voice-b0-no-cache-concat-'));
  const rawPath = join(directory, 'voice-step-trace.raw.json');
  const graphPath = join(directory, 'voice-graph-audit.json');
  const outputPath = join(directory, 'voice-step-trace.json');
  const profiles = writeProfiles(directory);
  const audit = graphAudit();
  audit.concatNodes = [];
  audit.cacheMappings[0].concatNodeNames = [];
  audit.conclusion = {
    installedDecodeStepConcatenatesPastCache: false,
    mappedCachePairCount: 0,
    totalCachePairCount: 1,
    unmappedCachePairs: [{
      pastInput: audit.cacheMappings[0].pastInput,
      presentOutput: audit.cacheMappings[0].presentOutput,
    }],
  };
  writeFileSync(rawPath, JSON.stringify(rawArtifact(profiles)), 'utf8');
  writeFileSync(graphPath, JSON.stringify(audit), 'utf8');

  execFileSync(
    process.execPath,
    [analyzer, '--raw', rawPath, '--graph-audit', graphPath, '--output', outputPath],
    { encoding: 'utf8' },
  );

  const artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(artifact.orderedBlocks.some((block) => block.block === 'B5_FIXED_CAPACITY_KV'), false);
  const globalBlock = artifact.orderedBlocks.find((block) => block.block === 'B6_GLOBAL_MODEL');
  assert.ok(globalBlock);
  assert.match(globalBlock.selectionEvidence, /B5 closed:.*0\/1.*Concat/i);
});

test('rejects an inconsistent installed graph mapping conclusion', () => {
  const directory = mkdtempSync(join(tmpdir(), 'talos-voice-b0-false-cache-conclusion-'));
  const rawPath = join(directory, 'voice-step-trace.raw.json');
  const graphPath = join(directory, 'voice-graph-audit.json');
  const outputPath = join(directory, 'voice-step-trace.json');
  const profiles = writeProfiles(directory);
  const audit = graphAudit();
  audit.cacheMappings[0].concatNodeNames = [];
  writeFileSync(rawPath, JSON.stringify(rawArtifact(profiles)), 'utf8');
  writeFileSync(graphPath, JSON.stringify(audit), 'utf8');

  const result = spawnSync(
    process.execPath,
    [analyzer, '--raw', rawPath, '--graph-audit', graphPath, '--output', outputPath],
    { encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cache-mapping conclusion is inconsistent/i);
});

test('rejects a cancelled run instead of analyzing a partial campaign', () => {
  const directory = mkdtempSync(join(tmpdir(), 'talos-voice-b0-cancelled-'));
  const rawPath = join(directory, 'voice-step-trace.raw.json');
  const graphPath = join(directory, 'voice-graph-audit.json');
  const outputPath = join(directory, 'voice-step-trace.json');
  const profiles = writeProfiles(directory);
  const raw = rawArtifact(profiles);
  raw.runs.find((run) => run.mode === 'T1').cancelled = true;
  writeFileSync(rawPath, JSON.stringify(raw), 'utf8');
  writeFileSync(graphPath, JSON.stringify(graphAudit()), 'utf8');

  const result = spawnSync(
    process.execPath,
    [analyzer, '--raw', rawPath, '--graph-audit', graphPath, '--output', outputPath],
    { encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cancelled/i);
});

test('rejects runs that did not generate the identical fixed-seed frame sequence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'talos-voice-b0-sequence-'));
  const rawPath = join(directory, 'voice-step-trace.raw.json');
  const graphPath = join(directory, 'voice-graph-audit.json');
  const outputPath = join(directory, 'voice-step-trace.json');
  const profiles = writeProfiles(directory);
  const raw = rawArtifact(profiles);
  raw.runs.find((run) => run.mode === 'T0_DIAGNOSTICS_OFF').frameSha256 = 'e'.repeat(64);
  writeFileSync(rawPath, JSON.stringify(raw), 'utf8');
  writeFileSync(graphPath, JSON.stringify(graphAudit()), 'utf8');

  const result = spawnSync(
    process.execPath,
    [analyzer, '--raw', rawPath, '--graph-audit', graphPath, '--output', outputPath],
    { encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fixed-seed frame sequence/i);
});

test('rejects causal underrun attribution from Android cumulative counters', () => {
  const directory = mkdtempSync(join(tmpdir(), 'talos-voice-b0-underrun-'));
  const rawPath = join(directory, 'voice-step-trace.raw.json');
  const graphPath = join(directory, 'voice-graph-audit.json');
  const outputPath = join(directory, 'voice-step-trace.json');
  const profiles = writeProfiles(directory);
  const raw = rawArtifact(profiles);
  raw.runs.find((run) => run.mode === 'T0').underruns[0].attribution = 'OBSERVED_DURING_PHASE';
  writeFileSync(rawPath, JSON.stringify(raw), 'utf8');
  writeFileSync(graphPath, JSON.stringify(graphAudit()), 'utf8');

  const result = spawnSync(
    process.execPath,
    [analyzer, '--raw', rawPath, '--graph-audit', graphPath, '--output', outputPath],
    { encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cumulative.*UNKNOWN/i);
});

test('rejects a trace whose named phases do not reconcile with totalStepNs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'talos-voice-b0-invalid-'));
  const rawPath = join(directory, 'voice-step-trace.raw.json');
  const graphPath = join(directory, 'voice-graph-audit.json');
  const outputPath = join(directory, 'voice-step-trace.json');
  const profiles = writeProfiles(directory);
  const raw = rawArtifact(profiles);
  raw.runs.find((run) => run.mode === 'T1').steps[0].totalStepNs += 2_000_001;
  writeFileSync(rawPath, JSON.stringify(raw), 'utf8');
  writeFileSync(graphPath, JSON.stringify(graphAudit()), 'utf8');

  const result = spawnSync(
    process.execPath,
    [analyzer, '--raw', rawPath, '--graph-audit', graphPath, '--output', outputPath],
    { encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /phase accounting/i);
});

function rawArtifact(profiles) {
  const t1Steps = [
    step(0, 100, 20),
    step(1, 110, 22),
    step(2, 120, 24),
    step(3, 130, 26),
  ];
  return {
    schemaVersion: 1,
    generatedAtUtc: '2026-08-22T12:00:00Z',
    phaseAccountingToleranceNs: 1_000_000,
    provenance: {
      runId: 'fixture-run',
      appCommit: '1'.repeat(40),
      sourcePatchSha256: '2'.repeat(64),
      apkSha256: '3'.repeat(64),
      modelDecodeStepSha256: 'a'.repeat(64),
      ortVersion: '1.29.0',
      deviceFingerprint: 'fixture/device',
      textSha256: '4'.repeat(64),
      textWordCount: 200,
      voice: 'Junhao',
      seed: 777,
      requestedMaxFrames: 375,
    },
    runs: [
      run('T0', t1Steps.map((value) => ({ ...value, callbackNs: 10_000_000, totalStepNs: value.totalStepNs + 9_900_000 })), {
        wallNs: 300_000_000,
        audioDurationNs: 320_000_000,
        codecBatches: [codecBatch()],
        underruns: [underrun()],
      }),
      run('T0_DIAGNOSTICS_OFF', t1Steps, {
        wallNs: 245_000_000,
        audioDurationNs: 320_000_000,
        codecBatches: [codecBatch()],
      }),
      run('T1', t1Steps, { wallNs: 240_000_000, audioDurationNs: 320_000_000 }),
      run('T2', [], {
        wallNs: 330_000_000,
        audioDurationNs: 320_000_000,
        codecBatches: [codecBatch()],
      }),
      run('T3', t1Steps, {
        wallNs: 400_000_000,
        audioDurationNs: 320_000_000,
        qualificationOnly: true,
        ortProfiles: profiles,
      }),
    ],
    orderedBlocks: [],
    b9: {
      statement: 'B9 remains outside the ordering.',
      appliesRegardlessOfLever: true,
    },
    answers: null,
  };
}

function step(frameIndex, pastValidLength, decodeMs) {
  const localSampleNs = 30_000_000;
  const callbackNs = 100_000;
  const globalInputPrepNs = 4_000_000;
  const globalDecodeNs = decodeMs * 1_000_000;
  const kvTransitionNs = 3_000_000;
  const residualNs = 1_000_000;
  return {
    utteranceId: 3,
    frameIndex,
    pastValidLength,
    localSampleNs,
    localOrtRunNs: 28_000_000,
    callbackNs,
    globalInputPrepNs,
    globalDecodeNs,
    kvTransitionNs,
    totalStepNs: localSampleNs + callbackNs + globalInputPrepNs + globalDecodeNs + kvTransitionNs + residualNs,
    residualNs,
    rollingRtf16: 0.75,
    javaHeapBytes: 100_000_000,
    nativeHeapBytes: 200_000_000,
    gcCount: 2,
  };
}

function run(mode, steps, overrides = {}) {
  return {
    utteranceId: mode === 'T1' ? 3 : 4,
    mode,
    startedAtElapsedRealtimeNs: 1_000_000,
    finishedAtElapsedRealtimeNs: 301_000_000,
    wallNs: overrides.wallNs ?? 300_000_000,
    audioDurationNs: overrides.audioDurationNs ?? 320_000_000,
    generatedFrameCount: 4,
    frameSha256: 'f'.repeat(64),
    cancelled: false,
    diagnosticsEnabled: mode === 'T0',
    qualificationOnly: overrides.qualificationOnly ?? false,
    steps,
    codecBatches: overrides.codecBatches ?? [],
    underruns: overrides.underruns ?? [],
    ortProfiles: overrides.ortProfiles ?? null,
  };
}

function codecBatch() {
  return {
    utteranceId: 1,
    batchIndex: 0,
    firstFrameIndex: 0,
    frameCount: 4,
    codecDecodeNs: 8_000_000,
    audioWriteNs: 2_000_000,
    bufferLeadFramesBefore: 0,
    bufferLeadFramesAfter: 3840,
    underrunCountBefore: 0,
    underrunCountAfter: 1,
  };
}

function underrun() {
  return {
    ordinal: 1,
    observedAtNs: 99_000_000,
    observedDuringPhase: 'UNKNOWN',
    frameIndex: 2,
    batchIndex: 0,
    counterBefore: 0,
    counterAfter: 1,
    bufferLeadFramesBefore: 0,
    bufferLeadFramesAfter: 0,
    attribution: 'UNKNOWN',
  };
}

function writeProfiles(directory) {
  const events = [
    { cat: 'Node', name: 'MatMul_0_kernel_time', dur: 1_000, args: { op_name: 'MatMul', provider: 'CPUExecutionProvider' } },
    { cat: 'Node', name: 'Concat_0_kernel_time', dur: 500, args: { op_name: 'Concat', provider: 'CPUExecutionProvider' } },
  ];
  const profiles = {
    prefill: join(directory, 'voice-ort-prefill.json'),
    decodeStep: join(directory, 'voice-ort-decode-step.json'),
    localFixedSampledFrame: join(directory, 'voice-ort-local.json'),
  };
  Object.values(profiles).forEach((path) => writeFileSync(path, JSON.stringify(events), 'utf8'));
  return profiles;
}

function graphAudit() {
  return {
    schemaVersion: 1,
    onnxVersion: '1.22.0',
    modelSha256: 'a'.repeat(64),
    modelPath: 'decode_step.onnx',
    cacheMappings: [{
      pastInput: 'past_key_values.0.key',
      presentOutput: 'present.0.key',
      concatNodeNames: ['/layers.0/Concat'],
    }],
    concatNodes: [{ name: '/layers.0/Concat', axis: 2, inputs: ['past_key_values.0.key', 'new_key'], outputs: ['present.0.key'] }],
    conclusion: {
      installedDecodeStepConcatenatesPastCache: true,
      mappedCachePairCount: 1,
      totalCachePairCount: 1,
      unmappedCachePairs: [],
    },
  };
}
