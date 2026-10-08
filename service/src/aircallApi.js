import { config } from "./config.js";
import { requestJson } from "./http.js";

const AIRCALL_API = "https://api.aircall.io/v1";

export function aircallEnabled() {
  return Boolean(config.aircallApiId && config.aircallApiToken);
}

function aircallRequest(path) {
  const credentials = Buffer.from(`${config.aircallApiId}:${config.aircallApiToken}`).toString("base64");

  return requestJson(
    `${AIRCALL_API}${path}`,
    { method: "GET", headers: { Authorization: `Basic ${credentials}` } },
    `Aircall GET ${path}`
  );
}

function toSeconds(value) {
  if (value === undefined || value === null) {
    return 0;
  }

  if (typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?/.test(value)) {
    const parts = value.split(":").map(Number);
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  }

  return Number(value) || 0;
}

function findUtterances(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) {
    return null;
  }

  if (Array.isArray(node)) {
    if (node.length > 0 && node.every((item) => item && typeof item === "object" && ("text" in item || "content" in item))) {
      return node;
    }

    for (const item of node) {
      const found = findUtterances(item, depth + 1);
      if (found) return found;
    }

    return null;
  }

  for (const key of ["utterances", "turns", "segments", "sentences", "items"]) {
    if (Array.isArray(node[key])) {
      return node[key];
    }
  }

  for (const value of Object.values(node)) {
    const found = findUtterances(value, depth + 1);
    if (found) return found;
  }

  return null;
}

export function parseAircallTranscript(payload) {
  const utterances = findUtterances(payload) ?? [];

  return utterances
    .map((u) => ({
      startTimeSeconds: toSeconds(u.start_time ?? u.start ?? u.startTime ?? u.offset),
      text: String(u.text ?? u.content ?? "").trim(),
      speaker: u.participant_type ?? u.speaker ?? u.role ?? ""
    }))
    .filter((u) => u.text);
}

export async function getAircallTranscript(aircallCallId) {
  if (!aircallEnabled() || !aircallCallId) {
    return [];
  }

  try {
    const payload = await aircallRequest(`/calls/${encodeURIComponent(aircallCallId)}/transcription`);
    return parseAircallTranscript(payload);
  } catch (error) {
    if (error.status !== 404) {
      console.error(`Aircall transcript for call ${aircallCallId} failed: ${error.message}`);
    }

    return [];
  }
}

export async function getAircallCall(aircallCallId) {
  if (!aircallEnabled() || !aircallCallId) {
    return null;
  }

  try {
    const payload = await aircallRequest(`/calls/${encodeURIComponent(aircallCallId)}`);
    return payload?.call ?? payload;
  } catch (error) {
    if (error.status !== 404) {
      console.error(`Aircall call ${aircallCallId} failed: ${error.message}`);
    }

    return null;
  }
}
