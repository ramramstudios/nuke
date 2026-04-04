/**
 * Broker Registry — static seed data for the MVP broker list.
 *
 * Each entry defines how NUKE searches for and removes data from a broker.
 * In production this lives in the DB (Broker model); this seed list
 * bootstraps the database and serves as a reference for the dispatcher.
 */

export interface BrokerSeed {
  name: string;
  domain: string;
  category:
    | "people_search"
    | "marketing"
    | "analytics"
    | "data_broker"
    | "other";
  searchMethod: "url_pattern" | "api" | "scrape";
  removalMethod: "api" | "form" | "email" | "manual_link";
  removalEndpoint: string | null;
  slaInDays: number;
  tier: 1 | 2;
  notes?: string;
}

export const BROKER_SEEDS: BrokerSeed[] = [
  // ─── People Search Sites ──────────────────────────────
  {
    name: "Spokeo",
    domain: "spokeo.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.spokeo.com/optout",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "BeenVerified",
    domain: "beenverified.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.beenverified.com/app/optout/search",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "Whitepages",
    domain: "whitepages.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.whitepages.com/suppression-requests",
    slaInDays: 30,
    tier: 1,
  },
  {
    name: "PeopleFinders",
    domain: "peoplefinders.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.peoplefinders.com/opt-out",
    slaInDays: 45,
    tier: 1,
    notes:
      "Consumer suppression starts at the PeopleFinders opt-out form and requires email verification; not a direct privacy mailbox.",
  },
  {
    name: "TruePeopleSearch",
    domain: "truepeoplesearch.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint: "https://www.truepeoplesearch.com/removal",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "FastPeopleSearch",
    domain: "fastpeoplesearch.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint: "https://www.fastpeoplesearch.com/removal",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "Intelius",
    domain: "intelius.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.intelius.com/opt-out",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "USSearch",
    domain: "ussearch.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "email",
    removalEndpoint: "privacy@ussearch.com",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "Radaris",
    domain: "radaris.com",
    category: "people_search",
    searchMethod: "scrape",
    removalMethod: "form",
    removalEndpoint: "https://radaris.com/control/privacy",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "MyLife",
    domain: "mylife.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "email",
    removalEndpoint: "privacy@mylife.com",
    slaInDays: 45,
    tier: 1,
  },

  // ─── Data Brokers / Aggregators ───────────────────────
  {
    name: "Acxiom",
    domain: "acxiom.com",
    category: "data_broker",
    searchMethod: "api",
    removalMethod: "form",
    removalEndpoint: "https://isapps.acxiom.com/optout/optout.aspx",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "Oracle Data Cloud",
    domain: "oracle.com",
    category: "data_broker",
    searchMethod: "api",
    removalMethod: "email",
    removalEndpoint: "privacy-inquiries_ww@oracle.com",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "Epsilon",
    domain: "epsilon.com",
    category: "data_broker",
    searchMethod: "api",
    removalMethod: "email",
    removalEndpoint: "privacy@epsilon.com",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "CoreLogic",
    domain: "corelogic.com",
    category: "data_broker",
    searchMethod: "api",
    removalMethod: "form",
    removalEndpoint:
      "https://www.corelogic.com/privacy/consumer-request-form/",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "LexisNexis",
    domain: "lexisnexis.com",
    category: "data_broker",
    searchMethod: "api",
    removalMethod: "form",
    removalEndpoint:
      "https://consumer.risk.lexisnexis.com/request",
    slaInDays: 45,
    tier: 1,
  },

  // ─── Marketing / Analytics ────────────────────────────
  {
    name: "Datalogix",
    domain: "datalogix.com",
    category: "marketing",
    searchMethod: "api",
    removalMethod: "email",
    removalEndpoint: "privacy@datalogix.com",
    slaInDays: 45,
    tier: 2,
  },
  {
    name: "LiveRamp",
    domain: "liveramp.com",
    category: "marketing",
    searchMethod: "api",
    removalMethod: "form",
    removalEndpoint: "https://liveramp.com/opt_out/",
    slaInDays: 45,
    tier: 1,
  },
  {
    name: "TowerData",
    domain: "towerdata.com",
    category: "marketing",
    searchMethod: "api",
    removalMethod: "email",
    removalEndpoint: "privacy@towerdata.com",
    slaInDays: 45,
    tier: 2,
  },
  {
    name: "Clearbit",
    domain: "clearbit.com",
    category: "analytics",
    searchMethod: "api",
    removalMethod: "form",
    removalEndpoint: "https://dashboard.clearbit.com/privacy-request",
    slaInDays: 30,
    tier: 2,
  },
  {
    name: "FullContact",
    domain: "fullcontact.com",
    category: "analytics",
    searchMethod: "api",
    removalMethod: "email",
    removalEndpoint: "privacy@fullcontact.com",
    slaInDays: 30,
    tier: 2,
  },
];
