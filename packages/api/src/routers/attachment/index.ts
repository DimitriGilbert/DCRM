import { router } from "../../index";
import { uploadAttachment } from "./upload";
import { listAttachments } from "./list";
import { readAttachment } from "./read";
import { deleteAttachment } from "./delete";
import { downloadAttachment } from "./download";

export const attachmentRouter = router({
  upload: uploadAttachment,
  list: listAttachments,
  read: readAttachment,
  delete: deleteAttachment,
  download: downloadAttachment,
});
