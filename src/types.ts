export const SUBWAY_ROUTE_TYPES = [0, 1] as const;

export type SubwayRouteType = (typeof SUBWAY_ROUTE_TYPES)[number];

export interface MbtaListResponse<TResource> {
  data: TResource[];
}

export interface MbtaRouteResource {
  id: string;
  type: "route";
  attributes: {
    long_name: string;
    type: number;
  };
}

export interface SubwayRoute {
  id: string;
  longName: string;
  type: SubwayRouteType;
}

export interface MbtaStopResource {
  id: string;
  type: "stop";
  attributes: {
    name: string;
  };
}

export interface SubwayStop {
  id: string;
  name: string;
}

export interface RouteWithStops {
  route: SubwayRoute;
  stops: SubwayStop[];
}

export interface RouteStopCount {
  route: SubwayRoute;
  stopCount: number;
}

export interface ConnectingStop {
  stop: SubwayStop;
  routes: SubwayRoute[];
}

export interface RoutePlan {
  startStopName: string;
  finishStopName: string;
  routes: SubwayRoute[];
  steps: RoutePlanStep[];
}

export type RoutePlanStep =
  | {
      kind: "board";
      stopName: string;
      route: SubwayRoute;
    }
  | {
      kind: "transfer";
      stopName: string;
      route: SubwayRoute;
    }
  | {
      kind: "arrive";
      stopName: string;
    };
