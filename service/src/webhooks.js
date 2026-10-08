import { createHash } from "node:crypto";
import { Signature } from "@hubspot/api-client";
import { config } from "./config.js";
import { enrichAircallTicket } from "./aircallEnrich.js";

export const WEBHOOK_PATH = "/webhooks/hubspot";

const TICKET_OBJECT_TYPE_ID = "0-5";
const CALL_OBJECT_TYPE_ID = "0-48";
const RETRY_DELAYS_MS = [5_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;

const pendingTimers = new Map();

export function verifyWebhookRequest(req, res, next) {
  const rawBody = req.rawBody ?? "";
  const v3 = req.header("X-HubSpot-Signature-v3");
  const timestamp = req.header("X-HubSpot-Request-Timestamp");

  if (v3 && timestamp) {
    if (Number(timestamp) < Date.now() - MAX_REQUEST_AGE_MS) {
      return res.status(401).json({ error: "Request timestamp is too old." });
    }

    const isValid = Signature.isValid({
      signatureVersion: "v3",
      signature: v3,
      method: req.method,
      clientSecret: config.hubspotClientSecret,
      requestBody: rawBody,
      url: `${config.publicBaseUrl}${WEBHOOK_PATH}`,
      timestamp
    });

    return isValid ? next() : res.status(401).json({ error: "Invalid HubSpot webhook signature." });
  }

  const v1 = req.header("X-HubSpot-Signature");
  const expected = createHash("sha256").update(config.hubspotClientSecret + rawBody).digest("hex");

  if (v1 && v1 === expected) {
    return next();
  }

  res.status(401).json({ error: "Missing or invalid HubSpot webhook signature." });
}

function isTicketEvent(event) {
  return event.objectTypeId === TICKET_OBJECT_TYPE_ID || /^ticket\./.test(event.subscriptionType ?? "");
}

function involvesCall(event) {
  return (
    event.toObjectTypeId === CALL_OBJECT_TYPE_ID ||
    event.fromObjectTypeId === CALL_OBJECT_TYPE_ID ||
    /CALL/i.test(event.associationType ?? "")
  );
}

function ticketIdFor(event) {
  if (/associationChange$/i.test(event.subscriptionType ?? "")) {
    if (!involvesCall(event) || event.associationRemoved) {
      return null;
    }

    return String(event.fromObjectTypeId === TICKET_OBJECT_TYPE_ID ? event.fromObjectId : event.objectId ?? event.fromObjectId);
  }

  if (/creation$/i.test(event.subscriptionType ?? "") && isTicketEvent(event)) {
    return String(event.objectId);
  }

  return null;
}

function runEnrichment(ticketId, attempt) {
  enrichAircallTicket(ticketId)
    .then((result) => {
      if (result.skipped) {
        console.log(`Aircall enrich ${ticketId} attempt ${attempt + 1}: ${result.skipped}`);
      } else {
        console.log(`Aircall enrich ${ticketId} attempt ${attempt + 1}: ${result.type} - ${result.subject}`);
      }
    })
    .catch((error) => console.error(`Aircall enrich ${ticketId} failed: ${error.message}`));
}

export function scheduleAircallEnrichment(ticketId) {
  for (const timer of pendingTimers.get(ticketId) ?? []) {
    clearTimeout(timer);
  }

  const timers = RETRY_DELAYS_MS.map((delay, attempt) =>
    setTimeout(() => {
      runEnrichment(ticketId, attempt);

      if (attempt === RETRY_DELAYS_MS.length - 1) {
        pendingTimers.delete(ticketId);
      }
    }, delay)
  );

  pendingTimers.set(ticketId, timers);
}

export function handleHubSpotWebhook(req, res) {
  const events = Array.isArray(req.body) ? req.body : [req.body];
  const ticketIds = new Set(events.map(ticketIdFor).filter(Boolean));

  for (const ticketId of ticketIds) {
    scheduleAircallEnrichment(ticketId);
  }

  res.status(204).end();
}
