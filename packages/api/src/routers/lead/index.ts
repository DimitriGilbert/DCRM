import { router } from "../../index";
import { createLead } from "./create";
import { readLead } from "./read";
import { updateLead } from "./update";
import { softDeleteLead } from "./soft-delete";
import { restoreLead } from "./restore";
import { listLeads } from "./list";
import { updateLeadStage } from "./update-stage";
import { convertLead } from "./convert";
import { searchLeads } from "./search";

export const leadRouter = router({
  create: createLead,
  read: readLead,
  update: updateLead,
  softDelete: softDeleteLead,
  restore: restoreLead,
  list: listLeads,
  updateStage: updateLeadStage,
  convert: convertLead,
  search: searchLeads,
});
