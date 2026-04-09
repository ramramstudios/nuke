# Phase 3 / Chunk 1: Top Broker Prioritization List

Date: April 8, 2026
Status: Ready for internal sign-off
Scope: Phase 3 / Chunk 1 only. This memo selects the first broker targets for form automation. It does not implement them.

## Executive Recommendation

Recommended initial automation set:

1. Spokeo
2. FastPeopleSearch

Recommended next-up list:

1. That's Them
2. SmartBackgroundChecks
3. Nuwber
4. FamilyTreeNow
5. Advanced Background Checks

Why this is the right starting point:

NUKE should start with brokers that are both highly visible to consumers and plausible to automate without phone calls, ID upload, account creation, or enterprise-only workflows. Spokeo gives the product its clearest flagship people-search win. FastPeopleSearch is the strongest second pick because it is still high-visibility, stays inside the same consumer people-search category, and looks more tractable than Whitepages, MyLife, Intelius/PeopleConnect, or BeenVerified.

What should wait:

Anything with hard verification blockers, heavy anti-bot posture, or weak consumer-facing value should be deferred until the first two automations are stable.

## Method

### Repo evidence used

- `phase-roadmap.csv`
- `README.md`
- `src/lib/brokers/registry.ts`
- `prisma/seed.ts`
- `prisma/schema.prisma`
- `src/lib/removal/engine.ts`
- `src/lib/reporting/metrics.ts`
- `src/app/dashboard/metrics/page.tsx`
- `src/lib/managed-service/service.ts`

Repo-backed conclusions that matter for this chunk:

- Form automation is still a stub in the removal engine today, so this chunk is deciding what deserves implementation first, not measuring existing form success rates.
- The current commercial offer is a human-supported concierge pilot, which makes reduction of manual ops burden commercially meaningful right now.
- The broker registry already distinguishes `form`, `email`, and `manual_link` brokers, along with `priority`, `tier`, and opt-out instructions, but that data is not yet a commercialization-first ranking.

### Current external checks

I used the repo as the primary source of truth and only used current external checks to sanity-check blocker types and current flow shape for the shortlist.

External checks were limited and should be treated as current directional validation, not implementation proof:

- Recent opt-out guides surfaced through web search for Spokeo, FastPeopleSearch, Nuwber, BeenVerified, Intelius, and Whitepages
- The currently live `suppression.peopleconnect.us/login` endpoint for Intelius/PeopleConnect

Important limitation:

The browsing environment did not reliably expose every official broker opt-out form end-to-end, so this memo uses a mix of repo-backed facts plus current external checks. Anything marked as a blocker that came from external checks still needs a manual browser walkthrough before implementation.

### Scoring rubric

Candidates were scored from 1 to 5 on each dimension. Final score is a weighted sum out of 100.

| Dimension | Weight | What it measures |
|---|---:|---|
| Consumer reach | 25 | Likelihood a typical NUKE user appears on this broker |
| Commercialization impact | 20 | How much the broker improves the product's marketable value if automated |
| Manual ops reduction | 15 | Expected reduction in concierge/manual handling burden |
| Automation feasibility | 20 | Plausibility of a stable browser automation flow |
| Maintenance burden | 10 | Likely brittleness and ongoing upkeep cost |
| Blocker risk | 5 | CAPTCHA, email confirm, phone verify, ID verify, anti-bot, multi-step search |
| Evidence capture potential | 5 | Whether NUKE can capture useful proof of submission or confirmation |

Interpretation:

- Higher is better.
- "Maintenance burden" and "Blocker risk" are scored as favorable conditions, so higher numbers mean lower expected pain.

### Evidence labels

- `[R]` Repo-backed fact
- `[E]` Current external check
- `[I]` Inference or assumption

## Ranked Broker Table

This table is intentionally short. It ranks the brokers that are most relevant to the first automation decision, not every broker in the registry.

