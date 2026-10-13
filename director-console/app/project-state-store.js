import { cloneProject } from "./project-model.js";

// Current authoring baseline. Undo/redo belongs to UIOperationHistory.
export class ProjectStateStore {
  constructor(project) {
    this.reset(project);
  }

  reset(project) {
    return this.replace(project);
  }

  commit(project) {
    return this.replace(project);
  }

  replace(project) {
    this.current = cloneProject(project);
    return this.current;
  }
}
