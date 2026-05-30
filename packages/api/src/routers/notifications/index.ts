import { router } from "../../index.js";
import { createNotification } from "./createNotification.js";
import { listNotifications } from "./listNotifications.js";
import { markNotificationRead } from "./markNotificationRead.js";

export const notificationsRouter = router({
  create: createNotification,
  list: listNotifications,
  markRead: markNotificationRead,
});
