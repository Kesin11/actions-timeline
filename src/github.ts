import { decodeBase64 } from "@std/encoding";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";

export type FileContentResponse = {
  type: "file";
  size: number;
  name: string;
  path: string;
  content: string;
  sha: string;
  url: string;
  git_url: string | null;
  html_url: string | null;
  download_url: string | null;
};

export type RepositoryResponse = {
  name: string;
  owner: {
    login: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type WorkflowJobStep = {
  name: string;
  number: number;
  status: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string;
  [key: string]: unknown;
};

export type WorkflowJob = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string | null;
  created_at?: string;
  steps?: WorkflowJobStep[];
  [key: string]: unknown;
};

export type WorkflowJobs = WorkflowJob[];

export type WorkflowRun = {
  event: string;
  head_sha: string;
  id: number;
  name?: string | null;
  path: string;
  repository: RepositoryResponse;
  run_attempt?: number;
  run_started_at: string;
  [key: string]: unknown;
};

export class FileContent {
  raw: FileContentResponse;
  content: string;

  constructor(getContentResponse: FileContentResponse) {
    this.raw = getContentResponse;
    const textDecoder = new TextDecoder();
    // GitHub API returns base64 with newlines (RFC 2045), strip them before decoding
    const base64 = getContentResponse.content.replace(/[\r\n]/g, "");
    this.content = textDecoder.decode(decodeBase64(base64));
  }
}

export type WorkflowRunUrl = {
  origin: string;
  owner: string;
  repo: string;
  runId: number;
  runAttempt?: number;
};

export function parseWorkflowRunUrl(runUrl: string): WorkflowRunUrl {
  const url = new URL(runUrl);
  const path = url.pathname.split("/");
  const owner = path[1];
  const repo = path[2];
  const runId = Number(path[5]);
  const runAttempt = path[6] === "attempts" ? Number(path[7]) : undefined;
  return {
    origin: url.origin,
    owner,
    repo,
    runId,
    runAttempt,
  };
}

type ThrottleRequestOptions = {
  method: string;
  url: string;
};

export class Github {
  private readonly octokitClient: Octokit;
  token?: string;
  baseUrl: string;
  isGHES: boolean;
  contentCache: Map<string, FileContent> = new Map();

  get octokit(): Octokit {
    return this.octokitClient;
  }

  constructor(options?: { token?: string; host?: string; debug?: boolean }) {
    this.baseUrl = Github.getBaseUrl(options?.host);
    this.isGHES = this.baseUrl !== "https://api.github.com";
    this.token = options?.token ?? Deno.env.get("GITHUB_TOKEN") ?? undefined;
    const MyOctokit = Octokit.plugin(throttling, retry);
    this.octokitClient = new MyOctokit({
      auth: this.token,
      baseUrl: this.baseUrl,
      log: options?.debug ? console : undefined,
      throttle: {
        onRateLimit: (
          retryAfter: number,
          options: ThrottleRequestOptions,
          _octokit: unknown,
          retryCount: number,
        ) => {
          this.octokitClient.log.warn(
            `Request quota exhausted for request ${options.method} ${options.url}`,
          );
          if (retryCount <= 2) {
            console.warn(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onSecondaryRateLimit: (
          _retryAfter: number,
          options: ThrottleRequestOptions,
          _octokit: unknown,
          _retryCount: number,
        ) => {
          console.warn(
            `Abuse detected for request ${options.method} ${options.url}`,
          );
        },
      },
    });
  }

  private static getBaseUrl(host?: string): string {
    if (host) {
      return host.startsWith("https://")
        ? `${host}/api/v3`
        : `https://${host}/api/v3`;
    } else if (Deno.env.get("GITHUB_API_URL")) {
      return Deno.env.get("GITHUB_API_URL")!;
    } else {
      return "https://api.github.com";
    }
  }

  async fetchWorkflowRunJobs(workflowRun: WorkflowRun): Promise<WorkflowJobs> {
    const res = await this.octokitClient.actions
      .listJobsForWorkflowRunAttempt({
        owner: workflowRun.repository.owner.login,
        repo: workflowRun.repository.name,
        run_id: workflowRun.id,
        attempt_number: workflowRun.run_attempt ?? 1,
        per_page: 100,
      });
    return res.data.jobs as WorkflowJobs;
  }

  async fetchWorkflowRun(
    owner: string,
    repo: string,
    runId: number,
    runAttempt?: number,
  ): Promise<WorkflowRun> {
    if (runAttempt) {
      const res = await this.octokitClient.actions.getWorkflowRunAttempt({
        owner,
        repo,
        run_id: runId,
        attempt_number: runAttempt,
      });
      return res.data as WorkflowRun;
    } else {
      const res = await this.octokitClient.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });
      return res.data as WorkflowRun;
    }
  }

  fetchWorkflowFiles(
    workflowRuns: WorkflowRun[],
  ): Promise<(FileContent | undefined)[]> {
    return Promise.all(workflowRuns.map((workflowRun) =>
      this.fetchContent({
        owner: workflowRun.repository.owner.login,
        repo: workflowRun.repository.name,
        path: workflowRun.path,
        ref: workflowRun.head_sha,
      })
    ));
  }

  // deno-lint-ignore require-await
  async fetchContent(params: {
    owner: string;
    repo: string;
    path: string;
    ref: string;
  }): Promise<FileContent | undefined> {
    const cache = this.contentCache.get(JSON.stringify(params));
    if (cache) return cache;

    return this.octokitClient.repos.getContent({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      ref: params.ref,
    })
      .then((res) => {
        if (!Array.isArray(res.data) && res.data.type === "file") {
          const fetchedFileContent = new FileContent(
            res.data as FileContentResponse,
          );
          this.contentCache.set(JSON.stringify(params), fetchedFileContent);
          return fetchedFileContent;
        }
      })
      .catch((error) => {
        console.warn(
          `fetchContent failed: ref: ${params.ref}, path: ${params.owner}/${params.repo}/${params.path}`,
          error,
        );
        return undefined;
      });
  }
}
