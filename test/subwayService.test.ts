import { describe, expect, it } from "vitest";
import {
  buildRouteGraph,
  findConnectingStops,
  findRoutesByStopIds,
  findRoutesWithFewestStops,
  findRoutesWithMostStops,
  findStopIdsByName,
  formatConnectingStops,
  formatRoutePlan,
  planRoute,
} from "../src/subwayService.js";
import type { RouteWithStops, SubwayRoute } from "../src/types.js";

const redLine: SubwayRoute = {
  id: "Red",
  longName: "Red Line",
  type: 1,
};
const greenBLine: SubwayRoute = {
  id: "Green-B",
  longName: "Green Line B",
  type: 0,
};
const orangeLine: SubwayRoute = {
  id: "Orange",
  longName: "Orange Line",
  type: 1,
};
const blueLine: SubwayRoute = {
  id: "Blue",
  longName: "Blue Line",
  type: 1,
};

const routesWithStops: RouteWithStops[] = [
  {
    route: redLine,
    stops: [
      { id: "alewife", name: "Alewife" },
      { id: "park-street", name: "Park Street" },
      { id: "downtown-crossing", name: "Downtown Crossing" },
    ],
  },
  {
    route: greenBLine,
    stops: [
      { id: "park-street", name: "Park Street" },
      { id: "copley", name: "Copley" },
      { id: "saint-paul-green", name: "Saint Paul Street" },
    ],
  },
  {
    route: orangeLine,
    stops: [
      { id: "downtown-crossing", name: "Downtown Crossing" },
      { id: "state", name: "State" },
    ],
  },
  {
    route: blueLine,
    stops: [
      { id: "state", name: "State" },
      { id: "aquarium", name: "Aquarium" },
      { id: "saint-paul-blue", name: "Saint Paul Street" },
    ],
  },
];

describe("subway service", () => {
  it("finds routes tied for most and fewest stops", () => {
    const mostStops = findRoutesWithMostStops(routesWithStops);
    const fewestStops = findRoutesWithFewestStops(routesWithStops);

    expect(mostStops.map((routeStopCount) => routeStopCount.route.id)).toEqual([
      "Red",
      "Green-B",
      "Blue",
    ]);
    expect(mostStops.map((routeStopCount) => routeStopCount.stopCount)).toEqual([
      3,
      3,
      3,
    ]);
    expect(fewestStops).toEqual([
      {
        route: orangeLine,
        stopCount: 2,
      },
    ]);
  });

  it("finds connecting stops by shared stop ID, not by display name alone", () => {
    const connectingStops = findConnectingStops(routesWithStops);

    expect(connectingStops.map((connection) => connection.stop.name)).toEqual([
      "Park Street",
      "Downtown Crossing",
      "State",
    ]);
    expect(
      connectingStops.some(
        (connection) => connection.stop.name === "Saint Paul Street",
      ),
    ).toBe(false);
  });

  it("formats connecting stops in deterministic alphabetical order", () => {
    const output = formatConnectingStops(findConnectingStops(routesWithStops));

    expect(output).toBe(
      [
        "Connecting stops:",
        "- Downtown Crossing: Orange Line, Red Line",
        "- Park Street: Green Line B, Red Line",
        "- State: Blue Line, Orange Line",
      ].join("\n"),
    );
  });

  it("matches stop names case-insensitively and finds routes for stop IDs", () => {
    const stopIds = findStopIdsByName(routesWithStops, "  aLeWiFe ");
    const routes = findRoutesByStopIds(routesWithStops, stopIds);

    expect(stopIds).toEqual(["alewife"]);
    expect(routes).toEqual([redLine]);
  });

  it("builds a route graph and plans the shortest route sequence with transfer stops", () => {
    const graph = buildRouteGraph(routesWithStops);
    const routePlan = planRoute(routesWithStops, "Alewife", "Aquarium");

    expect(graph.get("Red")).toEqual(["Green-B", "Orange"]);
    expect(graph.get("Orange")).toEqual(["Blue", "Red"]);
    expect(routePlan.routes.map((route) => route.id)).toEqual([
      "Red",
      "Orange",
      "Blue",
    ]);
    expect(routePlan.steps).toEqual([
      {
        kind: "board",
        stopName: "Alewife",
        route: redLine,
      },
      {
        kind: "transfer",
        stopName: "Downtown Crossing",
        route: orangeLine,
      },
      {
        kind: "transfer",
        stopName: "State",
        route: blueLine,
      },
      {
        kind: "arrive",
        stopName: "Aquarium",
      },
    ]);
    expect(formatRoutePlan(routePlan)).toBe(
      [
        "Route plan from Alewife to Aquarium:",
        "- Board Red Line at Alewife",
        "- Transfer to Orange Line at Downtown Crossing",
        "- Transfer to Blue Line at State",
        "- Arrive at Aquarium",
      ].join("\n"),
    );
  });

  it("formats same-route plans without unnecessary transfers", () => {
    const routePlan = planRoute(routesWithStops, "Alewife", "Downtown Crossing");

    expect(routePlan.routes.map((route) => route.id)).toEqual(["Red"]);
    expect(formatRoutePlan(routePlan)).toBe(
      [
        "Route plan from Alewife to Downtown Crossing:",
        "- Board Red Line at Alewife",
        "- Arrive at Downtown Crossing",
      ].join("\n"),
    );
  });
});
