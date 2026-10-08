import { getTicketProperties, hubspotGetOrNull, hubspotRequest, updateTicketProperties } from "./hubspot.js";
import { AIRCALL_APP_ID, AIRCALL_PROPERTY_NAMES, CALL_TYPES } from "./aircallSchema.js";
import { getAircallTranscript } from "./aircallApi.js";

const CALL_PROPERTIES = [
  "hs_timestamp",
  "hs_call_app_id",
  "hs_call_body",
  "hs_call_title",
  "hs_call_direction",
  "hs_call_status",
  "hs_call_duration",
  "hs_call_from_number",
  "hs_call_to_number",
  "hs_call_external_id",
  "hs_call_recording_url",
  "hs_call_has_voicemail",
  "hs_voicemail_count",
  "hs_call_summary",
  "hs_call_has_transcript"
];

const TICKET_PROPERTIES = ["subject", "content", "source_type", ...Object.values(AIRCALL_PROPERTY_NAMES)];
const NOTE_TO_TICKET_ASSOCIATION_TYPE_ID = 228;

const DEFAULT_SUBJECT = /aircall new ticket/i;
const OUR_SUBJECT = /^(Voicemail from|Missed call from|Call with|Outbound call to) /;
const OUR_CONTENT = /^(Voicemail|Missed call|Answered call|Outbound call) (on|to) /;
const TIME_ZONE = "America/Denver";

