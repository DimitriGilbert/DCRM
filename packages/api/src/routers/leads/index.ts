import { router } from "../../index.js";
import { convertLead } from "./convertLead.js";
import { createLead } from "./createLead.js";
import { deleteLead } from "./deleteLead.js";
import { getLead } from "./getLead.js";
import { listLeadPipeline } from "./listLeadPipeline.js";
import { listLeads } from "./listLeads.js";
import { updateLead } from "./updateLead.js";
import { updateLeadStage } from "./updateLeadStage.js";

export const leadsRouter = router({
  create: createLead,
  get: getLead,
  list: listLeads,
  pipeline: listLeadPipeline,
  update: updateLead,
  updateStage: updateLeadStage,
  delete: deleteLead,
  convert: convertLead,
});
