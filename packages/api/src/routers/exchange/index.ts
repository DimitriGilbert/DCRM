import { router } from "../../index";
import { createExchange } from "./create";
import { readExchange } from "./read";
import { listExchanges } from "./list";
import { timeline } from "./timeline";

export const exchangeRouter = router({
  create: createExchange,
  read: readExchange,
  list: listExchanges,
  timeline: timeline,
});
