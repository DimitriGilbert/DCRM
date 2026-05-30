import { router } from "../../index.js";
import { dashboardSummary } from "./summary.js";

export const dashboardRouter = router({
  summary: dashboardSummary,
});
