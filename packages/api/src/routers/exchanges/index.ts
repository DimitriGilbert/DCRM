import { router } from "../../index.js";
import { addTicketComment } from "./addTicketComment.js";
import { createExchange } from "./createExchange.js";
import { deleteExchange } from "./deleteExchange.js";
import { getExchange } from "./getExchange.js";
import { listTimeline } from "./listTimeline.js";
import { updateExchange } from "./updateExchange.js";

export const exchangesRouter = router({
  create: createExchange,
  addTicketComment,
  get: getExchange,
  timeline: listTimeline,
  update: updateExchange,
  delete: deleteExchange,
});
