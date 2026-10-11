import * as gemini from './x-vision-gemini.mjs';
import {
  imageMime,
  maxImageBytes,
  readBounded,
  requestTimeoutMs,
} from './x-vision-input.mjs';

const countUrl = gemini.url.replace(':generateContent', ':countTokens');
const maxRequestCap = 300;
const maxCountTokensPerCall = 10_000;
const maxCountTokensTotal = 3_000_000;
const maxReservedInputTokens = 6_000_000;
const maxReservedOutputTokens = 8_192_000;
const maxReservedTokens = 14_192_000;
const maxCountBytes = 1024 * 1024;
const maxSuccessBytes = 1024 * 1024;
const maxErrorBytes = 16 * 1024;
const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
const secretField =
  /^(authorization|headers|inlineData|base64|api[_-]?key|access[_-]?token|token|key)$/i;

function budgetMicrodollars(value) {
  if (typeof value !== 'string' || !/^[0-9]+(?:\.[0-9]{1,6})?$/.test(value))
    throw new TypeError(
      'budgetUsd must be a positive decimal with at most six fractional digits'
    );
  const [whole, fraction = ''] = value.split('.');
  const significantWhole = whole.replace(/^0+(?=\d)/, '');
  if (significantWhole.length > 10)
    throw new RangeError('budgetUsd exceeds the safe microdollar range');
  const micros =
    BigInt(significantWhole) * 1_000_000n +
    BigInt((fraction + '000000').slice(0, 6));
  if (micros <= 0n || micros > maxSafeInteger)
    throw new RangeError(
      'budgetUsd must be positive and safely representable in microdollars'
    );
  return Number(micros);
}

export function sanitizeEvaluationValue(value, key = '') {
  if (typeof value === 'string') {
    const text = key ? value.replaceAll(key, '[REDACTED]') : value;
    return text.replace(
      /((?:(?:x-goog-api-key|authorization|api[_-]?key|access[_-]?token|token|key)["']?\s*[:=]\s*["']?)(?:[A-Za-z]+\s+)?|Bearer\s+)[^\s"'&,;}]+|\bAIza[0-9A-Za-z_-]{20,}\b/gi,
      '$1[REDACTED]'
    );
  }
  if (Array.isArray(value))
    return value.map((item) => sanitizeEvaluationValue(item, key));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([name]) => !secretField.test(name))
        .map(([name, item]) => [
          sanitizeEvaluationValue(name, key),
          sanitizeEvaluationValue(item, key),
        ])
    );
  return value;
}

function usageFrom(data) {
  const meta = data?.usageMetadata;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta))
    return { usage: null, reason: 'usage metadata is missing' };
  const { promptTokenCount, candidatesTokenCount, totalTokenCount } = meta;
  const thoughtsTokenCount =
    meta.thoughtsTokenCount === undefined ? 0 : meta.thoughtsTokenCount;
  const values = [
    promptTokenCount,
    candidatesTokenCount,
    thoughtsTokenCount,
    totalTokenCount,
  ];
  if (
    values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    promptTokenCount + candidatesTokenCount + thoughtsTokenCount >
      Number.MAX_SAFE_INTEGER ||
    totalTokenCount !==
      promptTokenCount + candidatesTokenCount + thoughtsTokenCount
  )
    return {
      usage: null,
      reason: 'usage token counts are invalid or inconsistent',
    };
  return {
    usage: {
      promptTokenCount,
      candidatesTokenCount,
      thoughtsTokenCount,
      totalTokenCount,
    },
    reason: null,
  };
}

function observedCostUsd(usage) {
  return (
    (usage.promptTokenCount * gemini.price.input +
      (usage.candidatesTokenCount + usage.thoughtsTokenCount) *
        gemini.price.output) /
    1_000_000
  );
}

function responseUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return typeof input?.url === 'string' ? input.url : null;
}

