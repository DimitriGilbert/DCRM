import { router } from "../../index";
import { createProject } from "./create";
import { readProject } from "./read";
import { updateProject } from "./update";
import { softDeleteProject } from "./soft-delete";
import { restoreProject } from "./restore";
import { listProjects } from "./list";
import { searchProjects } from "./search";

export const projectRouter = router({
  create: createProject,
  read: readProject,
  update: updateProject,
  softDelete: softDeleteProject,
  restore: restoreProject,
  list: listProjects,
  search: searchProjects,
});
