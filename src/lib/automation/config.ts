import path from "node:path";

export type AutomationBrowserName = "chromium" | "firefox" | "webkit";

export interface PlaywrightFoundationConfig {
  enabled: boolean;
  browserName: AutomationBrowserName;
  browserChannel: string | null;
  headless: boolean;
  slowMoMs: number;
  defaultTimeoutMs: number;
  navigationTimeoutMs: number;
  artifactRootDir: string;
  traceEnabled: boolean;
  screenshotOnFailure: boolean;
  proxyUrl: string | null;
  solverApiKey: string | null;
}

export function getPlaywrightFoundationConfig(): PlaywrightFoundationConfig {
  return {
    enabled: parseBoolean(process.env.FORM_AUTOMATION_ENABLED, false),
    browserName: parseBrowserName(process.env.PLAYWRIGHT_BROWSER),
    browserChannel: cleanNullable(process.env.PLAYWRIGHT_CHANNEL) ?? "chromium",
    headless: parseBoolean(process.env.PLAYWRIGHT_HEADLESS, true),
    slowMoMs: parseInteger(process.env.PLAYWRIGHT_SLOW_MO_MS, 0),
    defaultTimeoutMs: parseInteger(process.env.PLAYWRIGHT_TIMEOUT_MS, 20_000),
    navigationTimeoutMs: parseInteger(
      process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS,
      30_000
    ),
    artifactRootDir: path.join(
      process.cwd(),
      ".artifacts",
      parseArtifactSubdir(process.env.PLAYWRIGHT_ARTIFACT_DIR)
    ),
    traceEnabled: parseBoolean(process.env.PLAYWRIGHT_TRACE_ENABLED, true),
    screenshotOnFailure: parseBoolean(
      process.env.PLAYWRIGHT_SCREENSHOT_ON_FAILURE,
      true
    ),
    proxyUrl: cleanNullable(process.env.PLAYWRIGHT_PROXY_URL),
    solverApiKey: cleanNullable(process.env.AUTOMATION_SOLVER_API_KEY),
  };
}

export function isFormAutomationEnabled(): boolean {
  return getPlaywrightFoundationConfig().enabled;
}

function parseBrowserName(
  value: string | undefined
): AutomationBrowserName {
  switch (value?.trim()) {
    case "firefox":
      return "firefox";
    case "webkit":
      return "webkit";
    default:
      return "chromium";
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function cleanNullable(value: string | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function parseArtifactSubdir(value: string | undefined): string {
  const cleaned = value?.trim();
  if (!cleaned) return "playwright";

  const parts = cleaned.split(/[\\/]+/).filter(Boolean);
  const tail = parts.at(-1);

  if (!tail) return "playwright";

  return tail.replace(/[^a-zA-Z0-9_-]/g, "-") || "playwright";
}