export function createEvaluationFetch({
  key,
  images = new Map(),
  remoteFetch = fetch,
  requestCap = maxRequestCap,
  budgetUsd,
  context = () => ({}),
  signal,
} = {}) {
  if (typeof key !== 'string' || !key.trim())
    throw new TypeError('a nonempty Gemini key is required');
  if (typeof remoteFetch !== 'function')
    throw new TypeError('remoteFetch must be a function');
  if (
    !Number.isSafeInteger(requestCap) ||
    requestCap < 1 ||
    requestCap > maxRequestCap
  )
    throw new RangeError(
      `requestCap must be a positive safe integer no greater than ${maxRequestCap}`
    );
  if (typeof context !== 'function')
    throw new TypeError('context must be a synchronous getter');
  if (signal && typeof signal.aborted !== 'boolean')
    throw new TypeError('signal must be an AbortSignal');
  const budgetLimit = budgetMicrodollars(budgetUsd);
  const pinnedImages =
    images instanceof Map ? images : new Map(Object.entries(images ?? {}));
  const scrub = (value) => sanitizeEvaluationValue(String(value), key);

  let stopReason = null;
  let stopCategory = null;
  let countAttempts = 0;
  let generationAttempts = 0;
  let countedInputTokens = 0;
  let lifetimeInputReservationTokens = 0;
  let lifetimeOutputReservationTokens = 0;
  let lifetimeReservationMicrodollars = 0;
  let knownMicrodollars = 0;
  let unsettledMicrodollars = 0;
  let unknownCallIds = [];
  let trustedUsage = {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    thoughtsTokenCount: 0,
    totalTokenCount: 0,
  };
  const diagnostics = [];
  let generationInFlight = false;

  const latch = (reason, category = 'provider') => {
    if (!stopReason) {
      stopReason = reason;
      stopCategory = category;
    }
    return new Error(stopReason);
  };
  const assertRunning = () => {
    if (stopReason) throw new Error(stopReason);
    if (signal?.aborted) throw latch('request aborted', 'interrupted');
  };
  const assertSignal = (activeSignal) => {
    if (signal?.aborted) throw latch('request aborted', 'interrupted');
    if (activeSignal?.aborted)
      throw latch('request timed out or aborted', 'provider');
  };
  const makeSignal = () => {
    const timeout = AbortSignal.timeout(requestTimeoutMs);
    return signal ? AbortSignal.any([timeout, signal]) : timeout;
  };
  const currentContext = () => {
    let current;
    try {
      current = context();
    } catch {
      current = null;
    }
    return {
      phase: typeof current?.phase === 'string' ? scrub(current.phase) : null,
      postId:
        typeof current?.postId === 'string'
          ? scrub(current.postId)
          : Number.isSafeInteger(current?.postId)
            ? current.postId
            : null,
    };
  };
  const failDiagnostic = (diagnostic, reason, category = 'provider') => {
    diagnostic.stopReason = reason;
    throw latch(reason, category);
  };
  const markUnknown = (diagnostic, reason) => {
    diagnostic.usageTrusted = false;
    diagnostic.usageError = reason;
    if (!unknownCallIds.includes(diagnostic.callId))
      unknownCallIds.push(diagnostic.callId);
  };
  const addTrustedUsage = (
    usage,
    measuredMicrodollars,
    reservationMicrodollars
  ) => {
    for (const name of Object.keys(trustedUsage))
      trustedUsage[name] += usage[name];
    knownMicrodollars += measuredMicrodollars;
    unsettledMicrodollars -= reservationMicrodollars;
  };
  const snapshot = () => {
    const knownCostUsd = observedCostUsd(trustedUsage);
    return structuredClone({
      requestCap,
      budgetMicrodollars: budgetLimit,
      stopReason,
      stopCategory,
      countAttempts,
      generationAttempts,
      countedInputTokens,
      usage: trustedUsage,
      knownMicrodollars,
      knownCostUsd,
      unsettledMicrodollars,
      totalCostUsd: unknownCallIds.length ? null : knownCostUsd,
      lifetimeInputReservationTokens,
      lifetimeOutputReservationTokens,
      lifetimeReservationMicrodollars,
      unknownCallIds,
      diagnostics,
    });
  };

  const fetchImpl = async (input, init = {}) => {
    init ??= {};
    const url = responseUrl(input);
    if (url === gemini.url) {
      assertRunning();
      if (generationInFlight)
        throw latch('overlapping generation path', 'safety');
      generationInFlight = true;
      try {
        return await generationFetch(init);
      } finally {
        generationInFlight = false;
      }
    }
    if (url && pinnedImages.has(url)) {
      assertRunning();
      if (init.signal?.aborted)
        throw latch('image request timed out or aborted', 'provider');
      const image = pinnedImages.get(url);
      const bytes = image?.bytes;
      const mime = image?.mime;
      if (
        !ArrayBuffer.isView(bytes) ||
        bytes.byteLength > maxImageBytes ||
        !mime ||
        imageMime(bytes) !== mime
      )
        throw latch('pinned image is invalid', 'safety');
      return new Response(bytes, { headers: { 'content-type': mime } });
    }
    throw latch('unapproved destination', 'safety');
  };

  async function generationFetch(init) {
    assertRunning();
    if (
      init.method !== 'POST' ||
      init.redirect !== 'error' ||
      typeof init.body !== 'string'
    )
      throw latch('native generation contract mismatch', 'safety');
    let body;
    try {
      body = JSON.parse(init.body);
    } catch {
      throw latch('native generation contract mismatch', 'safety');
    }
    const format = body?.generationConfig?.responseFormat?.text;
    const schema = format?.schema;
    const properties = schema?.properties;
    const triage =
      schema?.type === 'object' &&
      properties &&
      typeof properties === 'object' &&
      !Array.isArray(properties) &&
      Object.hasOwn(properties, 'decision');
    const detail =
      schema?.type === 'object' &&
      properties &&
      typeof properties === 'object' &&
      !Array.isArray(properties) &&
      Object.hasOwn(properties, 'members');
    const stage = triage === detail ? null : triage ? 'triage' : 'detail';
    const outputTokens = body?.generationConfig?.maxOutputTokens;
    const expectedOutput = stage === 'triage' ? 16_384 : 32_768;
    const contents = body?.contents;
    const partsValid =
      Array.isArray(contents) &&
      contents.length > 0 &&
      contents.every(
        (item) =>
          Array.isArray(item?.parts) &&
          item.parts.every(
            (part) =>
              !part?.inlineData ||
              part.media_resolution?.level === 'MEDIA_RESOLUTION_ULTRA_HIGH'
          )
      );
    if (
      format?.mimeType !== 'APPLICATION_JSON' ||
      !schema ||
      Array.isArray(schema) ||
      schema.type !== 'object' ||
      !stage ||
      outputTokens !== expectedOutput ||
      !partsValid
    )
      throw latch('native generation contract mismatch', 'safety');

    if (countAttempts >= requestCap)
      throw latch('countTokens attempts exhausted', 'budget');
    if (generationAttempts >= requestCap)
      throw latch('generation attempts exhausted', 'budget');
    if (countedInputTokens + maxCountTokensPerCall > maxCountTokensTotal)
      throw latch('counted input token cap exceeded', 'budget');

    const contextFields = currentContext();
    const countCallId = `count-${countAttempts + 1}`;
    const countDiagnostic = {
      callId: countCallId,
      ...contextFields,
      stage,
      kind: 'count',
      status: null,
      latencyMs: null,
      countTotalTokens: null,
    };
    diagnostics.push(countDiagnostic);
    countAttempts += 1;
    const countStarted = Date.now();
    let countResponse;
    let countTotalTokens;
    try {
      const activeSignal = makeSignal();
      assertSignal(activeSignal);
      countResponse = await remoteFetch(countUrl, {
        method: 'POST',
        redirect: 'error',
        signal: activeSignal,
        headers: gemini.headers(key),
        body: JSON.stringify({
          generateContentRequest: {
            model: `models/${gemini.model}`,
            ...body,
          },
        }),
      });
      countDiagnostic.status = countResponse?.status ?? null;
      assertSignal(activeSignal);
      const bytes = await readBounded(countResponse.clone(), maxCountBytes);
      assertSignal(activeSignal);
      const raw = new TextDecoder().decode(bytes);
      let countData;
      try {
        countData = JSON.parse(raw);
      } catch {
        countDiagnostic.responseBody = scrub(raw);
        failDiagnostic(
          countDiagnostic,
          'countTokens response is malformed',
          'provider'
        );
      }
      if (!countResponse.ok || countResponse.redirected) {
        countDiagnostic.errorBody = scrub(raw);
        failDiagnostic(
          countDiagnostic,
          'countTokens HTTP or redirect rejected',
          'provider'
        );
      }
      countTotalTokens = countData?.totalTokens;
      if (!Number.isSafeInteger(countTotalTokens) || countTotalTokens <= 0) {
        countDiagnostic.responseBody = scrub(raw);
        failDiagnostic(
          countDiagnostic,
          'countTokens missing or invalid totalTokens',
          'provider'
        );
      }
      countDiagnostic.countTotalTokens = countTotalTokens;
      countDiagnostic.responseJson = { totalTokens: countTotalTokens };
      if (countTotalTokens > maxCountTokensPerCall) {
        failDiagnostic(
          countDiagnostic,
          'counted input token cap exceeded',
          'budget'
        );
      }
      if (countedInputTokens + countTotalTokens > maxCountTokensTotal) {
        failDiagnostic(
          countDiagnostic,
          'counted input token cap exceeded',
          'budget'
        );
      }
      countedInputTokens += countTotalTokens;
    } catch (error) {
      if (!stopReason) {
        const aborted = signal?.aborted;
        const oversized = error?.message === 'response exceeds byte limit';
        latch(
          aborted
            ? 'request aborted'
            : oversized
              ? 'countTokens response exceeded byte limit'
              : error?.name === 'AbortError' || error?.name === 'TimeoutError'
                ? 'countTokens request timed out'
                : 'countTokens request failed',
          aborted ? 'interrupted' : 'provider'
        );
      }
      countDiagnostic.error ??= scrub(
        error?.message ?? 'countTokens request failed'
      );
      countDiagnostic.stopReason = stopReason;
      if (error instanceof Error) {
        error.message = scrub(error.message);
        Reflect.deleteProperty(error, 'cause');
      }
      throw new Error(stopReason, { cause: error });
    } finally {
      countDiagnostic.latencyMs = Date.now() - countStarted;
    }

    try {
      assertRunning();
    } catch (error) {
      countDiagnostic.stopReason = stopReason;
      throw error;
    }
    const inputReservation = 2 * countTotalTokens;
    const reservationMicrodollars = Math.ceil(
      inputReservation * gemini.price.input + outputTokens * gemini.price.output
    );
    countDiagnostic.reservation = {
      inputTokens: inputReservation,
      outputTokens,
      microdollars: reservationMicrodollars,
    };
    if (
      lifetimeInputReservationTokens + inputReservation >
        maxReservedInputTokens ||
      lifetimeOutputReservationTokens + outputTokens >
        maxReservedOutputTokens ||
      lifetimeInputReservationTokens +
        lifetimeOutputReservationTokens +
        inputReservation +
        outputTokens >
        maxReservedTokens
    ) {
      countDiagnostic.stopReason = 'lifetime reservation cap exceeded';
      throw latch('lifetime reservation cap exceeded', 'budget');
    }
    if (
      BigInt(knownMicrodollars) +
        BigInt(unsettledMicrodollars) +
        BigInt(reservationMicrodollars) >
      BigInt(budgetLimit)
    ) {
      countDiagnostic.stopReason = 'budget ceiling exceeded';
      throw latch('budget ceiling exceeded', 'budget');
    }

    const callId = `generation-${generationAttempts + 1}`;
    const diagnostic = {
      callId,
      countCallId,
      ...contextFields,
      stage,
      kind: 'generation',
      status: null,
      latencyMs: null,
      countTotalTokens,
      reservation: {
        inputTokens: inputReservation,
        outputTokens,
        microdollars: reservationMicrodollars,
      },
      usage: null,
      usageTrusted: false,
    };
    diagnostics.push(diagnostic);
    lifetimeInputReservationTokens += inputReservation;
    lifetimeOutputReservationTokens += outputTokens;
    lifetimeReservationMicrodollars += reservationMicrodollars;
    unsettledMicrodollars += reservationMicrodollars;
    generationAttempts += 1;
    const generationStarted = Date.now();
    let response;
    try {
      const activeSignal = makeSignal();
      assertSignal(activeSignal);
      response = await remoteFetch(gemini.url, {
        method: 'POST',
        redirect: 'error',
        signal: activeSignal,
        headers: gemini.headers(key),
        body: init.body,
      });
      diagnostic.status = response?.status ?? null;
      assertSignal(activeSignal);
      const redirected = Boolean(response?.redirected);
      const success = Boolean(response?.ok) && !redirected;
      const bytes = await readBounded(
        response.clone(),
        success ? maxSuccessBytes : maxErrorBytes
      );
      assertSignal(activeSignal);
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!success) diagnostic.errorBody = scrub(raw);
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        diagnostic.responseBody = scrub(raw);
        markUnknown(diagnostic, 'provider response JSON is malformed');
        failDiagnostic(
          diagnostic,
          success
            ? 'malformed provider response'
            : 'generation HTTP or redirect rejected',
          'provider'
        );
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        diagnostic.responseBody = scrub(raw);
        markUnknown(diagnostic, 'provider response is not an object');
        failDiagnostic(
          diagnostic,
          success
            ? 'malformed provider response'
            : 'generation HTTP or redirect rejected',
          'provider'
        );
      }
      const finishReason = data?.candidates?.[0]?.finishReason;
      diagnostic.finishReason =
        typeof finishReason === 'string' ? scrub(finishReason) : null;
      const text = gemini.text(data);
      diagnostic.text = typeof text === 'string' ? scrub(text) : null;
      let parsed;
      let contentValid = false;
      if (typeof text === 'string' && text.trim()) {
        try {
          parsed = JSON.parse(text);
          contentValid = Boolean(
            parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          );
        } catch {
          contentValid = false;
        }
      }
      if (contentValid)
        diagnostic.parsedJson = sanitizeEvaluationValue(parsed, key);
      else diagnostic.responseBody = scrub(raw);

      const { usage, reason: usageError } = usageFrom(data);
      if (usage) {
        diagnostic.usage = usage;
        const observedUsd = observedCostUsd(usage);
        const overReservation =
          usage.promptTokenCount > inputReservation ||
          usage.candidatesTokenCount + usage.thoughtsTokenCount > outputTokens;
        if (overReservation) {
          diagnostic.usageTrusted = false;
          diagnostic.observedUsage = usage;
          diagnostic.observedCostUsd = observedUsd;
          diagnostic.reservationDiscrepancy = {
            promptTokenCount: usage.promptTokenCount,
            reservedInputTokens: inputReservation,
            outputTokenCount:
              usage.candidatesTokenCount + usage.thoughtsTokenCount,
            outputCeilingTokens: outputTokens,
          };
          markUnknown(diagnostic, 'reported usage exceeded its reservation');
        } else {
          diagnostic.usageTrusted = true;
          addTrustedUsage(
            usage,
            Math.ceil(
              usage.promptTokenCount * gemini.price.input +
                (usage.candidatesTokenCount + usage.thoughtsTokenCount) *
                  gemini.price.output
            ),
            reservationMicrodollars
          );
        }
      } else {
        markUnknown(diagnostic, usageError);
      }

      let failureReason = null;
      if (diagnostic.reservationDiscrepancy)
        failureReason = 'actual tokens exceeded reservation';
      else if (!success) failureReason = 'generation HTTP or redirect rejected';
      else if (gemini.truncated(data))
        failureReason = 'provider response truncated (MAX_TOKENS)';
      else if (!contentValid)
        failureReason =
          typeof text === 'string' && text.trim()
            ? 'provider content is not valid JSON'
            : 'provider content was blank or invalid';
      else if (!usage) failureReason = 'provider usage missing or inconsistent';
      if (failureReason) {
        diagnostic.stopReason = failureReason;
        latch(failureReason, 'provider');
      }
      return response;
    } catch (error) {
      if (!diagnostic.usageTrusted) {
        markUnknown(
          diagnostic,
          signal?.aborted
            ? 'request interrupted'
            : 'generation usage is unknown'
        );
      }
      if (!stopReason) {
        const aborted = signal?.aborted;
        const oversized = error?.message === 'response exceeds byte limit';
        latch(
          aborted
            ? 'request aborted'
            : oversized
              ? 'provider response exceeded byte limit'
              : error?.name === 'AbortError' || error?.name === 'TimeoutError'
                ? 'generation request timed out'
                : 'generation request failed',
          aborted ? 'interrupted' : 'provider'
        );
      }
      diagnostic.error ??= scrub(error?.message ?? 'generation request failed');
      diagnostic.stopReason = stopReason;
      if (response) return response;
      if (error instanceof Error) {
        error.message = scrub(error.message);
        Reflect.deleteProperty(error, 'cause');
      }
      throw new Error(stopReason, { cause: error });
    } finally {
      diagnostic.latencyMs = Date.now() - generationStarted;
    }
  }

  return { fetchImpl, snapshot };
}
