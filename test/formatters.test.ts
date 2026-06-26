import { describe, expect, it } from "vitest";
import {
  formatConnectingStops,
  formatRouteNames,
  formatRoutePlan,
  formatRouteStopCounts,
} from "../src/formatters.js";
import type {
  ConnectingStop,
  RoutePlan,
  RouteStopCount,
  SubwayRoute,
} from "../src/types.js";

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

describe("formatters", () => {
  it("formats route names", () => {
    const output = formatRouteNames(["Blue Line", "Red Line"]);

    expect(output).toBe(["Subway routes:", "- Blue Line", "- Red Line"].join("\n"));
  });

  it("formats route stop counts", () => {
    const routeStopCounts: RouteStopCount[] = [
      {
        route: redLine,
        stopCount: 1,
      },
      {
        route: blueLine,
        stopCount: 2,
      },
    ];
    const output = formatRouteStopCounts("Routes by stop count:", routeStopCounts);

    expect(output).toBe(
      [
        "Routes by stop count:",
        "- Red Line: 1 stop",
        "- Blue Line: 2 stops",
      ].join("\n"),
    );
  });

  it("formats connecting stops in deterministic alphabetical order", () => {
    const connectingStops: ConnectingStop[] = [
      {
        stop: { id: "park-street", name: "Park Street" },
        routes: [redLine, greenBLine],
      },
      {
        stop: { id: "downtown-crossing", name: "Downtown Crossing" },
        routes: [redLine, orangeLine],
      },
      {
        stop: { id: "state", name: "State" },
        routes: [orangeLine, blueLine],
      },
    ];
    const output = formatConnectingStops(connectingStops);

    expect(output).toBe(
      [
        "Connecting stops:",
        "- Downtown Crossing: Orange Line, Red Line",
        "- Park Street: Green Line B, Red Line",
        "- State: Blue Line, Orange Line",
      ].join("\n"),
    );
  });

  it("formats route plans with a route summary and itinerary steps", () => {
    const routePlan: RoutePlan = {
      startStopName: "Alewife",
      finishStopName: "Aquarium",
      routes: [redLine, orangeLine, blueLine],
      steps: [
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
      ],
    };
    const output = formatRoutePlan(routePlan);

    expect(output).toBe(
      [
        "Route plan from Alewife to Aquarium:",
        "Routes: Red Line, Orange Line, Blue Line",
        "- Board Red Line at Alewife",
        "- Transfer to Orange Line at Downtown Crossing",
        "- Transfer to Blue Line at State",
        "- Arrive at Aquarium",
      ].join("\n"),
    );
  });
});
