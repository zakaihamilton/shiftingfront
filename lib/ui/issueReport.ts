import { APP_ISSUES_URL, APP_VERSION } from "../site";

export const CRASH_ISSUE_TEMPLATE = "crash.md";
export const FEEDBACK_ISSUE_TEMPLATE = "bug.yml";

const MAX_STACK_CHARS = 1_600;
const MAX_ISSUE_URL_CHARS = 6_000;

export type CrashIssueContext = {
  message?: string;
  stack?: string;
  href?: string;
  userAgent?: string;
  timestamp?: string;
};

export function feedbackIssueUrl(): string {
  const params = new URLSearchParams({ template: FEEDBACK_ISSUE_TEMPLATE });
  return `${APP_ISSUES_URL}/new?${params.toString()}`;
}

export function crashIssueUrl(context: CrashIssueContext): string {
  const href = buildCrashHref(context, context.stack ?? "");
  if (href.length <= MAX_ISSUE_URL_CHARS) return href;
  return buildCrashHref(context, "");
}

function buildCrashHref(context: CrashIssueContext, stack: string): string {
  const params = new URLSearchParams({
    template: CRASH_ISSUE_TEMPLATE,
    title: `[Crash] ${compact(context.message ?? "Runtime Error").slice(0, 60)}`,
    body: crashIssueBody(context, stack),
  });
  return `${APP_ISSUES_URL}/new?${params.toString()}`;
}

export function crashIssueBody(context: CrashIssueContext, stack = context.stack ?? ""): string {
  const location = parseCampaignLocation(context.href);
  return [
    "## What happened",
    "",
    "_Add anything you were doing when this crashed._",
    "",
    "## Campaign",
    "",
    `- Version: ${APP_VERSION}`,
    `- Seed: ${location.seed || "_unknown_"}`,
    `- Mission: ${location.mission || "_unknown_"}`,
    `- Path: ${location.path || "_unknown_"}`,
    "",
    "## Diagnostics",
    "",
    "```json",
    JSON.stringify({
      error: context.message ?? "",
      stack: stack.slice(0, MAX_STACK_CHARS),
      url: context.href ?? "",
      userAgent: context.userAgent ?? "",
      version: APP_VERSION,
      timestamp: context.timestamp ?? "",
    }, null, 2),
    "```",
    "",
  ].join("\n");
}

function parseCampaignLocation(href?: string): { seed: string; mission: string; path: string } {
  if (!href) return { seed: "", mission: "", path: "" };
  try {
    const url = new URL(href);
    return {
      seed: url.searchParams.get("seed") ?? "",
      mission: url.searchParams.get("mission") ?? "",
      path: `${url.pathname}${url.search}`,
    };
  } catch {
    return { seed: "", mission: "", path: href };
  }
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
