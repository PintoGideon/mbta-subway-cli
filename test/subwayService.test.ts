import { describe, expect, it } from "vitest";
import type { MbtaClient } from "../src/mbtaClient.js";
import {
	buildRouteGraph,
	buildSubwayNetwork,
	createRoutePlan,
	findConnectingStops,
	findRoutesByStopIds,
	findRoutesWithFewestStops,
	findRoutesWithMostStops,
	findStopIdsByName,
	listSubwayRouteNames,
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
	it("lists route names alphabetically", async () => {
		const mbtaClient = {
			getSubwayRoutes: async () => [redLine, greenBLine, blueLine],
		} as unknown as MbtaClient;

		await expect(listSubwayRouteNames(mbtaClient)).resolves.toEqual([
			"Blue Line",
			"Green Line B",
			"Red Line",
		]);
	});

	it("finds routes tied for most and fewest stops", () => {
		const mostStops = findRoutesWithMostStops(routesWithStops);
		const fewestStops = findRoutesWithFewestStops(routesWithStops);

		expect(mostStops.map((routeStopCount) => routeStopCount.route.id)).toEqual([
			"Red",
			"Green-B",
			"Blue",
		]);
		expect(mostStops.map((routeStopCount) => routeStopCount.stopCount)).toEqual(
			[3, 3, 3],
		);
		expect(fewestStops).toEqual([
			{
				route: orangeLine,
				stopCount: 2,
			},
		]);
	});

	it("returns no longest or fewest route for empty route data", () => {
		expect(findRoutesWithMostStops([])).toEqual([]);
		expect(findRoutesWithFewestStops([])).toEqual([]);
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

	it("builds a reusable subway network from route-stop data", () => {
		const subwayNetwork = buildSubwayNetwork(routesWithStops);

		expect(
			subwayNetwork.connectingStops.map((connection) => connection.stop.id),
		).toEqual(["park-street", "downtown-crossing", "state"]);
		expect(subwayNetwork.routeGraph.get("Red")).toEqual(["Green-B", "Orange"]);
		expect(subwayNetwork.routesById.get("Blue")).toEqual(blueLine);
	});

	it("matches stop names case-insensitively and finds routes for stop IDs", () => {
		const stopIds = findStopIdsByName(routesWithStops, "  aLeWiFe ");
		const routes = findRoutesByStopIds(routesWithStops, stopIds);

		expect(stopIds).toEqual(["alewife"]);
		expect(routes).toEqual([redLine]);
	});

	it("builds a route graph and plans the shortest route sequence with transfer stops", () => {
		const graph = buildRouteGraph(routesWithStops);
		const routePlan = createRoutePlan(routesWithStops, "Alewife", "Aquarium");

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
	});

	it("plans same-route trips without unnecessary transfers", () => {
		const routePlan = createRoutePlan(
			routesWithStops,
			"Alewife",
			"Downtown Crossing",
		);

		expect(routePlan.routes.map((route) => route.id)).toEqual(["Red"]);
		expect(routePlan.steps).toEqual([
			{
				kind: "board",
				stopName: "Alewife",
				route: redLine,
			},
			{
				kind: "arrive",
				stopName: "Downtown Crossing",
			},
		]);
	});

	it("throws helpful errors when requested stops do not exist", () => {
		expect(() =>
			createRoutePlan(routesWithStops, "Missing", "Aquarium"),
		).toThrow('Could not find start stop "Missing".');
		expect(() =>
			createRoutePlan(routesWithStops, "Alewife", "Missing"),
		).toThrow('Could not find finish stop "Missing".');
	});
});