| Rank | Broker | Domain | Current removal method | Registry priority | Estimated reach | Estimated automation difficulty | Key blockers | Expected ROI | Recommendation | Rationale | Confidence |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Spokeo | spokeo.com | form `[R]` | critical `[R]` | Very high `[I]` | Medium | CAPTCHA `[E]`, email confirmation `[R]` | Very high | Initial set | Highest consumer-recognition payoff in the shortlist, clear opt-out endpoint, and confirmation evidence is realistic if NUKE owns the inbox step | High |
| 2 | FastPeopleSearch | fastpeoplesearch.com | form `[R]` | high `[R]` | High `[I]` | Medium | CAPTCHA `[R]`, likely email step `[E]`, listing-selection ambiguity `[I]` | High | Initial set | Strong people-search coverage with fewer hard blockers than Whitepages, MyLife, or Intelius/PeopleConnect | Medium |
| 3 | That's Them | thatsthem.com | form `[R]` | critical `[R]` | Medium-High `[I]` | Low | Paid-link avoidance `[R]`, possible CAPTCHA `[I]` | High | Next-up | Very attractive low-friction candidate once the first two flows are proven | Medium |
| 4 | SmartBackgroundChecks | smartbackgroundchecks.com | form `[R]` | critical `[R]` | Medium-High `[I]` | Low | No hard blocker documented `[R]` | High | Next-up | Straightforward registry instructions and possible spillover benefit if it also clears PeopleFinders exposure | Medium |
| 5 | Nuwber | nuwber.com | form `[R]` | critical `[R]` | High `[I]` | Medium | Profile URL required `[R]`, search disambiguation `[R]`, fallback email path `[R]` | High | Next-up | Good reach and worthwhile coverage, but search-to-profile matching adds implementation risk | Medium |
| 6 | FamilyTreeNow | familytreenow.com | form `[R]` | high `[R]` | Medium `[I]` | Low | No hard blocker documented `[R]` | Medium-High | Next-up | Lower drama, lower reach, likely a good follow-on once initial browser patterns are stable | Medium |
| 7 | Advanced Background Checks | advancedbackgroundchecks.com | form `[R]` | high `[R]` | Medium `[I]` | Low | Search-result ambiguity `[R]` | Medium | Next-up | Attractive low-friction form candidate, but less marketable than the top five | Medium |
| 8 | CheckPeople | checkpeople.com | form `[R]` | critical `[R]` | High `[I]` | Medium-High | Right-to-Know pre-step `[R]`, birthdate requirement `[R]`, full legal name requirement `[R]` | Medium-High | Later | Real consumer value, but too much structured PII friction for the initial implementation set | Medium |
| 9 | PublicDataUSA | publicdatausa.com | form `[R]` | critical `[R]` | Medium `[I]` | Medium | Email confirmation `[R]`, recognized-email-provider restriction `[R]` | Medium | Later | Solvable, but mailbox constraints make it worse than the cleaner next-up list | Medium |
| 10 | ClustrMaps | clustrmaps.com | form `[R]` | critical `[R]` | Medium `[I]` | Medium | Multi-checkbox removal selection `[R]` | Medium | Later | Useful coverage, but higher DOM variability and weaker consumer pull than the initial set | Medium |
| 11 | BeenVerified | beenverified.com | form `[R]` | critical `[R]` | Very high `[I]` | High | Email confirmation `[R]`, one opt-out per email address `[R]`, anti-bot uncertainty `[E]` | High if solved | Later | Reach is excellent, but the per-email structural limit makes it a poor first automation investment | High |
| 12 | Intelius / PeopleConnect | intelius.com | form `[R]` | critical `[R]` | Very high `[I]` | Very high | PeopleConnect login flow `[R]`, anti-bot uncertainty on live endpoint `[E]`, identifying-info fallback `[R]` | High if solved | Later | High-value target, but too likely to become a maintenance trap for the first implementation round | High |

## Initial-Set Detail

### Spokeo

Why it made the cut:

- It is the cleanest flagship broker in the registry for consumer-facing value.
- It is already marked `critical` and Tier 1 in the registry.
- The opt-out flow is structurally understandable: locate listing, submit URL, confirm via email.
- It is easy to explain to users and easy to sell in a consumer plan or concierge package.

Main technical risks:

- CAPTCHA behavior may vary between manual browsing and automated sessions.
- The flow depends on profile URL discovery before submission.
- Confirmation requires inbox handling and link-click automation or an explicit user fallback.
- Registry notes that some data may persist in paid results, so "submission evidence" matters more than claiming verified removal.

Required fallback behavior:

- If search cannot confidently identify the profile, route to `requires_user_action` with the direct Spokeo opt-out URL.
- If CAPTCHA blocks progress, classify it explicitly and fall back instead of silently failing.
- If the confirmation email does not arrive within the timeout window, keep clear evidence of the submit attempt and route to user action.

Proposed acceptance targets:

- End-to-end form submission succeeds on at least 70 percent of staging runs across varied name/location test cases.
- The automation captures either a confirmation-page screenshot or equivalent submission evidence for every successful run.
- CAPTCHA-blocked runs are explicitly classified and routed to fallback within 30 seconds.
- Confirmation-email timeout handling is deterministic and user-visible.
- "Done" for Spokeo means NUKE can either submit and confirm the opt-out with evidence or cleanly hand off the exact next step to the user.

### FastPeopleSearch

Why it made the cut:

- It stays in the same high-value consumer people-search segment as Spokeo.
- Registry instructions are still materially cleaner than Whitepages, MyLife, CheckPeople, or Intelius.
- It likely offers a better second implementation target than lower-reach easy flows because the commercial upside is still strong.

Main technical risks:

- Current sources disagree slightly on how much email confirmation is involved, so the live flow needs a manual walkthrough before coding.
- CAPTCHA may be intermittent.
- The listing-selection step may create false positives when several near-matches appear.

Required fallback behavior:

- If listing confidence is low, do not guess. Hand off the exact broker page to the user.
- If CAPTCHA or confirmation steps block automation, route to `requires_user_action` with clear instructions and a direct broker link.

