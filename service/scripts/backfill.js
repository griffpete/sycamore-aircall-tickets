import { enrichAircallTicket, findAircallTickets } from "../src/aircallEnrich.js";

const onlyIds = process.argv.slice(2).filter((arg) => /^\d+$/.test(arg));

async function main() {
  const ticketIds = onlyIds.length > 0 ? onlyIds : await findAircallTickets();
  console.log(`Enriching ${ticketIds.length} Aircall ticket(s)`);

  for (const ticketId of ticketIds) {
    const result = await enrichAircallTicket(ticketId);
    console.log(result.skipped ? `${ticketId}: skipped (${result.skipped})` : `${ticketId}: ${result.type} - ${result.subject}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
