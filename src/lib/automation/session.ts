import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  Browser,
  BrowserContext,
  Page,
} from "playwright";
import {
  getPlaywrightFoundationConfig,
  type PlaywrightFoundationConfig,
} from "@/lib/automation/config";

export type AutomationRunStatus = "succeeded" | "failed";
export type AutomationLogLevel = "info" | "warn" | "error";

export interface AutomationLogEntry {
  at: string;
  data?: Record<string, unknown>;
  level: AutomationLogLevel;
  message: string;
}

export interface PlaywrightRunResult {
  brokerDomain: string;
  brokerName: string;
  entryUrl: string;
  errorMessage: string | null;
  finalUrl: string | null;
  finishedAt: string;
  logEntries: number;
  logPath: string;
  metadataPath: string;
  pageTitle: string | null;
  runDir: string;
  runId: string;
  screenshots: string[];
  startedAt: string;
  status: AutomationRunStatus;
  tracePath: string | null;
}

export interface PlaywrightSessionInput {
  brokerDomain: string;
  brokerName: string;
  entryUrl: string;
  sessionLabel?: string;
}

export interface PlaywrightAutomationContext {
  browser: Browser;
  config: PlaywrightFoundationConfig;
  context: BrowserContext;
  page: Page;
  recordDetail: (key: string, value: unknown) => void;
  log: (
    level: AutomationLogLevel,
    message: string,
    data?: Record<string, unknown>
  ) => void;
  captureScreenshot: (label: string) => Promise<string>;
  runId: string;
}

