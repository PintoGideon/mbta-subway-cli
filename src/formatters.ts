import type {
  ConnectingStop,
  RoutePlan,
  RouteStopCount,
} from "./types.js";

/**
 * Formats route names for CLI output.
 */
export function formatRouteNames(routeNames: string[]): string {
  const lines = ["Subway routes:"];

  for (const routeName of routeNames) {
    lines.push(`- ${routeName}`);
  }

  return lines.join("\n");
}

/**
 * Formats route stop-count results for CLI output.
 */
export function formatRouteStopCounts(
  heading: string,
  routeStopCounts: RouteStopCount[],
): string {
  const lines = [heading];

  for (const routeStopCount of routeStopCounts) {
    const stopLabel = routeStopCount.stopCount === 1 ? "stop" : "stops";
    const line = `- ${routeStopCount.route.longName}: ${routeStopCount.stopCount} ${stopLabel}`;
    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * Formats connecting stops for CLI output in deterministic alphabetical order.
 */
export function formatConnectingStops(connectingStops: ConnectingStop[]): string {
  const lines = ["Connecting stops:"];
  const sortedConnectingStops = [...connectingStops].sort((a, b) =>
    a.stop.name.localeCompare(b.stop.name),
  );

  for (const connectingStop of sortedConnectingStops) {
    const routeNames = connectingStop.routes.map((route) => route.longName);
    const sortedRouteNames = routeNames.sort((a, b) => a.localeCompare(b));
    const routeList = sortedRouteNames.join(", ");

    lines.push(`- ${connectingStop.stop.name}: ${routeList}`);
  }

  return lines.join("\n");
}

/**
 * Formats a route plan as route summary plus itinerary-style steps.
 */
export function formatRoutePlan(routePlan: RoutePlan): string {
  const lines = [
    `Route plan from ${routePlan.startStopName} to ${routePlan.finishStopName}:`,
  ];
  const routeNames = routePlan.routes.map((route) => route.longName);
  const routeList = routeNames.join(", ");

  if (routeList) {
    lines.push(`Routes: ${routeList}`);
  }

  for (const step of routePlan.steps) {
    if (step.kind === "board") {
      lines.push(`- Board ${step.route.longName} at ${step.stopName}`);
      continue;
    }

    if (step.kind === "transfer") {
      lines.push(`- Transfer to ${step.route.longName} at ${step.stopName}`);
      continue;
    }

    lines.push(`- Arrive at ${step.stopName}`);
  }

  return lines.join("\n");
}
