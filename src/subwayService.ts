import type { MbtaClient } from "./mbtaClient.js";
import type {
  ConnectingStop,
  RoutePlan,
  RoutePlanStep,
  RouteStopCount,
  RouteWithStops,
  SubwayRoute,
  SubwayStop,
} from "./types.js";

interface RoutePathSearchState {
  routeId: string;
  path: string[];
}

/**
 * Fetches the display names for all subway routes included in the assessment.
 */
export async function listSubwayRouteNames(
  mbtaClient: MbtaClient,
): Promise<string[]> {
  const routes = await mbtaClient.getSubwayRoutes();
  return routes.map((route) => route.longName);
}

/**
 * Fetches each subway route and the stops served by that route.
 * Stop requests are made sequentially to avoid bursting the MBTA API rate limit.
 */
export async function getRoutesWithStops(
  mbtaClient: MbtaClient,
): Promise<RouteWithStops[]> {
  const routes = await mbtaClient.getSubwayRoutes();
  const routesWithStops: RouteWithStops[] = [];

  for (const route of routes) {
    const stops = await mbtaClient.getStopsForRoute(route.id);
    routesWithStops.push({ route, stops });
  }

  return routesWithStops;
}

/**
 * Counts how many stops are served by each route.
 */
export function getRouteStopCounts(
  routesWithStops: RouteWithStops[],
): RouteStopCount[] {
  return routesWithStops.map((routeStops) => ({
    route: routeStops.route,
    stopCount: routeStops.stops.length,
  }));
}

/**
 * Finds all routes tied for the largest number of stops.
 * Returning all ties avoids arbitrarily choosing one route when counts match.
 */
export function findRoutesWithMostStops(
  routesWithStops: RouteWithStops[],
): RouteStopCount[] {
  const routeStopCounts = getRouteStopCounts(routesWithStops);

  if (routeStopCounts.length === 0) {
    return [];
  }

  const mostStops = Math.max(
    ...routeStopCounts.map((routeStopCount) => routeStopCount.stopCount),
  );

  return routeStopCounts.filter(
    (routeStopCount) => routeStopCount.stopCount === mostStops,
  );
}

/**
 * Finds all routes tied for the smallest number of stops.
 * Returning all ties keeps the result accurate if the MBTA data changes.
 */
export function findRoutesWithFewestStops(
  routesWithStops: RouteWithStops[],
): RouteStopCount[] {
  const routeStopCounts = getRouteStopCounts(routesWithStops);

  if (routeStopCounts.length === 0) {
    return [];
  }

  const fewestStops = Math.min(
    ...routeStopCounts.map((routeStopCount) => routeStopCount.stopCount),
  );

  return routeStopCounts.filter(
    (routeStopCount) => routeStopCount.stopCount === fewestStops,
  );
}

/**
 * Inverts route-stop data into stop-route data and returns stops served by
 * two or more routes.
 */
export function findConnectingStops(
  routesWithStops: RouteWithStops[],
): ConnectingStop[] {
  const stopsById = new Map<string, ConnectingStop>();

  for (const routeStops of routesWithStops) {
    for (const stop of routeStops.stops) {
      const connectingStop = stopsById.get(stop.id);

      if (connectingStop) {
        const alreadyHasRoute = connectingStop.routes.some(
          (route) => route.id === routeStops.route.id,
        );

        if (!alreadyHasRoute) {
          connectingStop.routes.push(routeStops.route);
        }

        continue;
      }

      stopsById.set(stop.id, {
        stop,
        routes: [routeStops.route],
      });
    }
  }

  return [...stopsById.values()].filter(
    (connectingStop) => connectingStop.routes.length >= 2,
  );
}

/**
 * Finds every stop ID whose stop name matches the requested name.
 * Matching is case-insensitive and ignores leading/trailing whitespace.
 */
