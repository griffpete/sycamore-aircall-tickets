import { hubspotGetOrNull, hubspotRequest } from "../src/hubspot.js";
import { AIRCALL_PROPERTIES, AIRCALL_PROPERTY_GROUP } from "../src/aircallSchema.js";

async function ensurePropertyGroup(group) {
  const existing = await hubspotGetOrNull(`/crm/v3/properties/tickets/groups/${group.name}`);

  if (existing) {
    console.log(`Property group "${group.label}" already exists`);
    return;
  }

  await hubspotRequest("POST", "/crm/v3/properties/tickets/groups", group);
  console.log(`Created property group "${group.label}"`);
}

async function ensureProperty(group, definition) {
  const existing = await hubspotGetOrNull(`/crm/v3/properties/tickets/${definition.name}`);

  if (existing) {
    console.log(`Property "${definition.name}" already exists`);
    return;
  }

  await hubspotRequest("POST", "/crm/v3/properties/tickets", { groupName: group.name, ...definition });
  console.log(`Created property "${definition.name}"`);
}

async function main() {
  await ensurePropertyGroup(AIRCALL_PROPERTY_GROUP);

  for (const property of AIRCALL_PROPERTIES) {
    await ensureProperty(AIRCALL_PROPERTY_GROUP, property);
  }

  console.log("HubSpot setup complete");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
