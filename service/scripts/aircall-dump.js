import { getAircallCall, getAircallTranscript, aircallEnabled } from "../src/aircallApi.js";
import { config } from "../src/config.js";
import { requestJson } from "../src/http.js";

const [aircallCallId] = process.argv.slice(2);

if (!aircallCallId) {
  console.error("Usage: npm run aircall:dump -- <aircall call id>");
  process.exit(1);
}

if (!aircallEnabled()) {
  console.error("Set AIRCALL_API_ID and AIRCALL_API_TOKEN in .env first.");
  process.exit(1);
}

const credentials = Buffer.from(`${config.aircallApiId}:${config.aircallApiToken}`).toString("base64");
const raw = await requestJson(
  `https://api.aircall.io/v1/calls/${aircallCallId}/transcription`,
  { headers: { Authorization: `Basic ${credentials}` } },
  "Aircall transcription"
).catch((error) => ({ error: error.message }));

console.log("Raw transcription response:");
console.log(JSON.stringify(raw, null, 2).slice(0, 6000));
console.log("\nParsed utterances:");
console.log(await getAircallTranscript(aircallCallId));
console.log("\nCall:");
const call = await getAircallCall(aircallCallId);
console.log(call ? { id: call.id, status: call.status, duration: call.duration, voicemail: call.voicemail, recording: call.recording, asset: call.asset, number: call.number?.name } : null);
