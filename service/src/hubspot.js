import { config } from "./config.js";
import { requestJson } from "./http.js";

const HUBSPOT_API = "https://api.hubapi.com";

export function hubspotRequest(method, path, body) {
  return requestJson(
    `${HUBSPOT_API}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${config.hubspotAccessToken}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    },
    `HubSpot ${method} ${path}`
  );
}

export async function hubspotGetOrNull(path) {
  try {
    return await hubspotRequest("GET", path);
  } catch (error) {
    if (error.status === 404) {
      return null;
    }

    throw error;
  }
}

export function getTicketProperties(ticketId, propertyNames) {
  return hubspotRequest(
    "GET",
    `/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}?properties=${propertyNames.join(",")}`
  );
}

export function updateTicketProperties(ticketId, properties) {
  return hubspotRequest("PATCH", `/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}`, { properties });
}
