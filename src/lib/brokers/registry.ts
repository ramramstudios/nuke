/**
 * Broker Registry — static seed data for the broker list.
 *
 * Each entry defines how NUKE searches for and removes data from a broker.
 * In production this lives in the DB (Broker model); this seed list
 * bootstraps the database and serves as a reference for the dispatcher.
 */

export type BrokerPriority = "critical" | "high" | "standard";

export interface BrokerSeed {
  name: string;
  domain: string;
  /** Additional domains this broker may send replies from. */
  aliasDomains?: string[];
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
  priority?: BrokerPriority;
  active?: boolean;
  optOutInstructions?: string;
  notes?: string;
}

function steps(...lines: string[]): string {
  return lines.join("\n");
}

/**
 * Build a map from alias domain → broker name for all seeds with aliasDomains.
 * Used by the inbound matcher to recognize replies from alternate broker domains.
 */
export function buildBrokerAliasDomainMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const seed of BROKER_SEEDS) {
    if (seed.aliasDomains) {
      for (const alias of seed.aliasDomains) {
        map.set(alias.toLowerCase(), seed.name);
      }
    }
    map.set(seed.domain.toLowerCase(), seed.name);
  }
  return map;
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
    priority: "critical",
    optOutInstructions: steps(
      "Find your listing.",
      "Copy the profile URL.",
      "Submit the URL and your email on the opt-out form.",
      "Scroll to the 'opt out your information' section.",
      "Required: click the confirmation link sent by email.",
      "Note: data may still appear in paid results after removal."
    ),
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
    priority: "critical",
    optOutInstructions: steps(
      "Find your information through the people-search or property-search flow.",
      "Submit the opt-out.",
      "Limit: one opt-out per email address.",
      "For additional removals, contact them by email.",
      "Required: click the confirmation link sent by email."
    ),
  },
  {
    name: "CheckPeople",
    domain: "checkpeople.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://checkpeople.com/opt-out",
    slaInDays: 45,
    tier: 1,
    priority: "critical",
    optOutInstructions: steps(
      "Go to the Right to Know section on the privacy page and request a copy of your data.",
      "If data exists, proceed to the opt-out form.",
      "Required: provide your birthdate and full legal name."
    ),
    notes: "The Right to Know flow starts at https://checkpeople.com/privacy-rights.",
  },
  {
    name: "ClustrMaps",
    domain: "clustrmaps.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://clustrmaps.com/bl/opt-out",
    slaInDays: 45,
    tier: 1,
    priority: "critical",
    optOutInstructions: steps(
      "Find your listing.",
      "Select removal.",
      "Required: check off all associated data you want removed."
    ),
  },
  {
    name: "Whitepages",
    domain: "whitepages.com",
    aliasDomains: ["411.com"],
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.whitepages.com/suppression_requests",
    slaInDays: 30,
    tier: 2,
    priority: "critical",
    optOutInstructions: steps(
      "Find your listing.",
      "Submit the opt-out.",
      "Required: provide a phone number, receive the automated call, and enter the opt-out code.",
      "Alternative: use the request form if needed.",
      "Also check Whitepages Premium and 411.com because the listing may persist there."
    ),
    notes:
      "Support alternatives include the Whitepages help article and request form if the main suppression flow fails.",
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
    optOutInstructions: steps(
      "Enter your name, city, state, and email.",
      "Solve the required captchas.",
      "Remove the listing if it appears."
    ),
  },
  {
    name: "TruePeopleSearch.net",
    domain: "truepeoplesearch.net",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint:
      "https://docs.google.com/forms/d/e/1FAIpQLSeCPggzv4iXE20iUjcr6vdVWxBOblCyGwDLcO-jZA5j2YF5fQ/viewform",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Search for your listing on truepeoplesearch.net/search.",
      "Close extra pages the site opens and avoid sponsored links.",
      "If your information appears, submit the form with the profile URL and the requested additional information."
    ),
  },
  {
    name: "FastPeopleSearch",
    domain: "fastpeoplesearch.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.fastpeoplesearch.com/optout",
    slaInDays: 45,
    tier: 1,
    priority: "high",
    optOutInstructions: steps(
      "Search for your listing.",
      "Submit the opt-out.",
      "You may need to solve a captcha."
    ),
  },
  {
    name: "Intelius",
    domain: "intelius.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://suppression.peopleconnect.us/login",
    slaInDays: 45,
    tier: 1,
    priority: "critical",
    optOutInstructions: steps(
      "Find your record.",
      "Opt out via the online form, support@mailer.intelius.com, or 1-888-245-1655.",
      "If they cannot find your record, you may need to confirm identifying details such as address, phone number, or old emails by email."
    ),
    notes:
      "Current consumer suppression is routed through the PeopleConnect flow rather than the older intelius.com opt-out page.",
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
    active: false,
    notes:
      "Excluded pending verification. PeopleConnect ownership suggests USSearch may require a verified suppression flow instead of a simple privacy mailbox.",
  },
  {
    name: "USPhoneBook",
    domain: "usphonebook.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.usphonebook.com/opt-out/",
    slaInDays: 45,
    tier: 1,
    priority: "high",
    optOutInstructions: steps(
      "Search for the phone number.",
      "Submit the opt-out."
    ),
  },
  {
    name: "United States Phone Book",
    domain: "unitedstatesphonebook.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint: "https://www.unitedstatesphonebook.com/contact.php",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Search for the listing.",
      "If the address is listed, enter the listed phone number and ZIP code on the contact page to request removal."
    ),
  },
  {
    name: "Radaris",
    domain: "radaris.com",
    category: "people_search",
    searchMethod: "scrape",
    removalMethod: "form",
    removalEndpoint: "https://radaris.com/control-privacy",
    slaInDays: 45,
    tier: 1,
    priority: "critical",
    optOutInstructions: steps(
      "Preferred: if the listing has a View Profile button, copy the profile URL and complete the multi-step forms.",
      "Fallback: if there is no profile button, copy the text or take a screenshot and email customer-service@radaris.com.",
      "If Radaris redirects you back to the form, keep replying until removal is confirmed."
    ),
  },
  {
    name: "MyLife",
    domain: "mylife.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.mylife.com/privacyrequest",
    slaInDays: 45,
    tier: 2,
    priority: "critical",
    optOutInstructions: steps(
      "Find your profile and submit the opt-out request.",
      "Alternative: email privacy@mylife.com with your name and profile link.",
      "Complication: they may require account creation and a driver's license.",
      "Complication: they may require a phone call to (888) 704-1900.",
      "Older phone-only flow may ask for name, age, date of birth, email, and current and past addresses."
    ),
  },
  {
    name: "Nuwber",
    domain: "nuwber.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://nuwber.com/removal/link",
    slaInDays: 45,
    tier: 1,
    priority: "critical",
    optOutInstructions: steps(
      "Find your listing and use filter by state to isolate the correct profile URL.",
      "Submit the removal form using the profile URL.",
      "If the form fails, take a screenshot and email support@nuwber.com requesting removal."
    ),
  },
  {
    name: "PublicDataUSA",
    domain: "publicdatausa.com",
    category: "data_broker",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://publicdatausa.com/optout/",
    slaInDays: 45,
    tier: 1,
    priority: "critical",
    optOutInstructions: steps(
      "Find your record.",
      "Select the specific data to remove, including vehicles or donations if present.",
      "Submit the opt-out.",
      "Required: confirm by email.",
      "Restriction: use a recognized email provider such as Gmail, Outlook, or Yahoo."
    ),
  },
  {
    name: "SmartBackgroundChecks",
    domain: "smartbackgroundchecks.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.smartbackgroundchecks.com/optout",
    slaInDays: 45,
    tier: 1,
    priority: "critical",
    optOutInstructions: steps(
      "Find your listing.",
      "Submit the opt-out.",
      "This may also remove data from PeopleFinders."
    ),
  },
  {
    name: "That's Them",
    domain: "thatsthem.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://thatsthem.com/optout",
    slaInDays: 45,
    tier: 1,
    priority: "critical",
    optOutInstructions: steps(
      "Find your listing.",
      "Submit the opt-out if the record is present.",
      "Avoid paid identity-protection links."
    ),
  },
  {
    name: "Advanced Background Checks",
    domain: "advancedbackgroundchecks.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.advancedbackgroundchecks.com/removal",
    slaInDays: 45,
    tier: 1,
    priority: "high",
    optOutInstructions: steps(
      "Search for your listing. City, state, and age can be left blank.",
      "If your information appears, remove the data."
    ),
  },
  {
    name: "FamilyTreeNow",
    domain: "familytreenow.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.familytreenow.com/optout",
    slaInDays: 45,
    tier: 1,
    priority: "high",
    optOutInstructions: steps(
      "Search for your listing.",
      "Submit the removal request."
    ),
  },
  {
    name: "Cyber Background Checks",
    domain: "cyberbackgroundchecks.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.cyberbackgroundchecks.com/removal",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Search for your information.",
      "Submit the opt-out."
    ),
  },
  {
    name: "FreePeopleDirectory",
    domain: "freepeopledirectory.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint: "https://www.spokeo.com/optout",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Search for your listing.",
      "If it appears, use Spokeo's opt-out page to remove it.",
      "Scroll to the 'opt out your information' section."
    ),
  },
  {
    name: "InfoTracer",
    domain: "infotracer.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://infotracer.com/optout/",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Find your information.",
      "Submit the opt-out form.",
      "Alternative: mail or fax the alternate form to 1-617-933-9946."
    ),
  },
  {
    name: "NeighborReport",
    domain: "neighbor.report",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://neighbor.report/remove",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Search by name, address, or phone number.",
      "Remove the listing.",
      "Required: verify the request by email."
    ),
  },
  {
    name: "PeopleByName",
    domain: "peoplebyname.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.peoplebyname.com/remove.php",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Search for your listing or construct the URL manually with last and first name.",
      "Submit the opt-out for each record individually."
    ),
  },
  {
    name: "PeopleSearchNow",
    domain: "peoplesearchnow.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.peoplesearchnow.com/opt-out",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Find your listing.",
      "Submit the opt-out."
    ),
  },
  {
    name: "PrivateEye",
    domain: "privateeye.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint: "https://www.privateeye.com/removal",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Search for the listing.",
      "Start the opt-out.",
      "When you receive the record-removal link, complete that form."
    ),
  },
  {
    name: "PrivateRecords",
    domain: "privaterecords.net",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint:
      "https://www.privaterecords.net/api/helper/optOutLight/search",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Search by name and state.",
      "Submit the opt-out."
    ),
  },
  {
    name: "PropertyRecs",
    domain: "propertyrecs.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://dashboard.propertyrecs.com/opt-out",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Search by name and state through the opt-out page.",
      "Submit removal if the listing is present."
    ),
  },
  {
    name: "Rehold",
    domain: "rehold.com",
    category: "people_search",
    searchMethod: "scrape",
    removalMethod: "manual_link",
    removalEndpoint: "https://rehold.com/",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Search for the address.",
      "Click the red remove button next to the entry you want removed.",
      "Provide your name and email and solve the captcha."
    ),
  },
  {
    name: "SearchPeopleFree",
    domain: "searchpeoplefree.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.searchpeoplefree.com/opt-out",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Search by name, phone number, address, and email address.",
      "Submit the opt-out."
    ),
  },
  {
    name: "SearchQuarry",
    domain: "searchquarry.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://members.searchquarry.com/removeMyData/",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Search for your listing.",
      "Submit the opt-out.",
      "Required: click the email verification link to finalize the request."
    ),
  },
  {
    name: "SpyFly",
    domain: "spyfly.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.spyfly.com/help-center/remove-my-public-record",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Search for the listing.",
      "Submit the opt-out, or email support@spyfly.com.",
      "Required: provide your name, age, address, and email only if the site already has that information."
    ),
  },
  {
    name: "UnMask",
    domain: "unmask.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://unmask.com/opt-out/",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Search for your listing.",
      "Submit the opt-out form with your name, city, and state.",
      "Required: email confirmation and captchas."
    ),
  },
  {
    name: "USA People Search",
    domain: "usa-people-search.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://www.usa-people-search.com/removal",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Find your listing.",
      "Remove your information."
    ),
  },
  {
    name: "USA Official",
    domain: "usa-official.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://usa-official.com/optout",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Find your listing and remove it on the opt-out page."
    ),
  },
  {
    name: "Veripages",
    domain: "veripages.com",
    category: "people_search",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://veripages.com/inner/control-privacy",
    slaInDays: 45,
    tier: 1,
    optOutInstructions: steps(
      "Submit the profile URL, your name, and your email.",
      "Solve the captcha.",
      "Confirm the request by email."
    ),
  },
  {
    name: "VoterRecords",
    domain: "voterrecords.com",
    category: "other",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint: "https://voterrecords.com/",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Find the listing.",
      "Scroll to the bottom of the record and click the record opt-out link.",
      "Submit the form.",
      "You may need to verify by email."
    ),
  },

  // ─── Other Search / Manual Removal Sites ──────────────
  {
    name: "Ancestry.com",
    domain: "ancestry.com",
    category: "other",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint: "https://support.ancestry.com/s/reportissue?language=en_US",
    slaInDays: 45,
    tier: 2,
    priority: "high",
    optOutInstructions: steps(
      "Create a free account, not a free trial.",
      "Search records from the sidebar and copy the relevant URLs, even if they lead to a sales page.",
      "Email the URLs to privacy@ancestry.com, or submit them through the content-removal form."
    ),
  },
  {
    name: "Archives",
    domain: "archives.com",
    category: "other",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint: "https://www.archives.com/Optout",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Sign up for the free trial to search for your data.",
      "If you find your information, opt out.",
      "Cancel the trial."
    ),
  },
  {
    name: "Classmates.com",
    domain: "classmates.com",
    category: "other",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint:
      "https://help.classmates.com/hc/en-us/articles/115002224171-How-can-I-cancel-my-membership-",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Cancel the membership, whether it is free or paid."
    ),
  },
  {
    name: "Facecheck",
    domain: "facecheck.id",
    category: "other",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint: "https://facecheck.id/Face-Search/RemoveMyPhotos",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Upload your image to find matches.",
      "To remove searchability, upload an ID with sensitive data hidden or a selfie with the required gesture.",
      "This removes searchability on Facecheck, not the source images."
    ),
  },
  {
    name: "FamilySearch",
    domain: "familysearch.org",
    category: "other",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint:
      "https://submit-irm.trustarc.com/services/validation/b8d6e704-e5b1-42a0-9f86-bbdec35939a1",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Create a free account and search the historical records.",
      "Copy the URLs for the records you want removed.",
      "Submit the opt-out form.",
      "Required: verify your email address."
    ),
  },
  {
    name: "PimEyes",
    domain: "pimeyes.com",
    category: "other",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint: "https://pimeyes.com/en/opt-out-request-form",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Upload a face image to find matches.",
      "Upload an ID with sensitive information blurred.",
      "Provide your email address."
    ),
  },
  {
    name: "Searchbug",
    domain: "searchbug.com",
    category: "other",
    searchMethod: "url_pattern",
    removalMethod: "manual_link",
    removalEndpoint: "https://www.searchbug.com/contact-us.aspx",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Searching requires an account and credit card, although the first search is free.",
      "Request removal through the contact form or chat, by phone or text at (760) 454-7301, or by fax at (760) 454-7341."
    ),
  },
  {
    name: "Social Catfish",
    domain: "socialcatfish.com",
    category: "other",
    searchMethod: "url_pattern",
    removalMethod: "form",
    removalEndpoint: "https://socialcatfish.com/opt-out/",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Find the listings and record the relevant URLs.",
      "Submit the removal form with the URLs and your email.",
      "Required: confirm the request by email."
    ),
  },
  {
    name: "ZoomInfo",
    domain: "zoominfo.com",
    category: "data_broker",
    searchMethod: "api",
    removalMethod: "form",
    removalEndpoint: "https://privacyrequest.zoominfo.com/remove/verify",
    slaInDays: 45,
    tier: 2,
    optOutInstructions: steps(
      "Use the form to check whether ZoomInfo has your data.",
      "If data is present, receive the email code and complete the opt-out."
    ),
  },

  // ─── Data Brokers / Aggregators ───────────────────────
  {
    name: "Acxiom",
    domain: "acxiom.com",
    category: "data_broker",
    searchMethod: "api",
    removalMethod: "form",
    removalEndpoint: "https://www.acxiom.com/optout/",
    slaInDays: 45,
    tier: 1,
    priority: "high",
    optOutInstructions: steps(
      "Use the regional privacy portals when available.",
      "Users in Austria, Germany, India, and Switzerland can email Datenschutz@acxiom.com.",
      "If you do not have email, call (877) 774-2094."
    ),
    notes:
      "Regional consumer portals also exist for France, Italy, Spain, and international requests via the OneTrust rights portal.",
  },
  {
    name: "Oracle Data Cloud",
    domain: "oracle.com",
    category: "data_broker",
    searchMethod: "api",
    removalMethod: "manual_link",
    removalEndpoint: "https://www.oracle.com/legal/privacy/privacy-choices/",
    slaInDays: 45,
    tier: 1,
    notes:
      "Oracle's current privacy page directs users to the Privacy Choices inquiry flow instead of the bounced privacy-inquiries_ww@oracle.com mailbox.",
  },
  {
    name: "Epsilon",
    domain: "epsilon.com",
    aliasDomains: ["epsilondata.com", "publicisgroupe.com"],
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
    removalEndpoint: "https://consumer.risk.lexisnexis.com/request",
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
    active: false,
    notes:
      "Datalogix is retired and was acquired by Oracle; the datalogix.com domain no longer resolves for consumer requests.",
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
    aliasDomains: ["fullcontact.io"],
    category: "analytics",
    searchMethod: "api",
    removalMethod: "email",
    removalEndpoint: "privacy@fullcontact.com",
    slaInDays: 30,
    tier: 2,
  },
];
