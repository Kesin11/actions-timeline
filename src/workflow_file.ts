import { parse } from "@std/yaml";
import type { FileContent } from "./github.ts";

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

  constructor(fileContent: FileContent) {
    this.fileContent = fileContent;
    const parsed = parse(fileContent.content);
    if (parsed === null || typeof parsed !== "object") {
      throw new Error(
        `Failed to parse workflow file: ${fileContent.raw.path}`,
      );
    }
    this.raw = parsed as Workflow;
  }

  get name(): string {
    return this.raw.name ?? this.fileContent.raw.path;
  }

  get jobs(): JobModel[] {
    if (!this.raw.jobs) return [];
    return Object.entries(this.raw.jobs).map(
      ([id, job]) => new JobModel(id, job),
    );
  }
}

export type Job = {
  name?: string;
  "runs-on"?: string | string[];
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
  raw: Job;

  constructor(id: string, obj: Job) {
    this.id = id;
    this.name = obj.name;
    this.raw = obj;
  }

  get steps(): StepModel[] {
    return (this.raw.steps ?? []).map((step) => new StepModel(step));
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
        const trimmedName = jobModel.name.replace(/\$\{\{.+\}\}/g, "").trim();
        if (rawName.includes(trimmedName)) return jobModel;
      }
    }

    return undefined;
  }

  isMatrix(): boolean {
    return this.raw.strategy?.matrix !== undefined;
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

  constructor(obj: Step) {
    this.raw = obj;
    this.uses = obj.uses
      ? { action: obj.uses.split("@")[0], ref: obj.uses.split("@")[1] }
      : undefined;
    this.name = obj.name ?? obj.run ?? this.uses?.action ?? "";
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
    return this.raw.uses?.startsWith("./") ?? false;
  }
}
