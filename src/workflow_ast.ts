import {
  safeLoad,
  type YamlMap,
  type YAMLMapping,
  type YAMLSequence,
} from "yaml-ast-parser";
import { StructuredSource } from "structured-source";

export class WorkflowAst {
  private readonly ast: YamlMap;
  private readonly src: StructuredSource;

  constructor(yaml: string) {
    this.ast = safeLoad(yaml) as YamlMap;
    this.src = new StructuredSource(yaml);
  }

  jobAsts(): JobAst[] {
    const jobsMap = this.ast.mappings.find((it) => it.key.value === "jobs")
      ?.value as YamlMap;
    return jobsMap.mappings.map((it) => new JobAst(it, this.src));
  }
}

export class JobAst {
  private readonly ast: YAMLMapping;
  private readonly src: StructuredSource;

  constructor(ast: YAMLMapping, src: StructuredSource) {
    this.ast = ast;
    this.src = src;
  }

  stepAsts(): StepAst[] | undefined {
    const jobMap = this.ast.value as YamlMap;
    const stepsSeq = jobMap.mappings.find((it) => it.key.value === "steps")
      ?.value as YAMLSequence | undefined;
    if (stepsSeq === undefined) return undefined;

    return stepsSeq.items.map((it) => new StepAst(it as YAMLMapping, this.src));
  }

  startLine(): number {
    const pos = this.src.indexToPosition(this.ast.startPosition);
    return pos.line;
  }
}

export class StepAst {
  private readonly ast: YAMLMapping;
  private readonly src: StructuredSource;

  constructor(ast: YAMLMapping, src: StructuredSource) {
    this.ast = ast;
    this.src = src;
  }

  startLine(): number {
    const pos = this.src.indexToPosition(this.ast.startPosition);
    return pos.line;
  }
}
