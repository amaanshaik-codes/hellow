import { kv } from '@vercel/kv';

// In-memory recent traces (fast access, per-instance)
// Map<messageId, Array<TraceEvent>>
const inMemoryTraces = new Map();

const MAX_PER_MESSAGE = 200;
const KV_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * TraceEvent: { type: 'STORE'|'BROADCAST'|'DELIVER'|'ACK', timestamp, details }
 */
export async function traceEvent(messageId, type, details = {}) {
  try {
    const ev = {
      type,
      timestamp: Date.now(),
      details
    };

    // Update in-memory buffer
    let arr = inMemoryTraces.get(messageId) || [];
    arr.push(ev);
    if (arr.length > MAX_PER_MESSAGE) arr = arr.slice(-MAX_PER_MESSAGE);
    inMemoryTraces.set(messageId, arr);

    // Also persist to KV for cross-instance inspection
    try {
      const key = `message_trace_${messageId}`;
      const existing = await kv.get(key) || [];
      let merged = existing.concat([ev]);
      if (merged.length > MAX_PER_MESSAGE) merged = merged.slice(-MAX_PER_MESSAGE);
      // Store with expiry so traces don't live forever
      await kv.setex(key, KV_TTL_SECONDS, merged);
    } catch (kvErr) {
      // Non-fatal
      console.warn('messageTrace: failed to persist to KV', kvErr);
    }
  } catch (err) {
    console.error('messageTrace.traceEvent error', err);
  }
}

export async function getTraces(messageId) {
  // Merge in-memory (latest) and KV (stable)
  try {
    const kvKey = `message_trace_${messageId}`;
    const kvList = await kv.get(kvKey) || [];
    const mem = inMemoryTraces.get(messageId) || [];

    // Merge and dedupe by timestamp+type
    const merged = kvList.concat(mem);
    // Sort by timestamp
    merged.sort((a, b) => a.timestamp - b.timestamp);
    return merged;
  } catch (err) {
    console.error('messageTrace.getTraces error', err);
    return inMemoryTraces.get(messageId) || [];
  }
}

export function clearInMemoryTraces(messageId) {
  inMemoryTraces.delete(messageId);
}