Proposed acceptance targets:

- End-to-end form submission succeeds on at least 70 percent of staging runs.
- Listing selection achieves at least 85 percent accuracy on curated test profiles.
- Successful runs capture a confirmation page, success message, or equivalent evidence artifact.
- All blocker outcomes are classified into a small stable set such as `captcha_blocked`, `listing_not_found`, `low_confidence_match`, or `confirmation_timeout`.
- "Done" for FastPeopleSearch means the system can reliably attempt the flow, capture evidence when it works, and avoid ambiguous submissions when confidence is low.

## Next-Up Detail

### That's Them

Why it belongs near the top:

- The registry instructions are unusually simple.
- It appears to avoid the phone, ID, and enterprise-login problems that sink other candidates.
- It is probably the best low-friction follow-on after the first two brokers.

What still needs validation:

- Whether the live opt-out page has undocumented CAPTCHA or extra confirmation steps
- Whether the result-selection flow is as direct as the registry implies

### SmartBackgroundChecks

Why it belongs near the top:

- The registry suggests a straightforward opt-out flow.
- It may deliver extra value if the PeopleFinders crossover note still holds.
- It looks easier than the high-friction people-search alternatives.

What still needs validation:

- Whether the PeopleFinders spillover still happens
- Whether any email confirmation or anti-bot step is missing from the current registry notes

### Nuwber

Why it belongs near the top:

- It is still a `critical` form broker with meaningful reach.
- The flow is conceptually straightforward if the profile URL can be found reliably.
- The documented email fallback gives NUKE a clean backup path.

What still needs validation:

- Whether the state filter is required for reliable disambiguation
- Whether the current form has any undocumented confirmation or anti-bot step

### FamilyTreeNow

Why it belongs near the top:

- It is a cleaner, likely lower-maintenance form candidate.
- It is less commercially flashy than Spokeo, but it is probably easier to stabilize.

What still needs validation:

- Whether the live flow has hidden confirmation or CAPTCHA requirements
- Whether search-result quality is good enough to automate without risky mis-selection

### Advanced Background Checks

Why it belongs near the top:

- Registry instructions imply a forgiving search form.
- It looks like a useful lower-risk addition once the core browser patterns are established.

What still needs validation:

- Whether the current removal confirmation is immediate or deferred
- Whether the search and removal steps remain stable enough for reliable evidence capture

## Defer / Non-Starter List

### Defer for now

| Broker | Why it should wait |
|---|---|
| Whitepages | Phone verification is a hard blocker and would push NUKE into telephony infrastructure too early. |
| MyLife | Possible account creation, driver's license handling, and phone-based alternatives create both liability and maintenance risk. |
| Intelius / PeopleConnect | Reach is strong, but the live posture looks too brittle for a first automation investment. |
| BeenVerified | The one-opt-out-per-email limit is a structural scaling problem, not just an implementation detail. |
| Radaris | Multi-step flow plus anti-bot uncertainty makes it too expensive for the initial implementation set. |

### Do not prioritize for this chunk

| Broker | Why it is not an initial commercialization target |
|---|---|
| Acxiom | Important long term, but indirect consumer visibility makes it a weaker first proof point than people-search sites. |
| ZoomInfo | B2B-oriented data set with weaker consumer-facing value. |
| LiveRamp | Marketing-data importance is real, but the user-visible payoff is weaker than top people-search coverage. |
| TruePeopleSearch | Currently modeled as `manual_link`, with CAPTCHA noted in the registry and no strong reason to move it ahead of cleaner form brokers. |

## Sign-Off Recommendation

Approve the following shortlist for Phase 3 form-automation prioritization:

- Initial set: Spokeo and FastPeopleSearch
- Next-up list: That's Them, SmartBackgroundChecks, Nuwber, FamilyTreeNow, Advanced Background Checks
- Explicit defer set: Whitepages, MyLife, Intelius / PeopleConnect, BeenVerified, and Radaris

Sign-off condition:

The team should treat this memo as the approved broker order only if everyone is comfortable with one operational assumption: inbox-dependent confirmation steps are acceptable in the initial set as long as NUKE captures strong evidence and falls back cleanly when automation cannot finish.

## Source Notes

Repo-backed source files:

- `src/lib/brokers/registry.ts`
- `prisma/seed.ts`
- `prisma/schema.prisma`
- `src/lib/removal/engine.ts`
- `README.md`
- `src/lib/reporting/metrics.ts`
- `src/lib/managed-service/service.ts`

Current external checks used on April 8, 2026:

- PeopleConnect suppression login: https://suppression.peopleconnect.us/login
- Whitepages process summary surfaced via search: https://www.lifewire.com/remove-personal-information-from-internet-3482691
- General web search checks for current Spokeo, FastPeopleSearch, BeenVerified, and related opt-out guidance

These external checks were used only to sanity-check blocker types and current flow shape. They are not a substitute for a manual browser walkthrough before implementation.
