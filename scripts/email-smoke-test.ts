import {
  DEFAULT_SMOKE_TEST_BROKER,
  listEmailSmokeTestBrokers,
  runEmailSmokeTest,
} from "@/lib/removal/smoke-test";

interface ParsedArgs {
  brokerName?: string;
  help?: boolean;
  listBrokers?: boolean;
  userEmail?: string;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.listBrokers) {
    const brokers = await listEmailSmokeTestBrokers();
    console.log(JSON.stringify(brokers, null, 2));
    return;
  }

  if (!args.userEmail) {
    throw new Error(
      "Provide --user <email> for an existing onboarded account, or run with --help."
    );
  }

  const result = await runEmailSmokeTest({
    userEmail: args.userEmail,
    brokerName: args.brokerName,
  });

  console.log(JSON.stringify(result, null, 2));
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    switch (current) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--list-brokers":
        args.listBrokers = true;
        break;
      case "--user":
        args.userEmail = argv[i + 1];
        i += 1;
        break;
      case "--broker":
        args.brokerName = argv[i + 1];
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run smoke:email -- --user <email> [--broker "PeopleFinder"]
  npm run smoke:email -- --list-brokers

Notes:
  - Requires EMAIL_DELIVERY_MODE=resend or EMAIL_DELIVERY_MODE=gmail-smtp
  - Resend requires EMAIL_FROM and RESEND_API_KEY
  - Gmail SMTP requires GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD
  - Uses an existing onboarded user profile and sends one live broker email
  - Default broker: ${DEFAULT_SMOKE_TEST_BROKER}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Smoke test failed";
  console.error("[nuke][email-smoke-test]", { error: message });
  process.exit(1);
});
