import { router } from "../../index";

import { sendAIMessage } from "./send-message";
import { listAIMessages } from "./list-messages";
import { clearAIHistory } from "./clear-history";

export const aiChatRouter = router({
  sendMessage: sendAIMessage,
  listMessages: listAIMessages,
  clearHistory: clearAIHistory,
});