export function findStopIdsByName(
  routesWithStops: RouteWithStops[],
  stopName: string,
): string[] {
  const normalizedStopName = normalizeStopName(stopName);
  const stopIds = new Set<string>();

  for (const routeStops of routesWithStops) {
    for (const stop of routeStops.stops) {
      if (normalizeStopName(stop.name) === normalizedStopName) {
        stopIds.add(stop.id);
      }
    }
  }

  return [...stopIds];
}

/**
 * Finds all routes that serve at least one of the provided stop IDs.
 */
export function findRoutesByStopIds(
  routesWithStops: RouteWithStops[],
  stopIds: string[],
): SubwayRoute[] {
  const stopIdSet = new Set(stopIds);
  const routesById = new Map<string, SubwayRoute>();

  for (const routeStops of routesWithStops) {
    const hasMatchingStop = routeStops.stops.some((stop) =>
      stopIdSet.has(stop.id),
    );

    if (hasMatchingStop) {
      routesById.set(routeStops.route.id, routeStops.route);
    }
  }

  return [...routesById.values()].sort((a, b) =>
    a.longName.localeCompare(b.longName),
  );
}

/**
 * Builds a route graph where each node is a route ID.
 * An edge exists when two routes share at least one connecting stop.
 */
export function buildRouteGraph(
  routesWithStops: RouteWithStops[],
): Map<string, string[]> {
  const graph = new Map<string, Set<string>>();

  for (const routeStops of routesWithStops) {
    graph.set(routeStops.route.id, new Set());
  }

  for (const connectingStop of findConnectingStops(routesWithStops)) {
    for (const route of connectingStop.routes) {
      for (const connectedRoute of connectingStop.routes) {
        if (route.id !== connectedRoute.id) {
          graph.get(route.id)?.add(connectedRoute.id);
        }
      }
    }
  }

  return new Map(
    [...graph.entries()].map(([routeId, connectedRouteIds]) => [
      routeId,
      [...connectedRouteIds].sort((a, b) => a.localeCompare(b)),
    ]),
  );
}

/**
 * Finds the shortest route-to-route path using breadth-first search.
 * The queue uses a head pointer instead of shift() to avoid reindexing the
 * array on each iteration.
 */
export function findShortestRoutePath(
  routeGraph: Map<string, string[]>,
  startRoutes: SubwayRoute[],
  finishRoutes: SubwayRoute[],
): string[] | undefined {
  const finishRouteIds = new Set(finishRoutes.map((route) => route.id));
  const visitedRouteIds = new Set<string>();
  const queue: RoutePathSearchState[] = [];

  for (const route of startRoutes) {
    if (finishRouteIds.has(route.id)) {
      return [route.id];
    }

    visitedRouteIds.add(route.id);
    queue.push({ routeId: route.id, path: [route.id] });
  }

  let head = 0;

  while (head < queue.length) {
    const current = queue[head];
    head += 1;

    if (!current) {
      continue;
    }

    for (const connectedRouteId of routeGraph.get(current.routeId) ?? []) {
      if (visitedRouteIds.has(connectedRouteId)) {
        continue;
      }

      const path = [...current.path, connectedRouteId];

      if (finishRouteIds.has(connectedRouteId)) {
        return path;
      }

      visitedRouteIds.add(connectedRouteId);
      queue.push({ routeId: connectedRouteId, path });
    }
  }

  return undefined;
}

/**
 * Plans a subway trip between two stop names and returns the required routes.
 * Throws if either stop cannot be found or no route path connects them.
 */