export async function runPlaywrightAutomationSession(
  input: PlaywrightSessionInput,
  handler: (context: PlaywrightAutomationContext) => Promise<void>
): Promise<PlaywrightRunResult> {
  const config = getPlaywrightFoundationConfig();
  const startedAt = new Date();
  const runId = buildRunId(input.brokerName, input.sessionLabel);
  const runDir = path.join(config.artifactRootDir, runId);
  const screenshotsDir = path.join(runDir, "screenshots");
  const logPath = path.join(runDir, "automation-log.json");
  const metadataPath = path.join(runDir, "metadata.json");
  const tracePath = config.traceEnabled ? path.join(runDir, "trace.zip") : null;
  const screenshots: string[] = [];
  const logs: AutomationLogEntry[] = [];
  const detail: Record<string, unknown> = {};

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let finalUrl: string | null = null;
  let pageTitle: string | null = null;
  let errorMessage: string | null = null;
  let status: AutomationRunStatus = "succeeded";

  await fs.mkdir(screenshotsDir, { recursive: true });

  const recordDetail = (key: string, value: unknown) => {
    detail[key] = value;
  };

  const log = (
    level: AutomationLogLevel,
    message: string,
    data?: Record<string, unknown>
  ) => {
    logs.push({
      at: new Date().toISOString(),
      level,
      message,
      ...(data ? { data } : {}),
    });
  };

  const captureScreenshot = async (label: string) => {
    if (!page) {
      throw new Error("Cannot capture a screenshot before a page exists.");
    }

    const filename = `${String(screenshots.length + 1).padStart(2, "0")}-${slugify(
      label
    )}.png`;
    const screenshotPath = path.join(screenshotsDir, filename);

    await page.screenshot({
      fullPage: true,
      path: screenshotPath,
    });

    screenshots.push(screenshotPath);
    log("info", "Captured screenshot", {
      label,
      path: screenshotPath,
    });

    return screenshotPath;
  };

  try {
    log("info", "Starting Playwright automation session", {
      browserName: config.browserName,
      browserChannel: config.browserChannel,
      headless: config.headless,
      entryUrl: input.entryUrl,
      proxyConfigured: Boolean(config.proxyUrl),
      solverConfigured: Boolean(config.solverApiKey),
    });

    const playwright = await import("playwright");
    const browserType = playwright[config.browserName];

    browser = await browserType.launch({
      ...(config.browserName === "chromium" && config.browserChannel
        ? { channel: config.browserChannel }
        : {}),
      headless: config.headless,
      slowMo: config.slowMoMs,
      ...(config.proxyUrl ? { proxy: { server: config.proxyUrl } } : {}),
    });

    context = await browser.newContext();
    context.setDefaultTimeout(config.defaultTimeoutMs);

    if (config.traceEnabled) {
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
      });
    }

    page = await context.newPage();
    page.setDefaultNavigationTimeout(config.navigationTimeoutMs);

    page.on("console", (message) => {
      log("info", "Browser console message", {
        type: message.type(),
        text: message.text(),
      });
    });
    page.on("pageerror", (error) => {
      log("error", "Page error", {
        message: error.message,
      });
    });
    page.on("requestfailed", (request) => {
      log("warn", "Request failed", {
        errorText: request.failure()?.errorText ?? null,
        method: request.method(),
        url: request.url(),
      });
    });

    await handler({
      browser,
      config,
      context,
      page,
      recordDetail,
      log,
      captureScreenshot,
      runId,
    });

    finalUrl = page.url();
    pageTitle = await safePageTitle(page);

    if (!screenshots.length) {
      await captureScreenshot("final");
    }

    log("info", "Playwright automation session completed", {
      finalUrl,
      pageTitle,
    });
  } catch (error) {
    status = "failed";
    errorMessage = normalizeAutomationError(error);
    log("error", "Playwright automation session failed", {
      error: errorMessage,
    });

    if (page && config.screenshotOnFailure) {
      try {
        await captureScreenshot("failure");
      } catch (screenshotError) {
        log("warn", "Failure screenshot capture failed", {
          error: normalizeAutomationError(screenshotError),
        });
      }
    }

    if (page) {
      finalUrl = page.url();
      pageTitle = await safePageTitle(page);
    }
  } finally {
    if (context && tracePath) {
      try {
        await context.tracing.stop({ path: tracePath });
      } catch (traceError) {
        log("warn", "Trace capture failed", {
          error: normalizeAutomationError(traceError),
        });
      }
    }

    await Promise.allSettled([
      context?.close(),
      browser?.close(),
    ]);
  }

  const finishedAt = new Date();
  const metadata = {
    brokerDomain: input.brokerDomain,
    brokerName: input.brokerName,
    browserName: config.browserName,
    browserChannel: config.browserChannel,
    defaultTimeoutMs: config.defaultTimeoutMs,
    entryUrl: input.entryUrl,
    errorMessage,
    finalUrl,
    finishedAt: finishedAt.toISOString(),
    headless: config.headless,
    navigationTimeoutMs: config.navigationTimeoutMs,
    pageTitle,
    proxyConfigured: Boolean(config.proxyUrl),
    runId,
    sessionLabel: input.sessionLabel ?? null,
    slowMoMs: config.slowMoMs,
    solverConfigured: Boolean(config.solverApiKey),
    startedAt: startedAt.toISOString(),
    status,
    traceEnabled: config.traceEnabled,
    tracePath,
    detail,
  };

  await Promise.all([
    fs.writeFile(logPath, JSON.stringify(logs, null, 2), "utf8"),
    fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8"),
  ]);

  return {
    brokerDomain: input.brokerDomain,
    brokerName: input.brokerName,
    entryUrl: input.entryUrl,
    errorMessage,
    finalUrl,
    finishedAt: finishedAt.toISOString(),
    logEntries: logs.length,
    logPath,
    metadataPath,
    pageTitle,
    runDir,
    runId,
    screenshots,
    startedAt: startedAt.toISOString(),
    status,
    tracePath,
  };
}

async function safePageTitle(page: Page): Promise<string | null> {
  try {
    return await page.title();
  } catch {
    return null;
  }
}

function buildRunId(brokerName: string, sessionLabel?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const parts = [timestamp, slugify(brokerName)];

  if (sessionLabel) {
    parts.push(slugify(sessionLabel));
  }

  parts.push(randomUUID().slice(0, 8));
  return parts.join("-");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeAutomationError(error: unknown): string {
  const base =
    error instanceof Error ? error.message : "Unknown automation failure";

  if (base.includes("Executable doesn't exist")) {
    return `${base}. Run 'npx playwright install chromium' before retrying.`;
  }

  return base;
}
