#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

try {
  const options = parseArguments(process.argv.slice(2));
  const raw = readJson(options.raw);
  const graphAudit = readJson(options.graphAudit);
  validateRawArtifact(raw);
  validateGraphAudit(raw, graphAudit);

  const t0 = requiredRun(raw, 'T0');
  const t0DiagnosticsOff = requiredRun(raw, 'T0_DIAGNOSTICS_OFF');
  const t1 = requiredRun(raw, 'T1');
  const t2 = requiredRun(raw, 'T2');
  const t3 = requiredRun(raw, 'T3');
  const answers = buildAnswers(raw, t0, t1);
  const phaseBudget = buildPhaseBudget(t1, t2);
  const orderedBlocks = buildOrderedBlocks(phaseBudget, answers.decodeStepCacheSlope, graphAudit);
  const controls = buildControls(t0, t0DiagnosticsOff);
  const ortProfileQualification = analyzeOrtProfiles(t3, dirname(options.raw));
  const finalArtifact = {
    ...raw,
    analysisGeneratedAtUtc: new Date().toISOString(),
    installedGraphAudit: graphAudit,
    ortProfileQualification,
    controls,
    phaseBudget: phaseBudget.summary,
    orderedBlocks,
    answers,
  };

  const outputDirectory = dirname(options.output);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(finalArtifact, null, 2)}\n`, 'utf8');
  writeFileSync(join(outputDirectory, 'voice-step-phase-budget.svg'), phaseBudgetSvg(orderedBlocks), 'utf8');
  writeFileSync(join(outputDirectory, 'voice-step-decode-slope.svg'), decodeSlopeSvg(t1.steps), 'utf8');
  writeFileSync(join(outputDirectory, 'voice-step-underruns.csv'), underrunCsv(answers.underrunsByEvent.events), 'utf8');
  process.stdout.write(`${options.output}\n`);
} catch (error) {
  process.stderr.write(`voice-analyze-step-trace: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function parseArguments(argumentsList) {
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const name = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!name?.startsWith('--') || !value) throw new Error('usage: --raw FILE --graph-audit FILE --output FILE');
    values.set(name.slice(2), resolve(value));
  }
  for (const required of ['raw', 'graph-audit', 'output']) {
    if (!values.has(required)) throw new Error(`missing required argument --${required}`);
  }
  return {
    raw: values.get('raw'),
    graphAudit: values.get('graph-audit'),
    output: values.get('output'),
  };
}

