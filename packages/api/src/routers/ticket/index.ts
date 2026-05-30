import { router } from "../../index";
import { createTicket } from "./create";
import { readTicket } from "./read";
import { updateTicket } from "./update";
import { softDeleteTicket } from "./soft-delete";
import { restoreTicket } from "./restore";
import { listTickets } from "./list";
import { searchTickets } from "./search";
import { upcomingTicketDeadlines } from "./upcoming-deadlines";

export const ticketRouter = router({
  create: createTicket,
  read: readTicket,
  update: updateTicket,
  softDelete: softDeleteTicket,
  restore: restoreTicket,
  list: listTickets,
  search: searchTickets,
  upcomingDeadlines: upcomingTicketDeadlines,
});
