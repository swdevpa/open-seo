import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { isCrawlableUrl } from "@/server/lib/audit/url-policy";
import { AppError } from "@/server/lib/errors";

// api.indexnow.org forwards every submission to all participating search
// engines (Bing, Yandex, Seznam, Naver, Yep, ...), so one request is enough.
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
// Protocol limit per request. Callers cap input at this size, so one request
// per host always fits.
export const INDEXNOW_MAX_URLS = 10_000;
const FETCH_TIMEOUT_MS = 10_000;
const KEY_FILE_REDIRECT_HOPS = 3;

type IndexNowHostResult = {
  host: string;
  urlCount: number;
  ok: boolean;
  status: number | null;
  message: string;
};

type IndexNowSubmission = {
  submittedCount: number;
  // URLs outside the project's domain. IndexNow rejects the whole request when
  // any URL does not belong to the submitted host, so these are dropped.
  rejectedUrls: string[];
  results: IndexNowHostResult[];
};

type ProjectRow = NonNullable<
  Awaited<ReturnType<typeof ProjectRepository.getProjectForOrganization>>
>;

async function getProject(organizationId: string, projectId: string) {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    organizationId,
  );
  if (!project) throw new AppError("NOT_FOUND");
  return project;
}

function requireIndexNowSetup(project: ProjectRow) {
  if (!project.domain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Set a project domain before submitting URLs to IndexNow.",
    );
  }
  if (!project.indexNowKey) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enable IndexNow in project settings before submitting URLs.",
    );
  }
  return { domain: project.domain, key: project.indexNowKey };
}

// 32 hex characters: inside the protocol's 8-128 [a-zA-Z0-9-] range.
function generateKey() {
  return crypto.randomUUID().replaceAll("-", "");
}

async function enableKey(organizationId: string, projectId: string) {
  const project = await getProject(organizationId, projectId);
  if (project.indexNowKey) return project.indexNowKey;
  const row = await ProjectRepository.updateProjectIndexNowKey(
    projectId,
    organizationId,
    generateKey(),
  );
  return row.indexNowKey;
}

async function regenerateKey(organizationId: string, projectId: string) {
  const row = await ProjectRepository.updateProjectIndexNowKey(
    projectId,
    organizationId,
    generateKey(),
  );
  return row.indexNowKey;
}

function belongsToDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

function groupUrlsByHost(domain: string, urls: string[]) {
  const byHost = new Map<string, Set<string>>();
  const rejectedUrls: string[] = [];
  for (const raw of urls) {
    let parsed: URL;
    try {
      parsed = new URL(raw.trim());
    } catch {
      rejectedUrls.push(raw);
      continue;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      !belongsToDomain(host, domain)
    ) {
      rejectedUrls.push(raw);
      continue;
    }
    parsed.hash = "";
    const hostUrls = byHost.get(host) ?? new Set<string>();
    hostUrls.add(parsed.toString());
    byHost.set(host, hostUrls);
  }
  return { byHost, rejectedUrls };
}

function describeStatus(status: number) {
  switch (status) {
    case 200:
      return "Submitted.";
    case 202:
      return "Accepted. Search engines are still validating the key file.";
    case 400:
      return "IndexNow rejected the request as malformed.";
    case 403:
      return "Key not valid: the key file is missing or its content does not match.";
    case 422:
      return "The URLs do not belong to this host, or the key file does not match.";
    case 429:
      return "Too many requests. Try again later.";
    default:
      return `IndexNow returned HTTP ${status}.`;
  }
}

async function submitHost(
  host: string,
  key: string,
  urlList: string[],
): Promise<IndexNowHostResult> {
  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return {
      host,
      urlCount: urlList.length,
      ok: response.status === 200 || response.status === 202,
      status: response.status,
      message: describeStatus(response.status),
    };
  } catch {
    return {
      host,
      urlCount: urlList.length,
      ok: false,
      status: null,
      message: "Could not reach IndexNow. Try again later.",
    };
  }
}

async function submitUrls(
  organizationId: string,
  projectId: string,
  urls: string[],
): Promise<IndexNowSubmission> {
  const { domain, key } = requireIndexNowSetup(
    await getProject(organizationId, projectId),
  );
  const { byHost, rejectedUrls } = groupUrlsByHost(domain, urls);
  const results = await Promise.all(
    [...byHost].map(([host, hostUrls]) => submitHost(host, key, [...hostUrls])),
  );
  return {
    submittedCount: results
      .filter((result) => result.ok)
      .reduce((sum, result) => sum + result.urlCount, 0),
    rejectedUrls,
    results,
  };
}

// Submits every page of an audit that a search engine should index: fetched
// successfully, indexable, and not hidden behind bot protection.
async function submitAuditPages(
  organizationId: string,
  projectId: string,
  auditId: string,
) {
  const audit = await AuditRepository.getAuditForProject(auditId, projectId);
  if (!audit) throw new AppError("NOT_FOUND");
  const pages = await AuditRepository.getPagesForAudit(auditId);
  const urls = pages
    .filter(
      (page) =>
        page.statusCode === 200 &&
        page.isIndexable &&
        page.fetchClass !== "blocked",
    )
    .map((page) => page.url)
    .slice(0, INDEXNOW_MAX_URLS);
  return submitUrls(organizationId, projectId, urls);
}

// Fetches https://<domain>/<key>.txt the way a search engine would, following
// redirects manually so each hop passes the same SSRF policy as the crawler.
async function checkKeyFile(organizationId: string, projectId: string) {
  const { domain, key } = requireIndexNowSetup(
    await getProject(organizationId, projectId),
  );
  let url = `https://${domain}/${key}.txt`;
  for (let hop = 0; hop <= KEY_FILE_REDIRECT_HOPS; hop += 1) {
    if (!isCrawlableUrl(url)) {
      return { ok: false, url, message: "This URL is blocked by policy." };
    }
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, url, message: "Could not reach the key file." };
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) {
      return {
        ok: false,
        url,
        message: `The key file returned HTTP ${response.status}.`,
      };
    }
    const body = (await response.text()).trim();
    return body === key
      ? { ok: true, url, message: "Key file found." }
      : {
          ok: false,
          url,
          message: "The file exists, but its content is not the key.",
        };
  }
  return { ok: false, url, message: "The key file redirects too many times." };
}

export const IndexNowService = {
  enableKey,
  regenerateKey,
  submitUrls,
  submitAuditPages,
  checkKeyFile,
} as const;