function readJson(path) {
  if (!existsSync(path)) throw new Error(`input does not exist: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateRawArtifact(raw) {
  if (raw.schemaVersion !== 1) throw new Error(`unsupported raw schemaVersion: ${raw.schemaVersion}`);
  if (!Number.isFinite(raw.phaseAccountingToleranceNs) || raw.phaseAccountingToleranceNs < 0) {
    throw new Error('phaseAccountingToleranceNs must be a non-negative number');
  }
  if (!Array.isArray(raw.runs)) throw new Error('raw runs must be an array');
  const requiredModes = ['T0', 'T0_DIAGNOSTICS_OFF', 'T1', 'T2', 'T3'];
  const runs = requiredModes.map((mode) => requiredRun(raw, mode));

  for (const run of runs) {
    if (run.cancelled) throw new Error(`${run.mode} was cancelled; partial campaigns are not evidence`);
    if (!Number.isInteger(run.generatedFrameCount) || run.generatedFrameCount <= 0) {
      throw new Error(`${run.mode}.generatedFrameCount must be a positive integer`);
    }
    if (!/^[0-9a-f]{64}$/.test(run.frameSha256)) throw new Error(`${run.mode}.frameSha256 is invalid`);
    if (!Array.isArray(run.steps)) throw new Error(`${run.mode}.steps must be an array`);
    if (!Array.isArray(run.codecBatches)) throw new Error(`${run.mode}.codecBatches must be an array`);
    if (!Array.isArray(run.underruns)) throw new Error(`${run.mode}.underruns must be an array`);
    for (const event of run.underruns) {
      if (event.attribution !== 'UNKNOWN') {
        throw new Error(
          `${run.mode} uses a cumulative Android underrun counter, so causal attribution must remain UNKNOWN`,
        );
      }
    }
    for (const step of run.steps) {
      const namedSum = step.localSampleNs + step.callbackNs + step.globalInputPrepNs +
        step.globalDecodeNs + step.kvTransitionNs;
      const measuredResidual = step.totalStepNs - namedSum;
      if (measuredResidual !== step.residualNs) {
        throw new Error(
          `phase accounting mismatch in ${run.mode} frame ${step.frameIndex}: ` +
          `stored residual ${step.residualNs}, measured ${measuredResidual}`,
        );
      }
      if (Math.abs(step.residualNs) > raw.phaseAccountingToleranceNs) {
        throw new Error(
          `phase accounting residual exceeds tolerance in ${run.mode} frame ${step.frameIndex}: ` +
          `${step.residualNs}ns > ${raw.phaseAccountingToleranceNs}ns`,
        );
      }
    }
  }

  const t1 = requiredRun(raw, 'T1');
  const t2 = requiredRun(raw, 'T2');
  for (const run of runs) {
    if (run.generatedFrameCount !== t1.generatedFrameCount || run.frameSha256 !== t1.frameSha256) {
      throw new Error(`${run.mode} did not produce the identical fixed-seed frame sequence`);
    }
  }
  for (const mode of ['T0', 'T0_DIAGNOSTICS_OFF', 'T1', 'T3']) {
    const run = requiredRun(raw, mode);
    if (run.steps.length !== run.generatedFrameCount) {
      throw new Error(`${mode} step count does not match generatedFrameCount`);
    }
  }
  if (t1.codecBatches.length !== 0) throw new Error('T1 contains codec batches');
  if (t2.steps.length !== 0) throw new Error('T2 contains TTS steps');
  validateCodecCoverage(requiredRun(raw, 'T0'));
  validateCodecCoverage(requiredRun(raw, 'T0_DIAGNOSTICS_OFF'));
  validateCodecCoverage(t2);
  if (!requiredRun(raw, 'T3').qualificationOnly) throw new Error('T3 must be qualificationOnly');
  if (requiredRun(raw, 'T0').diagnosticsEnabled !== true) throw new Error('T0 diagnostics must be enabled');
  if (requiredRun(raw, 'T0_DIAGNOSTICS_OFF').diagnosticsEnabled !== false) {
    throw new Error('T0_DIAGNOSTICS_OFF diagnostics must be disabled');
  }
  if (raw.b9?.appliesRegardlessOfLever !== true) throw new Error('B9 must remain outside the ordering');
}

function validateCodecCoverage(run) {
  const covered = new Array(run.generatedFrameCount).fill(false);
  for (const batch of run.codecBatches) {
    if (!Number.isInteger(batch.firstFrameIndex) || !Number.isInteger(batch.frameCount) || batch.frameCount <= 0) {
      throw new Error(`${run.mode} contains an invalid codec batch range`);
    }
    for (let index = batch.firstFrameIndex; index < batch.firstFrameIndex + batch.frameCount; index += 1) {
      if (index < 0 || index >= covered.length || covered[index]) {
        throw new Error(`${run.mode} codec batches overlap or fall outside the generated frames`);
      }
      covered[index] = true;
    }
  }
  if (covered.some((value) => !value)) throw new Error(`${run.mode} codec batches do not cover every generated frame`);
}

function validateGraphAudit(raw, audit) {
  if (audit.schemaVersion !== 1) throw new Error(`unsupported graph audit schemaVersion: ${audit.schemaVersion}`);
  if (audit.onnxVersion !== '1.22.0') throw new Error(`graph audit used unpinned ONNX ${audit.onnxVersion}`);
  if (audit.modelSha256 !== raw.provenance.modelDecodeStepSha256) {
    throw new Error('graph audit SHA-256 does not match the installed decode-step graph recorded on device');
  }
  if (!Array.isArray(audit.concatNodes) || !Array.isArray(audit.cacheMappings)) {
    throw new Error('graph audit must contain concatNodes and cacheMappings arrays');
  }
  if (!audit.conclusion || typeof audit.conclusion !== 'object') {
    throw new Error('graph audit must contain a conclusion');
  }
  let mappedCachePairCount = 0;
  for (const mapping of audit.cacheMappings) {
    if (!Array.isArray(mapping.concatNodeNames)) {
      throw new Error('every graph audit cache mapping must contain concatNodeNames');
    }
    if (mapping.concatNodeNames.length > 0) mappedCachePairCount += 1;
  }
  const { conclusion } = audit;
  if (!Number.isInteger(conclusion.mappedCachePairCount) ||
      !Number.isInteger(conclusion.totalCachePairCount) ||
      conclusion.mappedCachePairCount < 0 ||
      conclusion.mappedCachePairCount > conclusion.totalCachePairCount ||
      conclusion.mappedCachePairCount !== mappedCachePairCount ||
      conclusion.totalCachePairCount !== audit.cacheMappings.length ||
      !Array.isArray(conclusion.unmappedCachePairs) ||
      conclusion.unmappedCachePairs.length !== conclusion.totalCachePairCount - conclusion.mappedCachePairCount ||
      conclusion.installedDecodeStepConcatenatesPastCache !== (conclusion.mappedCachePairCount > 0)) {
    throw new Error('graph audit cache-mapping conclusion is inconsistent');
  }
}

function requiredRun(raw, mode) {
  const matches = raw.runs.filter((run) => run.mode === mode);
  if (matches.length !== 1) throw new Error(`expected exactly one ${mode} run, found ${matches.length}`);
  return matches[0];
}

function buildAnswers(raw, t0, t1) {
  if (t1.steps.length < 2) throw new Error('T1 needs at least two steps for the cache slope');
  const q4Steps = lastQuartile(t1.steps);
  const localOrtMs = q4Steps.map((step) => nsToMs(step.localOrtRunNs));
  const globalDecodeMs = q4Steps.map((step) => nsToMs(step.globalDecodeNs));
  const allGlobalDecodeMs = t1.steps.map((step) => nsToMs(step.globalDecodeNs));
  const localMedian = median(localOrtMs);
  const globalMedian = median(globalDecodeMs);
  const dominantIsLocal = localMedian >= globalMedian;
  const slope = linearRegression(
    t1.steps.map((step) => step.pastValidLength),
    allGlobalDecodeMs,
  );
  const quartileSize = Math.max(1, Math.ceil(allGlobalDecodeMs.length / 4));
  const firstQuartileMedianMs = median(allGlobalDecodeMs.slice(0, quartileSize));
  const lastQuartileMedianMs = median(allGlobalDecodeMs.slice(-quartileSize));
  const outsideOrtMs = q4Steps.map((step) => nsToMs(step.totalStepNs - step.localOrtRunNs - step.globalDecodeNs));
  const totalStepMs = q4Steps.map((step) => nsToMs(step.totalStepNs));
  const underrunEvents = raw.runs.flatMap((run) =>
    run.underruns.map((event) => ({ runMode: run.mode, ...event })),
  );

  return {
    dominantGraphPerFrame: {
      graph: dominantIsLocal ? 'local_fixed_sampled_frame' : 'decode_step',
      medianMsPerFrame: dominantIsLocal ? localMedian : globalMedian,
      runnerUpMsPerFrame: dominantIsLocal ? globalMedian : localMedian,
      measurementWindow: 'Q4',
      evidence: 'T1 Q4 unprofiled per-frame OrtSession.run clocks; T3 is qualification-only.',
      status: 'MEASURED',
    },
    decodeStepCacheSlope: {
      growsWithCache: slope.slope > 0 && lastQuartileMedianMs > firstQuartileMedianMs,
      slopeMsPerCacheToken: slope.slope,
      rSquared: slope.rSquared,
      firstQuartileMedianMs,
      lastQuartileMedianMs,
      status: 'MEASURED',
    },
    outsideOrtSessionRun: {
      medianMsPerFrame: median(outsideOrtMs),
      p95MsPerFrame: percentile(outsideOrtMs, 0.95),
      sharePercent: median(outsideOrtMs) / median(totalStepMs) * 100,
      componentMedianMs: {
        localOutsideOrt: median(q4Steps.map((step) => nsToMs(step.localSampleNs - step.localOrtRunNs))),
        callback: median(q4Steps.map((step) => nsToMs(step.callbackNs))),
        globalInputPrep: median(q4Steps.map((step) => nsToMs(step.globalInputPrepNs))),
        kvTransition: median(q4Steps.map((step) => nsToMs(step.kvTransitionNs))),
        residual: median(q4Steps.map((step) => nsToMs(step.residualNs))),
      },
      measurementWindow: 'Q4',
      status: 'MEASURED',
    },
    arOnlyLongTextRtf: {
      rtf: t1.audioDurationNs === 0 ? null : t1.wallNs / t1.audioDurationNs,
      wallMs: nsToMs(t1.wallNs),
      audioMs: nsToMs(t1.audioDurationNs),
      generatedFrames: t1.generatedFrameCount,
      q4MedianRollingRtf16: median(q4Steps.map((step) => step.rollingRtf16)),
      status: t1.audioDurationNs === 0 ? 'UNKNOWN' : 'MEASURED',
    },
    underrunsByEvent: {
      total: underrunEvents.length,
      unknownCount: underrunEvents.filter((event) => event.attribution === 'UNKNOWN').length,
      events: underrunEvents,
      status: underrunEvents.length === 0 ? 'NO_UNDERRUNS' : 'MEASURED_WITH_CUMULATIVE_COUNTER_LIMIT',
    },
  };
}

function buildPhaseBudget(t1, t2) {
  const codecPerFrameMs = codecPerFrame(t2);
  const samples = {
    local: t1.steps.map((step) => nsToMs(step.localOrtRunNs)),
    global: t1.steps.map((step) => nsToMs(step.globalDecodeNs)),
    orchestration: t1.steps.map((step) => nsToMs(step.totalStepNs - step.localOrtRunNs - step.globalDecodeNs)),
    codec: codecPerFrameMs,
  };
  const q4 = Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, lastQuartile(values)]));
  const q4Means = Object.fromEntries(Object.entries(q4).map(([name, values]) => [name, mean(values)]));
  const measuredCoreQ4 = mean(lastQuartile(t1.steps).map((step) => nsToMs(step.totalStepNs)));
  const componentCoreQ4 = q4Means.local + q4Means.global + q4Means.orchestration;
  const totalOwnedQ4 = componentCoreQ4 + q4Means.codec;
  return {
    samples,
    q4,
    q4Means,
    summary: {
      measurementWindow: 'Q4',
      basis: 'T1 exact per-step clocks plus T2 exact codec-decode and AudioTrack.write clocks, all on the identical fixed-seed frames.',
      q4FrameCount: q4.local.length,
      q4FirstFrameIndex: t1.generatedFrameCount - q4.local.length,
      arOnlyMeasuredQ4MeanMsPerFrame: measuredCoreQ4,
      codecOwnedQ4MeanMsPerFrame: q4Means.codec,
      totalOwnedQ4MeanMsPerFrame: totalOwnedQ4,
      additiveResidualMsPerFrame: totalOwnedQ4 - (measuredCoreQ4 + q4Means.codec),
    },
  };
}

function codecPerFrame(run) {
  const values = new Array(run.generatedFrameCount).fill(0);
  for (const batch of run.codecBatches) {
    const perFrameMs = nsToMs(batch.codecDecodeNs + batch.audioWriteNs) / batch.frameCount;
    for (let index = batch.firstFrameIndex; index < batch.firstFrameIndex + batch.frameCount; index += 1) {
      values[index] += perFrameMs;
    }
  }
  return values;
}

function buildOrderedBlocks(phaseBudget, decodeSlope, graphAudit) {
  const cacheMapping = graphAudit.conclusion;
  const fixedCapacityKvEligible = decodeSlope.growsWithCache &&
    cacheMapping.installedDecodeStepConcatenatesPastCache;
  const candidates = [
    {
      block: 'B3_B6_LOCAL_GRAPH',
      samples: phaseBudget.samples.local,
      q4Samples: phaseBudget.q4.local,
      falsifier: 'Close first position if local sampler stays below 40ms/frame or an accelerator worsens p95/RTF.',
    },
    {
      block: fixedCapacityKvEligible ? 'B5_FIXED_CAPACITY_KV' : 'B6_GLOBAL_MODEL',
      samples: phaseBudget.samples.global,
      q4Samples: phaseBudget.q4.global,
      falsifier: fixedCapacityKvEligible
        ? 'Close B5 if decode_step does not grow with cache length or fixed-cache tokens diverge at seed 777.'
        : 'Close B6 if qualified model optimization does not improve AR-only RTF without losing voice quality.',
      selectionEvidence: fixedCapacityKvEligible
        ? `decode_step grows with cache and the installed graph maps ${cacheMapping.mappedCachePairCount}/${cacheMapping.totalCachePairCount} cache pairs through Concat.`
        : decodeSlope.growsWithCache
          ? `B5 closed: the installed graph maps ${cacheMapping.mappedCachePairCount}/${cacheMapping.totalCachePairCount} cache pairs through Concat.`
          : 'B5 closed: decode_step does not measurably grow with cache length.',
    },
    {
      block: 'B2_B7_ORCHESTRATION',
      samples: phaseBudget.samples.orchestration,
      q4Samples: phaseBudget.q4.orchestration,
      falsifier: 'Close as primary cure if prep + KV + GC + residual stays below 10% of the frame.',
    },
    {
      block: 'B4_CODEC_ACTOR',
      samples: phaseBudget.samples.codec,
      q4Samples: phaseBudget.q4.codec,
      falsifier: 'Close as sufficient cure if AR-only RTF is already at or above 1.0.',
    },
    {
      block: 'B1_LAZY_ROLE_SESSIONS',
      samples: [0],
      q4Samples: [0],
      falsifier: 'Closed for steady-state stutter when B0 assigns zero per-frame milliseconds; retain only as cold-start/memory work.',
    },
  ];
  return candidates
    .map((candidate) => ({
      ...candidate,
      ownedMedianMs: median(candidate.samples),
      ownedP95Ms: percentile(candidate.samples, 0.95),
      ownedQ4MeanMsPerFrame: mean(candidate.q4Samples),
    }))
    .sort((left, right) => right.ownedQ4MeanMsPerFrame - left.ownedQ4MeanMsPerFrame)
    .map((candidate, index) => ({
      rank: index + 1,
      block: candidate.block,
      ownedMedianMs: candidate.ownedMedianMs,
      ownedP95Ms: candidate.ownedP95Ms,
      ownedQ4MeanMsPerFrame: candidate.ownedQ4MeanMsPerFrame,
      sharePercent: phaseBudget.summary.totalOwnedQ4MeanMsPerFrame === 0
        ? 0
        : candidate.ownedQ4MeanMsPerFrame / phaseBudget.summary.totalOwnedQ4MeanMsPerFrame * 100,
      measurementWindow: 'Q4',
      falsifier: candidate.falsifier,
      ...(candidate.selectionEvidence ? { selectionEvidence: candidate.selectionEvidence } : {}),
      closedWithoutOwnership: candidate.ownedQ4MeanMsPerFrame === 0 && candidate.ownedP95Ms === 0,
    }));
}

function buildControls(t0, t0DiagnosticsOff) {
  const t0Q4 = lastQuartile(t0.steps);
  const offQ4 = lastQuartile(t0DiagnosticsOff.steps);
  const t0Rtf = t0.wallNs / t0.audioDurationNs;
  const offRtf = t0DiagnosticsOff.wallNs / t0DiagnosticsOff.audioDurationNs;
  return {
    diagnosticsObserverEffect: {
      t0Rtf,
      t0DiagnosticsOffRtf: offRtf,
      deltaRtf: t0Rtf - offRtf,
      q4CallbackMedianDeltaMs: median(t0Q4.map((step) => nsToMs(step.callbackNs))) -
        median(offQ4.map((step) => nsToMs(step.callbackNs))),
      q4CallbackP95DeltaMs: percentile(t0Q4.map((step) => nsToMs(step.callbackNs)), 0.95) -
        percentile(offQ4.map((step) => nsToMs(step.callbackNs)), 0.95),
      status: 'SINGLE_ORDERED_PAIR_NON_CAUSAL',
      limitation: 'The magnitude is measured, but one fixed-order pair cannot separate diagnostics from thermal/order effects.',
    },
  };
}

function analyzeOrtProfiles(t3, rawDirectory) {
  if (!t3.ortProfiles) throw new Error('T3 has no ORT profile files');
  const operatorTimeNs = {};
  const providerTimeNs = {};
  let nodeEventCount = 0;
  for (const [graph, recordedPath] of Object.entries(t3.ortProfiles)) {
    const path = resolvePulledPath(recordedPath, rawDirectory);
    const payload = readJson(path);
    const events = Array.isArray(payload) ? payload : payload.traceEvents;
    if (!Array.isArray(events)) throw new Error(`ORT profile is not a trace array: ${path}`);
    for (const event of events) {
      if (event.cat !== 'Node' || !Number.isFinite(event.dur)) continue;
      nodeEventCount += 1;
      const durationNs = event.dur * 1_000;
      const operator = event.args?.op_name ?? event.args?.opName ?? event.name ?? 'UNKNOWN';
      const provider = event.args?.provider ?? 'UNKNOWN';
      operatorTimeNs[operator] = (operatorTimeNs[operator] ?? 0) + durationNs;
      providerTimeNs[provider] = (providerTimeNs[provider] ?? 0) + durationNs;
      providerTimeNs[`${graph}:${provider}`] = (providerTimeNs[`${graph}:${provider}`] ?? 0) + durationNs;
    }
  }
  return {
    qualificationOnly: true,
    absoluteTimingComparableToT0T2: false,
    nodeEventCount,
    operatorTimeNs,
    providerTimeNs,
  };
}

function resolvePulledPath(recordedPath, rawDirectory) {
  if (existsSync(recordedPath)) return recordedPath;
  const pulled = join(rawDirectory, basename(recordedPath));
  if (existsSync(pulled)) return pulled;
  throw new Error(`pulled ORT profile not found for ${recordedPath}`);
}

function linearRegression(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) throw new Error('linear regression needs paired samples');
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let covariance = 0;
  let varianceX = 0;
  let totalY = 0;
  for (let index = 0; index < xs.length; index += 1) {
    covariance += (xs[index] - meanX) * (ys[index] - meanY);
    varianceX += (xs[index] - meanX) ** 2;
    totalY += (ys[index] - meanY) ** 2;
  }
  if (varianceX === 0) return { slope: 0, intercept: meanY, rSquared: 0 };
  const slope = covariance / varianceX;
  const intercept = meanY - slope * meanX;
  const residual = ys.reduce((sum, value, index) => sum + (value - (intercept + slope * xs[index])) ** 2, 0);
  return { slope, intercept, rSquared: totalY === 0 ? 1 : 1 - residual / totalY };
}

function median(values) {
  if (values.length === 0) throw new Error('median needs at least one value');
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function mean(values) {
  if (values.length === 0) throw new Error('mean needs at least one value');
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function lastQuartile(values) {
  if (values.length === 0) throw new Error('Q4 needs at least one value');
  return values.slice(-Math.max(1, Math.ceil(values.length / 4)));
}

function percentile(values, probability) {
  if (values.length === 0) throw new Error('percentile needs at least one value');
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.ceil(probability * ordered.length) - 1;
  return ordered[Math.max(0, Math.min(index, ordered.length - 1))];
}

function nsToMs(value) {
  return value / 1_000_000;
}

function phaseBudgetSvg(blocks) {
  const width = 900;
  const height = 80 + blocks.length * 56;
  const maxMs = Math.max(1, ...blocks.map((block) => block.ownedQ4MeanMsPerFrame));
  const bars = blocks.map((block, index) => {
    const y = 42 + index * 56;
    const barWidth = block.ownedQ4MeanMsPerFrame / maxMs * 520;
    return `<text x="16" y="${y + 18}" font-size="14">${escapeXml(block.block)}</text>` +
      `<rect x="290" y="${y}" width="${barWidth}" height="24" fill="#2457d6"/>` +
      `<text x="${300 + barWidth}" y="${y + 18}" font-size="13">${block.ownedQ4MeanMsPerFrame.toFixed(3)} ms</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    '<rect width="100%" height="100%" fill="white"/><text x="16" y="24" font-size="18">B0 Q4 additive phase budget</text>' + bars + '</svg>\n';
}

function decodeSlopeSvg(steps) {
  const width = 900;
  const height = 420;
  const xs = steps.map((step) => step.pastValidLength);
  const ys = steps.map((step) => nsToMs(step.globalDecodeNs));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(1, ...ys);
  const x = (value) => 60 + (value - minX) / Math.max(1, maxX - minX) * 800;
  const y = (value) => 370 - value / maxY * 330;
  const points = steps.map((step) => `<circle cx="${x(step.pastValidLength)}" cy="${y(nsToMs(step.globalDecodeNs))}" r="3" fill="#c02f5b"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    '<rect width="100%" height="100%" fill="white"/><text x="16" y="24" font-size="18">decode_step vs cache length</text>' +
    '<line x1="60" y1="370" x2="860" y2="370" stroke="black"/><line x1="60" y1="40" x2="60" y2="370" stroke="black"/>' +
    points + '</svg>\n';
}

function underrunCsv(events) {
  const header = 'runMode,ordinal,observedAtNs,observedDuringPhase,frameIndex,batchIndex,attribution\n';
  return header + events.map((event) => [
    event.runMode,
    event.ordinal,
    event.observedAtNs,
    event.observedDuringPhase,
    event.frameIndex ?? '',
    event.batchIndex ?? '',
    event.attribution,
  ].join(',')).join('\n') + (events.length ? '\n' : '');
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
