import type { Page } from "playwright";
import type {
  BrokerFormRunner,
  FormAutomationOutcome,
} from "@/lib/automation/types";

interface ListingCandidate {
  context: string;
  href: string;
  text: string;
}

interface RankedSpokeoCandidate {
  candidate: ListingCandidate;
  combinedScore: number;
  currentAddress: string | null;
  matchSignals: string[];
  profileScore: number;
  profileTitle: string | null;
  searchScore: number;
}

const SPOKEO_RESULT_LINK_PATTERN = /^https:\/\/www\.spokeo\.com\/[^?#]+\/p[a-z0-9]+/i;
const MAX_SPOKEO_PROFILE_INSPECTIONS = 6;
const STREET_STOP_WORDS = new Set([
  "apt",
  "apartment",
  "ave",
  "avenue",
  "blvd",
  "boulevard",
  "cir",
  "circle",
  "ct",
  "court",
  "dr",
  "drive",
  "hwy",
  "highway",
  "lane",
  "ln",
  "loop",
  "pkwy",
  "parkway",
  "pl",
  "place",
  "rd",
  "road",
  "sq",
  "st",
  "state",
  "street",
  "suite",
  "ste",
  "terrace",
  "ter",
  "trail",
  "trl",
  "unit",
  "way",
]);

export const WAVE_ONE_BROKER_FORM_RUNNERS: Record<string, BrokerFormRunner> = {
  "advancedbackgroundchecks": runAdvancedBackgroundChecks,
  "fastpeoplesearch": runFastPeopleSearch,
  "spokeo": runSpokeo,
};

async function runSpokeo({
  captureScreenshot,
  input,
  log,
  page,
  recordDetail,
}: Parameters<BrokerFormRunner>[0]): Promise<FormAutomationOutcome> {
  const fullName = pickPrimaryFullName(input.profile.fullNames);
  const address = pickPrimaryAddress(input.profile.addresses);
  const confirmationEmail = pickConfirmationEmail(input.profile.emails);

  if (!fullName || !address || !confirmationEmail) {
    log("warn", "Spokeo runner missing required profile data", {
      hasAddress: Boolean(address),
      hasConfirmationEmail: Boolean(confirmationEmail),
      hasFullName: Boolean(fullName),
    });

    return {
      status: "requires_user_action",
      blockerType: "missing_profile_data",
      removalUrl: input.entryUrl,
      reason:
        "NUKE needs a full name, a city/state address, and a confirmation email before it can automate Spokeo.",
    };
  }

  const searchUrl = buildSpokeoSearchUrl(fullName, address.city, address.state);
  recordDetail("searchUrl", searchUrl);
  recordDetail("confirmationEmail", confirmationEmail);

  log("info", "Searching Spokeo for the matching listing", {
    searchUrl,
  });
  await page.goto(searchUrl, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2_000);
  await captureScreenshot("spokeo-search-results");

  const candidates = await readSpokeoCandidates(page);
  recordDetail("candidateCount", candidates.length);
  recordDetail(
    "topSearchCandidates",
    rankSpokeoSearchCandidates(candidates, fullName, address)
      .slice(0, MAX_SPOKEO_PROFILE_INSPECTIONS)
      .map((entry) => ({
        href: entry.candidate.href,
        searchScore: entry.searchScore,
        text: entry.candidate.text,
      }))
  );

  const selection = await pickBestSpokeoCandidate(page, candidates, fullName, address);
  recordDetail(
    "candidateAnalysis",
    selection.analysis.map((entry) => ({
      combinedScore: entry.combinedScore,
      currentAddress: entry.currentAddress,
      href: entry.candidate.href,
      matchSignals: entry.matchSignals,
      profileScore: entry.profileScore,
      profileTitle: entry.profileTitle,
      searchScore: entry.searchScore,
    }))
  );

  const bestCandidate = selection.bestCandidate;
  if (!bestCandidate) {
    log("warn", "Spokeo runner could not confidently match a listing", {
      candidateCount: candidates.length,
    });

    return {
      status: "requires_user_action",
      blockerType: "ambiguous_match",
      removalUrl: searchUrl,
      reason:
        "NUKE could not confidently match the right Spokeo listing, so it handed you the search page instead of guessing.",
    };
  }

  recordDetail("matchedProfileUrl", bestCandidate.href);
  recordDetail("matchedProfileText", bestCandidate.text);

  log("info", "Opening matched Spokeo profile before opt-out submission", {
    matchedProfileUrl: bestCandidate.href,
  });
  await page.goto(bestCandidate.href, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1_500);
  await captureScreenshot("spokeo-matched-profile");

  const prefilledOptOutUrl = buildSpokeoPrefilledOptOutUrl(
    bestCandidate.href,
    confirmationEmail
  );
  recordDetail("prefilledOptOutUrl", prefilledOptOutUrl);

  log("info", "Opening Spokeo opt-out page with the matched profile URL", {
    matchedProfileUrl: bestCandidate.href,
  });
  await page.goto(prefilledOptOutUrl, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2_000);
  await ensureInputValue(page, "input[name='url']", bestCandidate.href);
  await ensureInputValue(page, "input[name='email']", confirmationEmail);
  await captureScreenshot("spokeo-opt-out-ready");

  if (await hasCaptcha(page)) {
    log("warn", "Spokeo runner requires manual CAPTCHA completion", {
      prefilledOptOutUrl,
    });

    return {
      status: "requires_user_action",
      blockerType: "captcha",
      removalUrl: prefilledOptOutUrl,
      reason:
        "Spokeo reached the prefilled opt-out page, but the final submit is blocked by a live CAPTCHA challenge.",
    };
  }

  const submitResult = await submitSpokeoOptOut(page);
  await captureScreenshot("spokeo-opt-out-submitted");

  if (submitResult === "submitted") {
    log("info", "Spokeo runner submitted the opt-out form");
    return {
      status: "submitted",
      removalUrl: prefilledOptOutUrl,
    };
  }

  if (submitResult === "captcha") {
    log("warn", "Spokeo runner hit CAPTCHA after attempting final submit", {
      prefilledOptOutUrl,
    });
    return {
      status: "requires_user_action",
      blockerType: "captcha",
      removalUrl: prefilledOptOutUrl,
      reason:
        "Spokeo blocked the final submit behind a CAPTCHA after NUKE filled the opt-out form.",
    };
  }

  log("warn", "Spokeo runner could not confirm final submission state", {
    prefilledOptOutUrl,
  });
  return {
    status: "requires_user_action",
    blockerType: "unclear_submission",
    removalUrl: prefilledOptOutUrl,
    reason:
      "NUKE filled the Spokeo opt-out form, but the final confirmation state was not clear enough to trust automatically.",
  };
}

async function runFastPeopleSearch({
  captureScreenshot,
  input,
  log,
  page,
  recordDetail,
}: Parameters<BrokerFormRunner>[0]): Promise<FormAutomationOutcome> {
  const fullName = pickPrimaryFullName(input.profile.fullNames);
  const address = pickPrimaryAddress(input.profile.addresses);

  if (!fullName || !address) {
    log("warn", "FastPeopleSearch runner missing required profile data", {
      hasAddress: Boolean(address),
      hasFullName: Boolean(fullName),
    });

    return {
      status: "requires_user_action",
      blockerType: "missing_profile_data",
      removalUrl: input.entryUrl,
      reason:
        "NUKE needs a full name plus a city/state address before it can automate FastPeopleSearch.",
    };
  }

  const searchUrl = buildFastPeopleSearchSearchUrl(
    fullName,
    formatFastPeopleSearchLocation(address)
  );

  recordDetail("searchUrl", searchUrl);

  log("info", "Opening FastPeopleSearch search results", {
    searchUrl,
  });
  await page.goto(searchUrl, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(5_000);
  await captureScreenshot("fastpeoplesearch-search-results");

  if (await isFastPeopleSearchChallenge(page)) {
    log("warn", "FastPeopleSearch search flow is blocked by a live challenge", {
      searchUrl,
    });
    return {
      status: "requires_user_action",
      blockerType: "bot_check",
      removalUrl: searchUrl,
      reason:
        "FastPeopleSearch redirected the automation to a live bot-check or rate-limit screen, so NUKE could not safely continue the flow.",
    };
  }

  log("warn", "FastPeopleSearch search flow loaded but still needs manual completion", {
    searchUrl,
  });
  return {
    status: "requires_user_action",
    blockerType: "automation_gap",
    removalUrl: searchUrl,
    reason:
      "FastPeopleSearch loaded successfully, but NUKE does not yet automate the remaining result-selection and opt-out steps.",
  };
}

async function runAdvancedBackgroundChecks({
  captureScreenshot,
  input,
  log,
  page,
}: Parameters<BrokerFormRunner>[0]): Promise<FormAutomationOutcome> {
  const fullName = pickPrimaryFullName(input.profile.fullNames);
  const confirmationEmail = pickConfirmationEmail(input.profile.emails);
  const splitName = splitFullName(fullName);

  if (!splitName || !confirmationEmail) {
    log("warn", "Advanced Background Checks runner missing required profile data", {
      hasConfirmationEmail: Boolean(confirmationEmail),
      hasFullName: Boolean(fullName),
    });

    return {
      status: "requires_user_action",
      blockerType: "missing_profile_data",
      removalUrl: input.entryUrl,
      reason:
        "NUKE needs a first and last name plus a confirmation email before it can automate Advanced Background Checks.",
    };
  }

  log("info", "Opening Advanced Background Checks opt-out form", {
    entryUrl: input.entryUrl,
  });
  await page.goto(input.entryUrl, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2_000);
  await captureScreenshot("advancedbackgroundchecks-optout-form");

  await ensureInputValue(page, "input[name='subject-firstname']", splitName.first);
  await ensureInputValue(page, "input[name='subject-middlename']", splitName.middle);
  await ensureInputValue(page, "input[name='subject-lastname']", splitName.last);
  await ensureInputValue(page, "input[name='subject-email']", confirmationEmail);
  await ensureCheckbox(page, "input[name='agreement']");
  await captureScreenshot("advancedbackgroundchecks-prefilled-form");

  if (await hasCaptcha(page)) {
    log("warn", "Advanced Background Checks requires manual CAPTCHA completion", {
      entryUrl: input.entryUrl,
    });

    return {
      status: "requires_user_action",
      blockerType: "captcha",
      removalUrl: input.entryUrl,
      reason:
        "Advanced Background Checks requires a live CAPTCHA on the initial email-verification form before it will send the removal link.",
    };
  }

  const submitResult = await submitAdvancedBackgroundChecks(page);
  await captureScreenshot("advancedbackgroundchecks-submission-result");

  if (submitResult === "submitted") {
    log("info", "Advanced Background Checks submitted the initial verification form");
    return {
      status: "submitted",
      removalUrl: input.entryUrl,
      reason:
        "Advanced Background Checks accepted the initial verification form and should send the removal link by email.",
    };
  }

  if (submitResult === "captcha") {
    log("warn", "Advanced Background Checks hit CAPTCHA during final submit", {
      entryUrl: input.entryUrl,
    });
    return {
      status: "requires_user_action",
      blockerType: "captcha",
      removalUrl: input.entryUrl,
      reason:
        "Advanced Background Checks blocked the initial email-verification form behind a live CAPTCHA after NUKE filled it.",
    };
  }

  log("warn", "Advanced Background Checks returned an unclear submission state", {
    entryUrl: input.entryUrl,
  });
  return {
    status: "requires_user_action",
    blockerType: "unclear_submission",
    removalUrl: input.entryUrl,
    reason:
      "NUKE filled the Advanced Background Checks verification form, but the page did not return a clear enough success state to trust automatically.",
  };
}

async function readSpokeoCandidates(page: Page): Promise<ListingCandidate[]> {
  const rawCandidates = await page.evaluate((pattern) => {
    const hrefPattern = new RegExp(pattern, "i");

    return Array.from(document.querySelectorAll("a[href]"))
      .map((anchor) => {
        const href = (anchor as HTMLAnchorElement).href;
        if (!hrefPattern.test(href)) return null;

        const text = anchor.textContent?.trim() ?? "";
        const containerText =
          anchor.closest("article, li")?.textContent?.trim() ??
          anchor.parentElement?.textContent?.trim() ??
          text;

        return {
          context: containerText.replace(/\s+/g, " ").trim(),
          href,
          text: text.replace(/\s+/g, " ").trim(),
        };
      })
      .filter((candidate): candidate is ListingCandidate => Boolean(candidate));
  }, SPOKEO_RESULT_LINK_PATTERN.source);

  return dedupeListingCandidates(rawCandidates);
}

async function pickBestSpokeoCandidate(
  page: Page,
  candidates: ListingCandidate[],
  fullName: string,
  address: { city: string; state: string; street: string; zip: string }
): Promise<{
  analysis: RankedSpokeoCandidate[];
  bestCandidate: ListingCandidate | null;
}> {
  const rankedSearchCandidates = rankSpokeoSearchCandidates(
    candidates,
    fullName,
    address
  ).slice(0, MAX_SPOKEO_PROFILE_INSPECTIONS);

  const analysis: RankedSpokeoCandidate[] = [];

  for (const entry of rankedSearchCandidates) {
    const profile = await inspectSpokeoProfileCandidate(page, entry.candidate.href);
    const profileMatch = scoreSpokeoHaystack(
      `${profile.title ?? ""} ${profile.currentAddress ?? ""}`,
      fullName,
      address
    );

    analysis.push({
      candidate: entry.candidate,
      combinedScore: entry.searchScore + profileMatch.score,
      currentAddress: profile.currentAddress,
      matchSignals: [...entry.matchSignals, ...profileMatch.signals],
      profileScore: profileMatch.score,
      profileTitle: profile.title,
      searchScore: entry.searchScore,
    });
  }

  analysis.sort((left, right) => right.combinedScore - left.combinedScore);

  const best = analysis[0];
  if (!best) {
    return {
      analysis,
      bestCandidate: null,
    };
  }

  const second = analysis[1];
  const hasAddressSignal = best.matchSignals.some((signal) =>
    signal.startsWith("street:") || signal === "zip"
  );

  if (!hasAddressSignal || best.combinedScore < 230) {
    return {
      analysis,
      bestCandidate: null,
    };
  }

  if (second && best.combinedScore - second.combinedScore < 35) {
    return {
      analysis,
      bestCandidate: null,
    };
  }

  return {
    analysis,
    bestCandidate: best.candidate,
  };
}

function rankSpokeoSearchCandidates(
  candidates: ListingCandidate[],
  fullName: string,
  address: { city: string; state: string; street: string; zip: string }
): RankedSpokeoCandidate[] {
  return candidates
    .map((candidate) => {
      const match = scoreSpokeoHaystack(
        `${candidate.text} ${candidate.href}`,
        fullName,
        address
      );

      return {
        candidate,
        combinedScore: match.score,
        currentAddress: null,
        matchSignals: match.signals,
        profileScore: 0,
        profileTitle: null,
        searchScore: match.score,
      };
    })
    .sort((left, right) => right.searchScore - left.searchScore);
}

async function inspectSpokeoProfileCandidate(
  page: Page,
  href: string
): Promise<{
  currentAddress: string | null;
  snippet: string;
  title: string | null;
}> {
  await page.goto(href, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1_250);

  return page.evaluate(() => {
    const title = document.title;
    const bodyText = document.body?.innerText ?? "";
    const compactText = bodyText.replace(/\s+/g, " ").trim();
    const currentAddressMatch = compactText.match(
      /Current Address:\s*(.+?)(?:Past Addresses:|Phone Number:|Email Address:|UNLOCK PROFILE)/i
    );

    return {
      currentAddress: currentAddressMatch?.[1]?.trim() ?? null,
      snippet: compactText.slice(0, 4000),
      title: title || null,
    };
  });
}

async function submitSpokeoOptOut(
  page: Page
): Promise<"submitted" | "captcha" | "unclear"> {
  const submitButton = page
    .locator("button[type='submit'], input[type='submit']")
    .first();

  if ((await submitButton.count()) === 0) {
    return "unclear";
  }

  await submitButton.click();
  await page.waitForTimeout(3_000);

  if (await hasCaptcha(page)) {
    return "captcha";
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (
    /check your email|verification email|confirmation email|opt out request has been submitted|request has been submitted|follow the instructions in the email/i.test(
      bodyText
    )
  ) {
    return "submitted";
  }

  return "unclear";
}

async function submitAdvancedBackgroundChecks(
  page: Page
): Promise<"submitted" | "captcha" | "unclear"> {
  const submitButton = page.locator("form[action='/removal'] button[type='submit']").first();

  if ((await submitButton.count()) === 0) {
    return "unclear";
  }

  await submitButton.click();
  await page.waitForTimeout(3_000);

  if (await hasCaptcha(page)) {
    return "captcha";
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (
    /send a link to your email|we will send an email|confirmation email|take you to the opt-out form|begin removal process/i.test(
      bodyText
    ) &&
    /thank you|check your email|sent/i.test(bodyText)
  ) {
    return "submitted";
  }

  return "unclear";
}

function scoreSpokeoHaystack(
  haystackSource: string,
  fullName: string,
  address: { city: string; state: string; street: string; zip: string }
): {
  score: number;
  signals: string[];
} {
  const haystack = normalizeForMatch(haystackSource);
  const nameTokens = tokenizeForMatch(fullName);
  const signals: string[] = [];
  let score = 0;

  const cityNeedle = normalizeForMatch(address.city);
  const stateNeedle = normalizeForMatch(address.state);
  const zipNeedle = normalizeForMatch(address.zip);
  const streetTokens = extractStreetMatchTokens(address.street);
  let matchedStreetTokens = 0;

  if (
    nameTokens.length > 0 &&
    nameTokens.every((token) => containsNormalizedPhrase(haystack, token))
  ) {
    score += 120;
    signals.push("name");
  }
  if (cityNeedle && containsNormalizedPhrase(haystack, cityNeedle)) {
    score += 40;
    signals.push("city");
  }
  if (stateNeedle && containsNormalizedPhrase(haystack, stateNeedle)) {
    score += 25;
    signals.push("state");
  }
  if (zipNeedle && containsNormalizedPhrase(haystack, zipNeedle)) {
    score += 90;
    signals.push("zip");
  }

  for (const token of streetTokens) {
    if (!containsNormalizedPhrase(haystack, token)) continue;

    matchedStreetTokens += 1;
    score += 30;
    signals.push(`street:${token}`);
  }

  if (matchedStreetTokens > 0 && matchedStreetTokens === streetTokens.length) {
    score += 25;
    signals.push("street:full");
  } else if (matchedStreetTokens >= 2) {
    score += 10;
    signals.push("street:multi");
  }

  return {
    score,
    signals,
  };
}

function buildSpokeoSearchUrl(
  fullName: string,
  city: string,
  state: string
): string {
  const query = [fullName, city, state].filter(Boolean).join(" ");
  return `https://www.spokeo.com/search?q=${encodeURIComponent(query)}`;
}

function buildSpokeoPrefilledOptOutUrl(
  profileUrl: string,
  email: string
): string {
  const search = new URLSearchParams({
    email,
    url: profileUrl,
  });
  return `https://www.spokeo.com/optout?${search.toString()}`;
}

function buildFastPeopleSearchSearchUrl(
  fullName: string,
  location: string
): string {
  const search = new URLSearchParams({
    address: location,
    name: fullName,
  });
  return `https://www.fastpeoplesearch.com/search?${search.toString()}`;
}

function formatFastPeopleSearchLocation(address: {
  city: string;
  state: string;
  zip: string;
}): string {
  const parts = [address.city, address.state].filter(Boolean);
  const base = parts.join(", ");
  return address.zip ? `${base} ${address.zip}`.trim() : base;
}

function pickPrimaryFullName(fullNames: string[]): string | null {
  return fullNames.find((value) => value.trim().length > 0)?.trim() ?? null;
}

function splitFullName(fullName: string | null): {
  first: string;
  middle: string;
  last: string;
} | null {
  if (!fullName) return null;

  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  return {
    first: parts[0] ?? "",
    middle: parts.slice(1, -1).join(" "),
    last: parts.at(-1) ?? "",
  };
}

function pickConfirmationEmail(emails: string[]): string | null {
  const override = process.env.FORM_AUTOMATION_CONFIRMATION_EMAIL?.trim();
  if (override) return override;
  return emails.find((value) => value.trim().length > 0)?.trim() ?? null;
}

function pickPrimaryAddress(
  addresses: Array<{ city: string; state: string; street: string; zip: string }>
) {
  return (
    addresses.find(
      (address) => address.city.trim().length > 0 && address.state.trim().length > 0
    ) ?? null
  );
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractStreetMatchTokens(street: string): string[] {
  return Array.from(
    new Set(
      tokenizeForMatch(street)
        .filter(
          (token) =>
            token.length >= 3 &&
            !/^\d+$/.test(token) &&
            !STREET_STOP_WORDS.has(token)
        )
    )
  );
}

function tokenizeForMatch(value: string): string[] {
  return normalizeForMatch(value)
    .split(" ")
    .filter((token) => token.length > 0);
}

function containsNormalizedPhrase(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeForMatch(needle);
  if (!normalizedNeedle) return false;

  return ` ${haystack} `.includes(` ${normalizedNeedle} `);
}

function dedupeListingCandidates(candidates: ListingCandidate[]): ListingCandidate[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = candidate.href.trim();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}


async function ensureInputValue(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  const input = page.locator(selector).first();
  if ((await input.count()) === 0) return;

  const currentValue = await input.inputValue().catch(() => "");
  if (currentValue.trim() === value.trim()) return;

  await input.fill(value);
}

async function ensureCheckbox(page: Page, selector: string): Promise<void> {
  const input = page.locator(selector).first();
  if ((await input.count()) === 0) return;
  if (await input.isChecked().catch(() => false)) return;

  await input.check().catch(async () => {
    await input.click();
  });
}

async function hasCaptcha(page: Page): Promise<boolean> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (/captcha|recaptcha/i.test(bodyText)) {
    return true;
  }

  const selectors = [
    "iframe[title*='reCAPTCHA']",
    ".g-recaptcha",
    "textarea[name='g-recaptcha-response']",
    "input[name='recaptcha']",
  ];

  for (const selector of selectors) {
    if ((await page.locator(selector).count()) > 0) {
      return true;
    }
  }

  return false;
}

async function isFastPeopleSearchChallenge(page: Page): Promise<boolean> {
  if (/\/(bot-check|rate-limited)\b/i.test(page.url())) {
    return true;
  }

  const title = await page.title().catch(() => "");
  if (/just a moment|rate limited/i.test(title)) return true;

  const bodyText = await page.locator("body").innerText().catch(() => "");
  return /loading search results|security challenge|enable javascript and cookies|rate limited/i.test(
    bodyText
  );
}
