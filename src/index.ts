import { existsSync } from "node:fs";

import { Command, Option } from "commander";

import {
  formatConnectingStops,
  formatRouteNames,
  formatRoutePlan,
  formatRouteStopCounts,
} from "./formatters.js";
import { MbtaClient } from "./mbtaClient.js";
import {
  createRoutePlan,
  findConnectingStops,
  findRoutesWithFewestStops,
  findRoutesWithMostStops,
  getRoutesWithStops,
  listSubwayRouteNames,
} from "./subwayService.js";

type PrintRouteOption = "longest" | "shortest";

interface CliOptions {
  listRoutes?: boolean;
  listConnections?: boolean;
  printRoute?: PrintRouteOption;
  planRoute?: boolean;
}

const program = new Command();

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

program
  .name("broad-mbta")
  .description("Explore MBTA subway route data.")
  .option(
    "--list-routes",
    'List all "Light Rail" and "Heavy Rail" subway routes.',
  )
  .option(
    "--list-connections",
    "List stops that connect two or more subway routes, along with those routes.",
  )
  .addOption(
    new Option(
      "--print-route <which>",
      'Print the "longest" or "shortest" subway route with its number of stops.',
    ).choices(["longest", "shortest"]),
  )
  .option("--plan-route", "List the subway routes needed to travel from START to FINISH.")
  .argument("[stops...]", "START and FINISH stop names for --plan-route")
  .action(async (stops: string[], options: CliOptions) => {
    await runCli(options, stops);
  });

async function runCli(options: CliOptions, stops: string[]): Promise<void> {
  const selectedCommandCount = [
    options.listRoutes,
    options.listConnections,
    options.planRoute,
    options.printRoute !== undefined,
  ].filter(Boolean).length;

  if (selectedCommandCount > 1) {
    throw new Error("Choose only one command at a time.");
  }

  if (!options.planRoute && stops.length > 0) {
    throw new Error(
      `Unexpected argument "${stops[0]}". Run "pnpm start --help" for usage.`,
    );
  }

  const mbtaClient = new MbtaClient();

  if (options.listRoutes) {
    const routeNames = await listSubwayRouteNames(mbtaClient);
    const output = formatRouteNames(routeNames);
    writeOutput(output);
    return;
  }

  if (options.listConnections) {
    const routesWithStops = await getRoutesWithStops(mbtaClient);
    const connectingStops = findConnectingStops(routesWithStops);
    const output = formatConnectingStops(connectingStops);
    writeOutput(output);
    return;
  }

  if (options.planRoute) {
    const [startName, finishName, extraArg] = stops;

    if (!startName || !finishName || extraArg) {
      throw new Error(
        'Usage: --plan-route START FINISH. Use quotes for names with spaces, like "Park Street".',
      );
    }

    const routesWithStops = await getRoutesWithStops(mbtaClient);
    const routePlan = createRoutePlan(routesWithStops, startName, finishName);
    const output = formatRoutePlan(routePlan);
    writeOutput(output);
    return;
  }

  if (options.printRoute) {
    const routesWithStops = await getRoutesWithStops(mbtaClient);
    const routeStopCounts =
      options.printRoute === "longest"
        ? findRoutesWithMostStops(routesWithStops)
        : findRoutesWithFewestStops(routesWithStops);
    const heading =
      options.printRoute === "longest"
        ? "Route with the most stops:"
        : "Route with the fewest stops:";

    const output = formatRouteStopCounts(heading, routeStopCounts);
    writeOutput(output);
    return;
  }

  writeOutput('Run "pnpm start --help" to see available commands.');
}

try {
  await program.parseAsync();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const errorMessage = `error: ${message}`;
  writeError(errorMessage);
  process.exitCode = 1;
}

function writeOutput(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeError(message: string): void {
  process.stderr.write(`${message}\n`);
}
