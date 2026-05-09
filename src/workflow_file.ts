import { parse } from "@std/yaml";
import { zip } from "@std/collections";
import type { FileContent } from "./github.ts";
import { type JobAst, type StepAst, WorkflowAst } from "./workflow_ast.ts";

export type Workflow = {
  name?: string;
  jobs: {
    [key: string]: Job;
  };
  [key: string]: unknown;
};

export class WorkflowModel {
  fileContent: FileContent;
  raw: Workflow;
  ast: WorkflowAst;
  htmlUrl?: string;

  constructor(fileContent: FileContent) {
    this.fileContent = fileContent;
    this.ast = new WorkflowAst(fileContent.content);
    this.htmlUrl = fileContent.raw.html_url ?? undefined;
    this.raw = parse(fileContent.content) as Workflow;
  }

  static createWorkflowNameMap(
    workflowModels: WorkflowModel[],
  ): Map<string, WorkflowModel> {
    return new Map(workflowModels.map((it) => [it.name, it]));
  }

  get name(): string {
    return this.raw.name ?? this.fileContent.raw.path;
  }

  get jobs(): JobModel[] {
    return zip(Object.entries(this.raw.jobs), this.ast.jobAsts()).map(
      ([[id, job], jobAst]) => new JobModel(id, job, this.fileContent, jobAst),
    );
  }
}

export type ReusableWorkflow = {
  name: string;
  on: {
    workflow_call: unknown;
  };
  jobs: Record<string, Job>;
};

export class ReusableWorkflowModel {
  fileContent: FileContent;
  raw: ReusableWorkflow;
  ast: WorkflowAst;

  constructor(fileContent: FileContent) {
    this.fileContent = fileContent;
    this.ast = new WorkflowAst(fileContent.content);
    this.raw = parse(fileContent.content) as ReusableWorkflow;
  }

  get jobs(): JobModel[] {
    return zip(Object.entries(this.raw.jobs), this.ast.jobAsts()).map(
      ([[id, job], jobAst]) => new JobModel(id, job, this.fileContent, jobAst),
    );
  }
}

export type Job = {
  name?: string;
  "runs-on": string;
  uses?: string;
  steps?: Step[];
  strategy?: {
    matrix?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export class JobModel {
  id: string;
  name?: string;
  fileContent: FileContent;
  raw: Job;
  ast: JobAst;
  htmlUrl?: string;

  constructor(
    id: string,
    obj: Job,
    fileContent: FileContent,
    ast: JobAst,
  ) {
    this.id = id;
    this.name = obj.name;
    this.raw = obj;
    this.ast = ast;
    this.fileContent = fileContent;
    this.htmlUrl = fileContent.raw.html_url ?? undefined;
  }

  get startLine(): number {
    return this.ast.startLine();
  }

  get htmlUrlWithLine(): string {
    return `${this.htmlUrl}#L${this.startLine}`;
  }

  get steps(): StepModel[] {
    const stepAsts = this.ast.stepAsts();
    if (this.raw.steps === undefined || stepAsts === undefined) return [];

    return zip(this.raw.steps, stepAsts).map(
      ([step, stepAst]) => new StepModel(step, this.fileContent, stepAst),
    );
  }

  static match(
    jobModels: JobModel[] | undefined,
    rawName: string,
  ): JobModel | undefined {
    if (jobModels === undefined) return undefined;

    for (const jobModel of jobModels) {
      if (jobModel.id === rawName) return jobModel;
      if (jobModel.name === rawName) return jobModel;

      if (jobModel.isMatrix()) {
        if (rawName.startsWith(jobModel.id)) return jobModel;

        if (jobModel.name === undefined) continue;
        const trimedName = jobModel.name.replace(/\$\{\{.+\}\}/g, "").trim();
        if (rawName.includes(trimedName)) return jobModel;
      }
    }

    return undefined;
  }

  isMatrix(): boolean {
    if (this.raw.strategy?.matrix !== undefined) return true;
    return false;
  }

  isReusable(): boolean {
    if (this.raw.uses?.startsWith("./")) return true;
    return false;
  }
}

export type CompositeAction = {
  name: string;
  description: string | undefined;
  runs: {
    using: "composite";
    steps: Step[];
  };
};

export class CompositeStepModel {
  fileContent: FileContent;
  raw: CompositeAction;
  ast: StepAst;

  constructor(fileContent: FileContent, fakeAst: StepAst) {
    this.fileContent = fileContent;
    this.raw = parse(fileContent.content) as CompositeAction;
    this.ast = fakeAst;
  }

  get steps(): StepModel[] {
    return this.raw.runs.steps.map((step) =>
      new StepModel(step, this.fileContent, this.ast)
    );
  }
}

export type Step = {
  uses?: string;
  name?: string;
  run?: string;
  with?: Record<string, unknown>;
  [key: string]: unknown;
};

export class StepModel {
  raw: Step;
  name: string;
  uses?: {
    action: string;
    ref?: string;
  };
  ast: StepAst;
  htmlUrl?: string;

  constructor(
    obj: Step,
    fileContent: FileContent,
    ast: StepAst,
  ) {
    this.raw = obj;
    this.uses = obj.uses
      ? { action: obj.uses.split("@")[0], ref: obj.uses.split("@")[1] }
      : undefined;
    this.name = obj.name ?? obj.run ?? this.uses?.action ?? "";
    this.ast = ast;
    this.htmlUrl = fileContent.raw.html_url ?? undefined;
  }

  get startLine(): number {
    return this.ast.startLine();
  }

  get htmlUrlWithLine(): string {
    return `${this.htmlUrl}#L${this.startLine}`;
  }

  get showable(): string {
    return this.raw.name ?? this.raw.uses ?? this.raw.run ??
      "Error: Not showable step";
  }

  static match(
    stepModels: StepModel[] | undefined,
    rawName: string,
  ): StepModel | undefined {
    if (stepModels === undefined) return undefined;
    if (rawName === "Set up job" || rawName === "Complete job") {
      return undefined;
    }

    const name = rawName.replace(/^(Pre Run |Post Run |Pre |Run |Post )/, "");
    // Normalize: GitHub API sometimes adds extra "/" before "./" for local actions
    const normalizedName = name.replace(/^\/\.\//, "./");
    const action = normalizedName.split("@")[0];
    for (const stepModel of stepModels) {
      if (stepModel.name === name || stepModel.name === normalizedName) {
        return stepModel;
      }
      if (stepModel.uses?.action === action) return stepModel;
    }
    return undefined;
  }

  isComposite(): boolean {
    if (this.raw.uses === "./") return false;
    if (this.raw.uses?.startsWith("./")) return true;
    return false;
  }
}