function stripHtml(html) {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(text) {
  return (text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPhone(number) {
  const digits = (number ?? "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return number ?? "";
}

function formatWhen(timestamp) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function formatDuration(ms) {
  const totalSeconds = Math.round(Number(ms ?? 0) / 1000);

  if (!totalSeconds) {
    return "";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatClock(seconds) {
  const whole = Math.floor(Number(seconds ?? 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

function extractLinks(html) {
  const links = [];
  const pattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let match;

  while ((match = pattern.exec(html ?? ""))) {
    links.push({ url: match[1], label: stripHtml(match[2]) });
  }

  return links;
}

export function describeCall(call, contactName, transcript) {
  const p = call.properties;
  const bodyHtml = p.hs_call_body ?? "";
  const bodyText = stripHtml(bodyHtml);
  const links = extractLinks(bodyHtml);
  const hasVoicemail =
    p.hs_call_has_voicemail === "Yes" || Number(p.hs_voicemail_count ?? 0) > 0 || /voicemail/i.test(bodyText);
  const isOutbound = p.hs_call_direction === "OUTBOUND" || /outbound/i.test(bodyText);
  const isMissed = /missed call|unanswered|not answered/i.test(bodyText) || Number(p.hs_call_duration ?? 0) === 0;

  let type = CALL_TYPES.answered;
  if (hasVoicemail) type = CALL_TYPES.voicemail;
  else if (isOutbound) type = CALL_TYPES.outbound;
  else if (isMissed) type = CALL_TYPES.missed;

  const line = firstMatch(bodyHtml, /\son\s+<strong>([^<]+)<\/strong>/i);
  const answeredBy = firstMatch(bodyHtml, /answered by\s+<strong>([^<]+)<\/strong>/i);
  const callerNumber = isOutbound ? p.hs_call_to_number : p.hs_call_from_number;
  const callerPhone = formatPhone(callerNumber);
  const caller = contactName || callerPhone || "unknown number";
  const recording =
    links.find((link) => /voicemail/i.test(link.label) || /voicemail/i.test(link.url)) ??
    links.find((link) => /recording/i.test(link.label) || /recording/i.test(link.url));
  const recordingLabel = type === CALL_TYPES.voicemail ? "Voicemail" : "Recording";
  const summary = stripHtml(p.hs_call_summary);
  const callId = p.hs_call_external_id || firstMatch(bodyText, /Call ID:\s*(\d+)/i);
  const when = formatWhen(p.hs_timestamp);
  const duration = formatDuration(p.hs_call_duration);
  const speakers = new Set((transcript ?? []).map((u) => u.speaker).filter(Boolean));
  const speakerLabel = (u) => (speakers.size > 1 ? `${u.speaker === "internal" ? "Agent" : "Caller"}: ` : "");
  const transcriptText = (transcript ?? []).map((u) => `[${formatClock(u.startTimeSeconds)}] ${speakerLabel(u)}${u.text}`).join("\n");

  const subjectByType = {
    [CALL_TYPES.voicemail]: `Voicemail from ${caller}`,
    [CALL_TYPES.missed]: `Missed call from ${caller}`,
    [CALL_TYPES.answered]: `Call with ${caller}`,
    [CALL_TYPES.outbound]: `Outbound call to ${caller}`
  };
  const subject = line && !isOutbound ? `${subjectByType[type]} - ${line}` : subjectByType[type];
  const headline = isOutbound ? `${type} to ${caller}` : `${type} on ${line || "Aircall"}`;

  const lines = [headline, `From: ${caller}${contactName && callerPhone ? ` (${callerPhone})` : ""}`];
  if (answeredBy) lines.push(`Answered by: ${answeredBy}`);
  lines.push(`When: ${when} MT`);
  if (duration) lines.push(`Duration: ${duration}`);
  if (recording) lines.push(`${recordingLabel}: ${recording.url}`);
  if (type === CALL_TYPES.voicemail && !recording) lines.push("Voicemail: not yet available from Aircall");
  if (transcriptText) lines.push("", "Transcript:", transcriptText);
  if (summary) lines.push("", "Call summary (HubSpot AI):", summary);
  if (type === CALL_TYPES.missed && callerPhone) lines.push("", `Call back: ${callerPhone}`);
  lines.push("", `Aircall call ID: ${callId}`);

  const noteParts = [
    `<p><strong>${escapeHtml(headline)}</strong></p>`,
    `<p>From: ${escapeHtml(caller)}${contactName && callerPhone ? ` (${escapeHtml(callerPhone)})` : ""}<br>` +
      (answeredBy ? `Answered by: ${escapeHtml(answeredBy)}<br>` : "") +
      `When: ${escapeHtml(when)} MT` +
      (duration ? `<br>Duration: ${escapeHtml(duration)}` : "") +
      "</p>"
  ];
  if (recording) {
    noteParts.push(`<p><a href="${escapeHtml(recording.url)}" target="_blank">Listen to the ${recordingLabel.toLowerCase()} in Aircall</a></p>`);
  }
  if (transcriptText) {
    noteParts.push(
      `<p><strong>Transcript</strong></p><p>${(transcript ?? [])
        .map((u) => `<em>${formatClock(u.startTimeSeconds)}</em> ${escapeHtml(speakerLabel(u))}${escapeHtml(u.text)}`)
        .join("<br>")}</p>`
    );
  }
  if (p.hs_call_summary) {
    noteParts.push(`<p><strong>Call summary (HubSpot AI)</strong></p>${p.hs_call_summary}`);
  }
  if (type === CALL_TYPES.missed && callerPhone) {
    noteParts.push(`<p>Call back: ${escapeHtml(callerPhone)}</p>`);
  }
  noteParts.push(`<p><em>Aircall call ID ${escapeHtml(callId)}. Kept up to date by the Aircall Ticket Enricher.</em></p>`);

  return {
    type,
    subject,
    content: lines.join("\n"),
    noteBody: noteParts.join(""),
    properties: {
      [AIRCALL_PROPERTY_NAMES.callType]: type,
      [AIRCALL_PROPERTY_NAMES.callId]: callId,
      [AIRCALL_PROPERTY_NAMES.line]: line,
      [AIRCALL_PROPERTY_NAMES.callerNumber]: callerNumber ?? "",
      [AIRCALL_PROPERTY_NAMES.recordingUrl]: recording?.url ?? "",
      [AIRCALL_PROPERTY_NAMES.transcript]: transcriptText.slice(0, 65000),
      [AIRCALL_PROPERTY_NAMES.summary]: summary,
      [AIRCALL_PROPERTY_NAMES.enrichedAt]: new Date().toISOString()
    }
  };
}

async function getAssociatedIds(ticketId, objectType) {
  const result = await hubspotGetOrNull(`/crm/v4/objects/tickets/${encodeURIComponent(ticketId)}/associations/${objectType}`);
  return (result?.results ?? []).map((item) => item.toObjectId);
}

async function getLatestAircallCall(ticketId) {
  const callIds = await getAssociatedIds(ticketId, "calls");
  const calls = [];

  for (const callId of callIds) {
    const call = await hubspotGetOrNull(`/crm/v3/objects/calls/${callId}?properties=${CALL_PROPERTIES.join(",")}`);

    if (call && call.properties.hs_call_app_id === AIRCALL_APP_ID) {
      calls.push(call);
    }
  }

  calls.sort((a, b) => new Date(b.properties.hs_timestamp) - new Date(a.properties.hs_timestamp));
  return calls[0] ?? null;
}

async function getContactName(ticketId) {
  const [contactId] = await getAssociatedIds(ticketId, "contacts");

  if (!contactId) {
    return "";
  }

  const contact = await hubspotGetOrNull(`/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname`).catch(() => null);
  const name = [contact?.properties?.firstname, contact?.properties?.lastname].filter(Boolean).join(" ").trim();

  if (!name || /aircall new contact/i.test(name) || /^\+?\d[\d\s()-]*$/.test(name)) {
    return "";
  }

  return name;
}

async function getHubSpotTranscript(call) {
  if (call.properties.hs_call_has_transcript !== "true") {
    return [];
  }

  try {
    const result = await hubspotRequest("GET", `/crm/extensions/calling/2026-03/transcripts/${call.id}`);
    const utterances = result?.utterances ?? result?.transcriptUtterances ?? [];

    return utterances
      .map((u) => ({ startTimeSeconds: u.startTimeSeconds ?? u.startTime ?? 0, text: (u.utterance ?? u.text ?? "").trim() }))
      .filter((u) => u.text);
  } catch (error) {
    if (![401, 403, 404].includes(error.status)) {
      console.error(`HubSpot transcript for call ${call.id} failed: ${error.message}`);
    }

    return [];
  }
}

async function getTranscript(call, aircallCallId) {
  const fromAircall = await getAircallTranscript(aircallCallId);
  return fromAircall.length > 0 ? fromAircall : getHubSpotTranscript(call);
}

async function upsertNote(ticketId, existingNoteId, body, timestamp) {
  if (existingNoteId) {
    const updated = await hubspotRequest("PATCH", `/crm/v3/objects/notes/${existingNoteId}`, {
      properties: { hs_note_body: body }
    }).catch((error) => (error.status === 404 ? null : Promise.reject(error)));

    if (updated) {
      return existingNoteId;
    }
  }

  const created = await hubspotRequest("POST", "/crm/v3/objects/notes", {
    properties: { hs_timestamp: timestamp ?? new Date().toISOString(), hs_note_body: body },
    associations: [
      {
        to: { id: String(ticketId) },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTE_TO_TICKET_ASSOCIATION_TYPE_ID }]
      }
    ]
  });

  return created.id;
}

export async function enrichAircallTicket(ticketId) {
  const ticket = await getTicketProperties(ticketId, TICKET_PROPERTIES).catch(() => null);

  if (!ticket) {
    return { ticketId, skipped: "ticket not found" };
  }

  const current = ticket.properties;
  const ownedByUs = Boolean(current[AIRCALL_PROPERTY_NAMES.callId]);

  if (!DEFAULT_SUBJECT.test(current.subject ?? "") && !ownedByUs) {
    return { ticketId, skipped: "not an Aircall ticket" };
  }

  const call = await getLatestAircallCall(ticketId);

  if (!call) {
    return { ticketId, skipped: "no Aircall call attached yet" };
  }

  const aircallCallId = call.properties.hs_call_external_id || firstMatch(stripHtml(call.properties.hs_call_body), /Call ID:\s*(\d+)/i);
  const [contactName, transcript] = await Promise.all([getContactName(ticketId), getTranscript(call, aircallCallId)]);
  const details = describeCall(call, contactName, transcript);
  const properties = { ...details.properties };

  if (DEFAULT_SUBJECT.test(current.subject ?? "") || OUR_SUBJECT.test(current.subject ?? "")) {
    properties.subject = details.subject;
  }

  if (!current.content || OUR_CONTENT.test(current.content)) {
    properties.content = details.content;
  }

  if (!current.source_type) {
    properties.source_type = "PHONE";
  }

  properties[AIRCALL_PROPERTY_NAMES.noteId] = await upsertNote(
    ticketId,
    current[AIRCALL_PROPERTY_NAMES.noteId],
    details.noteBody,
    call.properties.hs_timestamp
  );

  await updateTicketProperties(ticketId, properties);
  return { ticketId, type: details.type, subject: properties.subject ?? current.subject, transcriptLines: transcript.length };
}

export async function findAircallTickets(limit = 100) {
  const result = await hubspotRequest("POST", "/crm/v3/objects/tickets/search", {
    filterGroups: [
      { filters: [{ propertyName: "subject", operator: "CONTAINS_TOKEN", value: "Aircall" }] },
      { filters: [{ propertyName: AIRCALL_PROPERTY_NAMES.callId, operator: "HAS_PROPERTY" }] }
    ],
    properties: ["subject"],
    limit
  });

  return result.results.map((ticket) => ticket.id);
}
