import { router } from "../../index";
import { listNotifications } from "./list";
import { markRead } from "./mark-read";
import { markAllRead } from "./mark-all-read";

export type { ListNotificationsInput, MarkReadInput, MarkAllReadInput } from "./schemas";

export const notificationRouter = router({
  list: listNotifications,
  markRead: markRead,
  markAllRead: markAllRead,
});
