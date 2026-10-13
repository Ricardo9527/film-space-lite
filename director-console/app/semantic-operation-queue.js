import {
  applySemanticProjectPatch,
  invertSemanticPatch,
  semanticPatchBetween,
  semanticPatchConflicts,
} from "./semantic-project-patch.js";

export class SemanticOperationQueue {
  constructor({
    projectAPI,
    project,
    resolveConflict = async () => "external",
    onProject = () => {},
    onState = () => {},
    onError = () => {},
  }) {
    if (!projectAPI?.applyOperations || !projectAPI?.load) {
      throw new Error("SemanticOperationQueue requires a ProjectAPI-compatible client");
    }
    this.projectAPI = projectAPI;
    this.persistedProject = structuredClone(project);
    this.resolveConflict = resolveConflict;
    this.onProject = onProject;
    this.onState = onState;
    this.onError = onError;
    this.pending = [];
    this.drainPromise = null;
    this.lastDrainSucceeded = true;
  }

  get active() {
    return this.pending.length > 0 || this.drainPromise !== null;
  }

  reset(project) {
    if (this.active) throw new Error("Cannot reset an active semantic operation queue");
    this.persistedProject = structuredClone(project);
    this.lastDrainSucceeded = true;
  }

  projectedProject() {
    return this.pending.reduce(
      (current, transaction) => applySemanticProjectPatch(current, transaction.changes),
      structuredClone(this.persistedProject),
    );
  }

  enqueue({
    baseProject,
    nextProject,
    changes = semanticPatchBetween(baseProject, nextProject),
    inverse = invertSemanticPatch(baseProject, nextProject),
    conflictBaseProject = null,
    label = "项目操作",
  }) {
    if (!changes.length) return Promise.resolve({ changed: false, project: this.projectedProject() });
    let resolveTransaction;
    const promise = new Promise((resolve) => {
      resolveTransaction = resolve;
    });
    this.pending.push({
      baseProject: structuredClone(baseProject),
      changes: structuredClone(changes),
      inverse: structuredClone(inverse),
      conflictBaseProject: conflictBaseProject ? structuredClone(conflictBaseProject) : null,
      label,
      resolve: resolveTransaction,
    });
    this.lastDrainSucceeded = true;
    this.onState({ state: "saving", pending: this.pending.length });
    this.#ensureDrain();
    return promise;
  }

  async flush() {
    while (this.drainPromise) await this.drainPromise;
    return !this.active && this.lastDrainSucceeded;
  }

  acceptExternal(project) {
    if (this.active) return false;
    if (
      project?.id !== this.persistedProject.id
      || Number(project.revision) <= Number(this.persistedProject.revision)
    ) {
      return false;
    }
    this.persistedProject = structuredClone(project);
    this.onProject(this.projectedProject(), { reason: "external" });
    return true;
  }

  #ensureDrain() {
    if (this.drainPromise) return;
    this.drainPromise = this.#drain().finally(() => {
      this.drainPromise = null;
      if (this.pending.length) this.#ensureDrain();
    });
  }

  async #drain() {
    let failed = false;
    while (this.pending.length) {
      const transaction = this.pending[0];
      let result;
      let submissionError;
      try {
        result = await this.#submitTransaction(transaction);
      } catch (error) {
        submissionError = error;
      }
      this.pending.shift();
      const rebased = this.#rebasePending();
      if (submissionError) {
        result = { changed: false, failed: true, error: submissionError, project: rebased.project };
      }
      transaction.resolve(result);
      for (const rejected of rebased.rejected) {
        rejected.transaction.resolve({ changed: false, failed: true, error: rejected.error, project: rebased.project });
      }
      failed ||= Boolean(submissionError) || rebased.rejected.length > 0;
      if (submissionError) this.onError(submissionError, transaction);
      for (const rejected of rebased.rejected) this.onError(rejected.error, rejected.transaction);
      this.onProject(rebased.project, {
        reason: submissionError ? "failed" : result.dropped ? "conflict-external" : "saved",
        transaction,
        result,
        ...(submissionError ? { error: submissionError } : {}),
      });
    }
    this.lastDrainSucceeded = !failed;
    this.onState({ state: failed ? "error" : "saved", pending: 0 });
  }

  #rebasePending() {
    let project = structuredClone(this.persistedProject);
    const retained = [];
    const rejected = [];
    for (const transaction of this.pending) {
      try {
        project = applySemanticProjectPatch(project, transaction.changes);
        retained.push(transaction);
      } catch (error) {
        rejected.push({ transaction, error });
      }
    }
    this.pending = retained;
    return { project, rejected };
  }

  async #submitTransaction(transaction) {
    let expectedProject = this.persistedProject;
    const preflightBase = transaction.conflictBaseProject;
    if (preflightBase) {
      const conflicts = semanticPatchConflicts({
        baseProject: preflightBase,
        remoteProject: expectedProject,
        changes: transaction.changes,
      });
      const disposition = await this.#resolve(conflicts, transaction, expectedProject);
      if (disposition === "external") {
        return { changed: false, dropped: true, project: structuredClone(expectedProject) };
      }
    }

    while (true) {
      try {
        const response = await this.projectAPI.applyOperations(
          expectedProject.id,
          Number(expectedProject.revision || 0),
          [{ action: "patch_project_fields", changes: transaction.changes }],
          this.projectAPI.sourceID,
        );
        this.persistedProject = structuredClone(response.project);
        return {
          changed: true,
          project: structuredClone(response.project),
          results: response.results || [],
        };
      } catch (error) {
        if (error?.status !== 409) throw error;
        const latest = await this.projectAPI.load(expectedProject.id);
        const conflicts = semanticPatchConflicts({
          baseProject: expectedProject,
          remoteProject: latest,
          changes: transaction.changes,
        });
        const disposition = await this.#resolve(conflicts, transaction, latest);
        this.persistedProject = structuredClone(latest);
        if (disposition === "external") {
          return { changed: false, dropped: true, project: structuredClone(latest) };
        }
        expectedProject = latest;
      }
    }
  }

  async #resolve(conflicts, transaction, latest) {
    if (!conflicts.length) return "ui";
    const decision = await this.resolveConflict({
      conflicts,
      transaction,
      latest: structuredClone(latest),
    });
    return decision === "ui" ? "ui" : "external";
  }
}
