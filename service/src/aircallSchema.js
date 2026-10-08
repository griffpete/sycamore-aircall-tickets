export const AIRCALL_APP_ID = "36503";

export const AIRCALL_PROPERTY_GROUP = {
  name: "aircall",
  label: "Aircall"
};

export const AIRCALL_PROPERTY_NAMES = {
  callType: "aircall_call_type",
  callId: "aircall_call_id",
  line: "aircall_line",
  callerNumber: "aircall_caller_number",
  recordingUrl: "aircall_recording_url",
  transcript: "aircall_voicemail_transcript",
  summary: "aircall_call_summary",
  noteId: "aircall_note_id",
  enrichedAt: "aircall_enriched_at"
};

export const CALL_TYPES = {
  voicemail: "Voicemail",
  missed: "Missed call",
  answered: "Answered call",
  outbound: "Outbound call"
};

export const AIRCALL_PROPERTIES = [
  {
    name: AIRCALL_PROPERTY_NAMES.callType,
    label: "Aircall call type",
    description: "What kind of Aircall call created this ticket.",
    type: "enumeration",
    fieldType: "select",
    options: Object.values(CALL_TYPES).map((label, index) => ({ label, value: label, displayOrder: index }))
  },
  {
    name: AIRCALL_PROPERTY_NAMES.callId,
    label: "Aircall call ID",
    description: "Aircall's ID for the call behind this ticket.",
    type: "string",
    fieldType: "text"
  },
  {
    name: AIRCALL_PROPERTY_NAMES.line,
    label: "Aircall line",
    description: "The Aircall number the caller reached, such as Customer Support.",
    type: "string",
    fieldType: "text"
  },
  {
    name: AIRCALL_PROPERTY_NAMES.callerNumber,
    label: "Aircall caller number",
    description: "The caller's phone number as Aircall reported it.",
    type: "string",
    fieldType: "text"
  },
  {
    name: AIRCALL_PROPERTY_NAMES.recordingUrl,
    label: "Aircall recording",
    description: "Link to the voicemail or call recording in Aircall.",
    type: "string",
    fieldType: "text"
  },
  {
    name: AIRCALL_PROPERTY_NAMES.transcript,
    label: "Voicemail transcript",
    description: "Transcript of the voicemail or call, from Aircall via HubSpot.",
    type: "string",
    fieldType: "textarea"
  },
  {
    name: AIRCALL_PROPERTY_NAMES.summary,
    label: "Call summary",
    description: "HubSpot's AI summary of the call, when one exists.",
    type: "string",
    fieldType: "textarea"
  },
  {
    name: AIRCALL_PROPERTY_NAMES.noteId,
    label: "Aircall note ID",
    description: "HubSpot note the bridge keeps updated with the call details.",
    type: "string",
    fieldType: "text"
  },
  {
    name: AIRCALL_PROPERTY_NAMES.enrichedAt,
    label: "Aircall details updated at",
    description: "When the bridge last copied call details onto this ticket.",
    type: "datetime",
    fieldType: "date"
  }
];
