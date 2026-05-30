import { router } from "../../index.js";
import { createProject } from "./createProject.js";
import { deleteProject } from "./deleteProject.js";
import { getProject } from "./getProject.js";
import { listProjects } from "./listProjects.js";
import { updateProject } from "./updateProject.js";
import { updateProjectStatus } from "./updateProjectStatus.js";

export const projectsRouter = router({
  create: createProject,
  get: getProject,
  list: listProjects,
  update: updateProject,
  updateStatus: updateProjectStatus,
  delete: deleteProject,
});
