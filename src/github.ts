import { decodeBase64 } from "@std/encoding";
import { chunk } from "@std/collections";
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

export type NonFileContentResponse = {
  type: "symlink" | "submodule";
  [key: string]: unknown;
};

export type DirectoryContentEntry = {
  type: "file" | "dir" | "symlink" | "submodule";
  [key: string]: unknown;
};

export type GetContentResponseData =
  | FileContentResponse
  | NonFileContentResponse
  | DirectoryContentEntry[];

export type GithubOctokit = {
  repos: {
    getContent: (params: {
      owner: string;
      repo: string;
      path: string;
      ref?: string;
    }) => Promise<{
      data: GetContentResponseData;
    }>;
  };
  actions: {
    downloadJobLogsForWorkflowRun: (params: {
      owner: string;
      repo: string;
      job_id: number;
    }) => Promise<{ data: string }>;
  };
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

export type WorkflowRunUsage = {
  [key: string]: unknown;
};

export type ActionsCacheUsage = {
  full_name?: string;
  [key: string]: unknown;
};

export type ActionsCacheList = {
  actions_caches: Array<{
    [key: string]: unknown;
  }>;
  total_count: number;
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

  get octokit(): GithubOctokit {
    return this.octokitClient as GithubOctokit;
  }

  constructor(
    options?: {
      token?: string;
      host?: string;
      debug?: boolean;
      _workaroundDenoTest?: boolean;
    },
  ) {
    this.baseUrl = Github.getBaseUrl(options?.host);
    this.isGHES = this.baseUrl !== "https://api.github.com";
    this.token = options?.token ?? Deno.env.get("GITHUB_TOKEN") ?? undefined;
    const MyOctokit = (options?._workaroundDenoTest)
      // Adding throttling causes "Leaks" error when running `deno test`
      ? Octokit.plugin(retry)
      : Octokit.plugin(throttling, retry);
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

  async fetchRepository(
    owner: string,
    repo: string,
  ): Promise<RepositoryResponse> {
    const res = await this.octokitClient.repos.get({ owner, repo });
    return res.data as RepositoryResponse;
  }

  async fetchWorkflowRunUsages(
    workflowRuns: WorkflowRun[],
    chunkSize = 20,
  ): Promise<WorkflowRunUsage[] | undefined> {
    if (this.isGHES) return undefined;

    const workflowRunsChunks = chunk(workflowRuns, chunkSize);
    const workflowRunsUsages: WorkflowRunUsage[] = [];

    for (const chunk of workflowRunsChunks) {
      const promises = chunk.map((run) => {
        return this.octokitClient.actions.getWorkflowRunUsage({
          owner: run.repository.owner.login,
          repo: run.repository.name,
          run_id: run.id,
        });
      });
      const chunkResults = (await Promise.all(promises)).map((res) =>
        res.data as WorkflowRunUsage
      );
      workflowRunsUsages.push(...chunkResults);
    }
    return workflowRunsUsages;
  }

  async fetchWorkflowJobs(
    workflowRuns: WorkflowRun[],
    chunkSize = 20,
  ): Promise<WorkflowJobs> {
    const workflowJobs: WorkflowJobs = [];
    const workflowJobsChunks = chunk(workflowRuns, chunkSize);

    for (const chunk of workflowJobsChunks) {
      const promises = chunk.map((run) => {
        return this.octokitClient.actions.listJobsForWorkflowRunAttempt({
          owner: run.repository.owner.login,
          repo: run.repository.name,
          run_id: run.id,
          attempt_number: run.run_attempt ?? 1,
          per_page: 100,
        });
      });
      const chunkResults = (await Promise.all(promises)).map((res) =>
        res.data.jobs as WorkflowJobs
      );
      workflowJobs.push(...chunkResults.flat());
    }
    return workflowJobs;
  }

  async fetchWorkflowRunJobs(
    workflowRun: WorkflowRun,
  ): Promise<WorkflowJobs> {
    const workflowJobs = await this.octokitClient.actions
      .listJobsForWorkflowRunAttempt({
        owner: workflowRun.repository.owner.login,
        repo: workflowRun.repository.name,
        run_id: workflowRun.id,
        attempt_number: workflowRun.run_attempt ?? 1,
        per_page: 100,
      });
    return workflowJobs.data.jobs as WorkflowJobs;
  }

  async fetchWorkflowRuns(
    owner: string,
    repo: string,
    branch?: string,
  ): Promise<WorkflowRun[]> {
    const res = await this.octokitClient.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      per_page: 100,
      branch,
    });
    return res.data.workflow_runs.filter((run) =>
      run.event !== "dynamic"
    ) as WorkflowRun[];
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

  async fetchWorkflowRunsWithCreated(
    owner: string,
    repo: string,
    created: string,
    branch?: string,
  ): Promise<WorkflowRun[]> {
    const workflowRuns = await this.octokitClient.paginate(
      this.octokitClient.actions.listWorkflowRunsForRepo,
      {
        owner,
        repo,
        created,
        per_page: 100,
        branch,
      },
    );
    return workflowRuns.filter((run) =>
      run.event !== "dynamic"
    ) as WorkflowRun[];
  }

  async fetchActionsCacheUsage(
    owner: string,
    repo: string,
  ): Promise<ActionsCacheUsage> {
    const res = await this.octokitClient.actions.getActionsCacheUsage({
      owner,
      repo,
    });
    return res.data as ActionsCacheUsage;
  }

  async fetchActionsCacheList(
    owner: string,
    repo: string,
    perPage = 100,
  ): Promise<ActionsCacheList> {
    const res = await this.octokitClient.actions.getActionsCacheList({
      owner,
      repo,
      sort: "size_in_bytes",
      per_page: perPage,
    });
    return res.data as ActionsCacheList;
  }

  async fetchWorkflowFiles(
    workflowRuns: WorkflowRun[],
  ): Promise<(FileContent | undefined)[]> {
    const promises = workflowRuns.map((workflowRun) => {
      return this.fetchContent({
        owner: workflowRun.repository.owner.login,
        repo: workflowRun.repository.name,
        path: workflowRun.path,
        ref: workflowRun.head_sha,
      });
    });
    return await Promise.all(promises);
  }

  async fetchWorkflowFilesByRef(
    workflowRuns: WorkflowRun[],
    ref: string,
    chunkSize = 20,
  ): Promise<(FileContent | undefined)[]> {
    const workflowRunsChunks = chunk(workflowRuns, chunkSize);

    const results = [];
    for (const chunk of workflowRunsChunks) {
      const chunkResults = await Promise.all(chunk.map((workflowRun) => {
        return this.fetchContent({
          owner: workflowRun.repository.owner.login,
          repo: workflowRun.repository.name,
          path: workflowRun.path,
          ref,
        });
      }));
      results.push(...chunkResults);
    }
    return results;
  }

  // deno-lint-ignore require-await
  async fetchContent(params: {
    owner: string;
    repo: string;
    path: string;
    ref: string;
  }): Promise<(FileContent | undefined)> {
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