export function planRoute(
  routesWithStops: RouteWithStops[],
  startName: string,
  finishName: string,
): RoutePlan {
  const startStopIds = findStopIdsByName(routesWithStops, startName);
  const finishStopIds = findStopIdsByName(routesWithStops, finishName);

  if (startStopIds.length === 0) {
    throw new Error(`Could not find start stop "${startName}".`);
  }

  if (finishStopIds.length === 0) {
    throw new Error(`Could not find finish stop "${finishName}".`);
  }

  const startRoutes = findRoutesByStopIds(routesWithStops, startStopIds);
  const finishRoutes = findRoutesByStopIds(routesWithStops, finishStopIds);
  const routePathIds = findShortestRoutePath(
    buildRouteGraph(routesWithStops),
    startRoutes,
    finishRoutes,
  );

  if (!routePathIds) {
    throw new Error(`No subway route found from "${startName}" to "${finishName}".`);
  }

  const routesById = new Map(
    routesWithStops.map((routeStops) => [
      routeStops.route.id,
      routeStops.route,
    ]),
  );
  const routes = routePathIds.map((routeId) => {
    const route = routesById.get(routeId);

    if (!route) {
      throw new Error(`Route path referenced unknown route "${routeId}".`);
    }

    return route;
  });

  return {
    startStopName: startName,
    finishStopName: finishName,
    routes,
    steps: buildRoutePlanSteps(
      routesWithStops,
      routes,
      startName,
      finishName,
    ),
  };
}

/**
 * Builds itinerary-style steps from a route path by finding the shared stop
 * where each route transfer can occur.
 */
export function buildRoutePlanSteps(
  routesWithStops: RouteWithStops[],
  routes: SubwayRoute[],
  startName: string,
  finishName: string,
): RoutePlanStep[] {
  const firstRoute = routes.at(0);

  if (!firstRoute) {
    return [
      {
        kind: "arrive",
        stopName: finishName,
      },
    ];
  }

  const steps: RoutePlanStep[] = [
    {
      kind: "board",
      stopName: startName,
      route: firstRoute,
    },
  ];

  for (let routeIndex = 1; routeIndex < routes.length; routeIndex += 1) {
    const previousRoute = routes[routeIndex - 1];
    const nextRoute = routes[routeIndex];

    if (!previousRoute || !nextRoute) {
      continue;
    }

    const transferStop = findTransferStopBetweenRoutes(
      routesWithStops,
      previousRoute.id,
      nextRoute.id,
    );

    if (!transferStop) {
      throw new Error(
        `Could not find a transfer stop between "${previousRoute.longName}" and "${nextRoute.longName}".`,
      );
    }

    steps.push({
      kind: "transfer",
      stopName: transferStop.name,
      route: nextRoute,
    });
  }

  steps.push({
    kind: "arrive",
    stopName: finishName,
  });

  return steps;
}

/**
 * Finds a deterministic shared stop for transferring between two routes.
 */
export function findTransferStopBetweenRoutes(
  routesWithStops: RouteWithStops[],
  firstRouteId: string,
  secondRouteId: string,
): SubwayStop | undefined {
  const transferStops = findConnectingStops(routesWithStops)
    .filter((connectingStop) => {
      const routeIds = new Set(
        connectingStop.routes.map((route) => route.id),
      );

      return routeIds.has(firstRouteId) && routeIds.has(secondRouteId);
    })
    .map((connectingStop) => connectingStop.stop)
    .sort((a, b) => a.name.localeCompare(b.name));

  return transferStops.at(0);
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
    lines.push(
      `- ${routeStopCount.route.longName}: ${routeStopCount.stopCount} ${stopLabel}`,
    );
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
    const routeNames = connectingStop.routes
      .map((route) => route.longName)
      .sort((a, b) => a.localeCompare(b))
      .join(", ");

    lines.push(`- ${connectingStop.stop.name}: ${routeNames}`);
  }

  return lines.join("\n");
}

/**
 * Formats a route plan as itinerary-style boarding, transfer, and arrival steps.
 */
export function formatRoutePlan(routePlan: RoutePlan): string {
  const lines = [
    `Route plan from ${routePlan.startStopName} to ${routePlan.finishStopName}:`,
  ];

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
 * Normalizes user-provided and API-provided stop names for equality checks.
 */
function normalizeStopName(stopName: string): string {
  return stopName.trim().toLowerCase();
}
