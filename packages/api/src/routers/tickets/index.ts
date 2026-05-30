import { router } from "../../index.js";
import { createTicket } from "./createTicket.js";
import { deleteTicket } from "./deleteTicket.js";
import { getTicket } from "./getTicket.js";
import { listTickets } from "./listTickets.js";
import { updateTicket } from "./updateTicket.js";
import { updateTicketStatus } from "./updateTicketStatus.js";

export const ticketsRouter = router({
  create: createTicket,
  get: getTicket,
  list: listTickets,
  update: updateTicket,
  updateStatus: updateTicketStatus,
  delete: deleteTicket,
});
