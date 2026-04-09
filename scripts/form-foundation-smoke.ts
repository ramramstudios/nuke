import {
  DEFAULT_FORM_SMOKE_TEST_BROKER,
  listFormSmokeTestBrokers,
  runFormFoundationSmokeTest,
} from "@/lib/automation/smoke-test";

interface ParsedArgs {
  brokerName?: string;
  help?: boolean;
  listBrokers?: boolean;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.listBrokers) {
    const brokers = await listFormSmokeTestBrokers();
    console.log(JSON.stringify(brokers, null, 2));
    return;
  }

  const result = await runFormFoundationSmokeTest({
    brokerName: args.brokerName,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.run.status !== "succeeded") {
    process.exitCode = 1;
  }
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
  npm run smoke:form -- --broker "Spokeo"
  npm run smoke:form -- --list-brokers

Notes:
  - This is a Playwright foundation smoke test for form brokers.
  - It opens the broker entrypoint, captures screenshots/logs, and writes artifacts.
  - It does not submit a real opt-out form.
  - Default broker: ${DEFAULT_FORM_SMOKE_TEST_BROKER}
  - Install Chromium first with: npm run automation:install-browser`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Form foundation smoke test failed";
  console.error("[nuke][form-foundation-smoke]", { error: message });
  process.exit(1);
});
