import { router } from "../../index";
import { createExchange } from "./create";
import { readExchange } from "./read";
import { listExchanges } from "./list";
import { timeline } from "./timeline";
import { sendExchangeEmail } from "./send-email";

export const exchangeRouter = router({
  create: createExchange,
  read: readExchange,
  list: listExchanges,
  timeline: timeline,
  sendEmail: sendExchangeEmail,
});
