import express from "express";
import { config } from "./config.js";
import { WEBHOOK_PATH, handleHubSpotWebhook, verifyWebhookRequest } from "./webhooks.js";

const app = express();

app.use(
  express.json({
    verify: (req, res, buffer) => {
      req.rawBody = buffer.toString("utf8");
    }
  })
);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    publicBaseUrl: config.publicBaseUrl,
    hasClientSecret: Boolean(config.hubspotClientSecret),
    hasAccessToken: Boolean(config.hubspotAccessToken),
    portalId: config.hubspotPortalId
  });
});

app.post(WEBHOOK_PATH, verifyWebhookRequest, handleHubSpotWebhook);

app.use((error, req, res, next) => {
  console.error(error.message);
  res.status(500).json({ error: "Something went wrong. Check the service logs." });
});

app.listen(config.port, () => {
  console.log(`Aircall ticket enricher listening on port ${config.port}`);
});
