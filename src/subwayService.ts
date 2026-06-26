import type { MbtaClient } from "./mbtaClient.js";
import type {
  ConnectingStop,
  RoutePlan,
  RoutePlanStep,
  RouteStopCount,
  RouteWithStops,
  SubwayNetwork,
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
  const routeNames = routes.map((route) => route.longName);
  const sortedRouteNames = routeNames.sort((a, b) => a.localeCompare(b));

  return sortedRouteNames;
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
 * Builds the in-memory subway network used by route planning.
 * Example: { routesWithStops, connectingStops, routeGraph, routesById }
 */
export function buildSubwayNetwork(
  routesWithStops: RouteWithStops[],
): SubwayNetwork {
  const connectingStops = findConnectingStops(routesWithStops);
  const routeGraph = buildRouteGraph(routesWithStops, connectingStops);
  const routeEntries = routesWithStops.map((routeWithStops) => [
    routeWithStops.route.id,
    routeWithStops.route,
  ] as const);
  const routesById = new Map(routeEntries);

  return {
    routesWithStops,
    connectingStops,
    routeGraph,
    routesById,
  };
}

/**
 * Counts how many stops are served by each route.
 */
export function getRouteStopCounts(
  routesWithStops: RouteWithStops[],
): RouteStopCount[] {
  const routeStopCounts = routesWithStops.map((routeStops) => ({
    route: routeStops.route,
    stopCount: routeStops.stops.length,
  }));

  return routeStopCounts;
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

  const routesWithMostStops = routeStopCounts.filter(
    (routeStopCount) => routeStopCount.stopCount === mostStops,
  );

  return routesWithMostStops;
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

  const routesWithFewestStops = routeStopCounts.filter(
    (routeStopCount) => routeStopCount.stopCount === fewestStops,
  );

  return routesWithFewestStops;
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

  const stopsWithRoutes = [...stopsById.values()];
  const connectingStops = stopsWithRoutes.filter(
    (connectingStop) => connectingStop.routes.length >= 2,
  );

  return connectingStops;
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

  const matchingStopIds = [...stopIds];
  return matchingStopIds;
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

  const routes = [...routesById.values()];
  const sortedRoutes = routes.sort((a, b) =>
    a.longName.localeCompare(b.longName),
  );

  return sortedRoutes;
}

/**
 * Builds a route graph where each node is a route ID.
 * An edge exists when two routes share at least one connecting stop.
 * Example: Map { "Red" => ["Green-B", "Orange"] }
 */
export function buildRouteGraph(
  routesWithStops: RouteWithStops[],
  connectingStops = findConnectingStops(routesWithStops),
): Map<string, string[]> {
  const routeGraph = new Map<string, Set<string>>();

  for (const routeWithStops of routesWithStops) {
    routeGraph.set(routeWithStops.route.id, new Set());
  }

  for (const connection of connectingStops) {
    const routesAtConnection = connection.routes;

    for (
      let routeIndex = 0;
      routeIndex < routesAtConnection.length;
      routeIndex += 1
    ) {
      for (
        let destinationRouteIndex = routeIndex + 1;
        destinationRouteIndex < routesAtConnection.length;
        destinationRouteIndex += 1
      ) {
        const sourceRoute = routesAtConnection[routeIndex];
        const destinationRoute = routesAtConnection[destinationRouteIndex];

        if (!sourceRoute || !destinationRoute) {
          continue;
        }

        routeGraph.get(sourceRoute.id)?.add(destinationRoute.id);
        routeGraph.get(destinationRoute.id)?.add(sourceRoute.id);
      }
    }
  }

  const sortedRouteGraph = new Map<string, string[]>();

  for (const [routeId, connectedRouteIds] of routeGraph.entries()) {
    const sortedConnectedRouteIds = [...connectedRouteIds].sort((a, b) =>
      a.localeCompare(b),
    );

    sortedRouteGraph.set(routeId, sortedConnectedRouteIds);
  }

  return sortedRouteGraph;
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
 * Example: { startStopName, finishStopName, routes, steps }
 */
export function planRoute(
  routesWithStops: RouteWithStops[],
  startName: string,
  finishName: string,
): RoutePlan {
  const subwayNetwork = buildSubwayNetwork(routesWithStops);
  const startStopIds = findStopIdsByName(
    subwayNetwork.routesWithStops,
    startName,
  );
  const finishStopIds = findStopIdsByName(
    subwayNetwork.routesWithStops,
    finishName,
  );

  if (startStopIds.length === 0) {
    throw new Error(`Could not find start stop "${startName}".`);
  }

  if (finishStopIds.length === 0) {
    throw new Error(`Could not find finish stop "${finishName}".`);
  }

  const startRoutes = findRoutesByStopIds(
    subwayNetwork.routesWithStops,
    startStopIds,
  );
  const finishRoutes = findRoutesByStopIds(
    subwayNetwork.routesWithStops,
    finishStopIds,
  );
  const routePathIds = findShortestRoutePath(
    subwayNetwork.routeGraph,
    startRoutes,
    finishRoutes,
  );

  if (!routePathIds) {
    throw new Error(`No subway route found from "${startName}" to "${finishName}".`);
  }

  const routes = routePathIds.map((routeId) => {
    const route = subwayNetwork.routesById.get(routeId);

    if (!route) {
      throw new Error(`Route path referenced unknown route "${routeId}".`);
    }

    return route;
  });

  const steps = buildRoutePlanSteps(
    subwayNetwork.connectingStops,
    routes,
    startName,
    finishName,
  );

  return {
    startStopName: startName,
    finishStopName: finishName,
    routes,
    steps,
  };
}

/**
 * Builds itinerary-style steps from a route path by finding the shared stop
 * where each route transfer can occur.
 */
export function buildRoutePlanSteps(
  connectingStops: ConnectingStop[],
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

    const transferStop = findTransferStopInConnections(
      connectingStops,
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
  const connectingStops = findConnectingStops(routesWithStops);
  const transferStop = findTransferStopInConnections(
    connectingStops,
    firstRouteId,
    secondRouteId,
  );

  return transferStop;
}

function findTransferStopInConnections(
  connectingStops: ConnectingStop[],
  firstRouteId: string,
  secondRouteId: string,
): SubwayStop | undefined {
  const transferStops = connectingStops.filter((connectingStop) => {
    const routeIds = new Set(
      connectingStop.routes.map((route) => route.id),
    );

    return routeIds.has(firstRouteId) && routeIds.has(secondRouteId);
  });
  const transferStopOptions = transferStops.map(
    (connectingStop) => connectingStop.stop,
  );
  const sortedTransferStopOptions = transferStopOptions.sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return sortedTransferStopOptions.at(0);
}

/**
 * Normalizes user-provided and API-provided stop names for equality checks.
 */
function normalizeStopName(stopName: string): string {
  return stopName.trim().toLowerCase();
}
