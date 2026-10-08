# Aircall Ticket Enricher for HubSpot Help Desk

Aircall (HubSpot app 36503) creates a support ticket per call with the subject `+1555… Aircall new ticket` and an empty description. The useful details sit on the call activity attached to the ticket. This service copies them onto the ticket so agents see what the call was about without digging.

Separate from the ClickUp Bug Linker on purpose: that app only links bugs.

## Code style

- No comments in code.
- Keep code straightforward and readable.

## Architecture

```
HubSpot webhooks (ticket object.creation, object.associationChange)
  -> POST /webhooks/hubspot on this Node/Express service (service/, hosted on Render)
       -> HubSpot CRM API: reads the attached Aircall call, the contact, and the transcript
       -> writes ticket subject, description, aircall_* properties and one note on the ticket
```

- `hubspot/` is the HubSpot developer project. App uid `aircall_ticket_enricher`, static auth. Webhook subscriptions live in `hubspot/src/app/webhooks/webhook-hsmeta.json`; `targetUrl` must be this service's public URL plus `/webhooks/hubspot`.
- `service/src/webhooks.js` verifies the signature (v3 when HubSpot sends it, otherwise v1 `sha256(secret + body)`), answers 204 at once, and schedules `enrichAircallTicket` at +5s, +2m, +10m and +30m, because the recording link, HubSpot AI summary and transcript arrive after the ticket does.
- `service/src/aircallEnrich.js` reads the newest Aircall call on the ticket and writes: subject (`Voicemail from (435) 922-5385 - Customer Support`, `Missed call from …`, `Call with …`, `Outbound call to …`), a plain-text description, the `aircall_*` ticket properties (`aircallSchema.js`, property group "Aircall", shared with the properties Aircall itself created), and one HubSpot note on the ticket, whose id is kept in `aircall_note_id` and updated in place. Notes render in the help desk center pane. A subject or description is only overwritten when it is the Aircall default or one this service wrote, so agent edits survive.
- Transcripts: Aircall uploads voicemail and call transcripts through HubSpot's public Transcripts API. Reading them needs `crm.extensions_calling_transcripts.read` and `GET /crm/extensions/calling/2026-03/transcripts/{callId}`. Without the scope the fetch 403s and is skipped; the HubSpot AI summary (`hs_call_summary`) is used either way.

## Accounts

- HubSpot portal: sycamore-leaf-solutions (243811447), Professional tier.
- Aircall: ticket-creation rules per call type (missed, voicemail, answered, SMS) live in the Aircall dashboard under the HubSpot integration, not in HubSpot. Voicemails on the Customer Support line already create tickets.

## Commands

From `service/`: `npm install`, `npm run dev`, `npm run setup:hubspot` (creates the Aircall ticket properties), `npm run backfill [ticketId …]` (enriches existing Aircall tickets; with no ids, every ticket whose subject contains "Aircall" or that this service already touched).

From `hubspot/`: `hs project upload --account=243811447`, then approve the app's scopes at `https://app-na2.hubspot.com/static-token/243811447/authorize?appId=<app id>`.

## Setup order

1. `hs project upload` from `hubspot/`, approve scopes, copy the client secret (Auth tab) and static token (Distribution tab) into `service/.env` (see `.env.example`).
2. Create the Render web service from `service/render.yaml` (or any host with a public HTTPS URL). Set `PUBLIC_BASE_URL` to that URL exactly; signature checks fail otherwise.
3. Put the same URL plus `/webhooks/hubspot` into `webhook-hsmeta.json` and upload again.
4. `npm run setup:hubspot`, then `npm run backfill`.

## Gotchas

- Keep `uid` in `app-hsmeta.json` and `name` in `hsproject.json` as they are, or HubSpot creates a second app.
- Aircall's call body starts with "Voicemail on <line>" (link `https://assets.aircall.io/calls/<id>/voicemail`) or "Missed call on <line>"; `hs_voicemail_count` is 1 for voicemails; `hs_call_duration` is 0 for missed calls.
- HubSpot shows a blank first row in every dropdown and a "Dependent properties" card for conditional options; both are platform behaviour.
- This folder lives on the iCloud-synced Desktop; `npm run dev` watches `src` only for that reason.

## Transcript source

HubSpot's public Transcripts API only returns transcripts to the app that uploaded them, and Aircall's app uploaded these, so `GET /crm/extensions/calling/2026-03/transcripts/{callId}` answers 401 "not owned by your app" for Aircall calls. The service therefore asks Aircall first (`GET https://api.aircall.io/v1/calls/{aircallCallId}/transcription`, Basic auth `AIRCALL_API_ID:AIRCALL_API_TOKEN`, needs Aircall AI Assist) and falls back to HubSpot, which only works for HubSpot-native calls. Without Aircall credentials the ticket still gets the voicemail link and HubSpot's AI summary, just no verbatim transcript. `npm run aircall:dump -- <aircall call id>` prints the raw Aircall response to confirm the field names; `parseAircallTranscript` in `src/aircallApi.js` accepts the common shapes but adjust it if the dump looks different.

Contacts: the app has no contacts scope, so caller names fall back to the phone number. Add `crm.objects.contacts.read` to the app and re-approve if names are wanted.

## Decision 2026-10-07: no verbatim transcript on tickets

Griffin chose to keep the full transcript and audio in Aircall and show a condensed version on the ticket: caller, line, time, duration, the Aircall voicemail link, and HubSpot's AI summary. So `AIRCALL_API_ID` / `AIRCALL_API_TOKEN` are intentionally not set on Render. The Aircall API code stays in place, disabled, in case that changes; setting the two variables turns transcripts on with no code change.
