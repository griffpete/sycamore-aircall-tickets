import { existsSync } from "node:fs";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const requiredVariables = ["PUBLIC_BASE_URL", "HUBSPOT_CLIENT_SECRET", "HUBSPOT_ACCESS_TOKEN", "HUBSPOT_PORTAL_ID"];

const missingVariables = requiredVariables.filter((name) => !process.env[name]);

if (missingVariables.length > 0) {
  throw new Error(`Missing environment variables: ${missingVariables.join(", ")}`);
}

export const config = {
  port: Number(process.env.PORT ?? 3100),
  publicBaseUrl: process.env.PUBLIC_BASE_URL.replace(/\/$/, ""),
  hubspotClientSecret: process.env.HUBSPOT_CLIENT_SECRET,
  hubspotAccessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  hubspotPortalId: process.env.HUBSPOT_PORTAL_ID,
  aircallApiId: process.env.AIRCALL_API_ID ?? "",
  aircallApiToken: process.env.AIRCALL_API_TOKEN ?? ""
};
