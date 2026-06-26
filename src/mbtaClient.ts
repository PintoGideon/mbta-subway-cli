import {
  SUBWAY_ROUTE_TYPES,
  type MbtaListResponse,
  type MbtaRouteResource,
  type MbtaStopResource,
  type SubwayRoute,
  type SubwayRouteType,
  type SubwayStop,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api-v3.mbta.com";

export interface MbtaClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class MbtaClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  /**
   * Creates an MBTA API client.
   */
  constructor(options: MbtaClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.MBTA_API_KEY;

    this.apiKey = normalizeApiKey(apiKey);
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Fetches all light rail and heavy rail routes used by the assessment.
   */
  async getSubwayRoutes(): Promise<SubwayRoute[]> {
    const routeTypes = SUBWAY_ROUTE_TYPES.join(",");
    // Ask MBTA to filter route types server-side to limit the data sent back.
    const response = await this.fetchJson<MbtaListResponse<MbtaRouteResource>>(
      `/routes?filter[type]=${routeTypes}`,
    );
    const subwayRoutes = response.data.map(toSubwayRoute);

    return subwayRoutes;
  }

  /**
   * Fetches the stops served by a single MBTA route ID.
   */
  async getStopsForRoute(routeId: string): Promise<SubwayStop[]> {
    const response = await this.fetchJson<MbtaListResponse<MbtaStopResource>>(
      `/stops?filter[route]=${routeId}`,
    );
    const subwayStops = response.data.map(toSubwayStop);

    return subwayStops;
  }

  /**
   * Performs a JSON API request and fails fast for non-success responses.
   */
  private async fetchJson<TResponse>(path: string): Promise<TResponse> {
    const url = new URL(path, this.baseUrl);
    const headers: HeadersInit = {
      accept: "application/vnd.api+json",
    };

    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    const response = await this.fetchImpl(url, { headers });

    if (!response.ok) {
      throw new Error(
        `MBTA API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const json = await response.json();

    return json as TResponse;
  }
}

/**
 * Converts an MBTA route resource into the smaller internal route shape.
 */
function toSubwayRoute(resource: MbtaRouteResource): SubwayRoute {
  if (!isSubwayRouteType(resource.attributes.type)) {
    throw new Error(
      `Expected route type 0 or 1 for ${resource.id}, got ${resource.attributes.type}`,
    );
  }

  return {
    id: resource.id,
    longName: resource.attributes.long_name,
    type: resource.attributes.type,
  };
}

/**
 * Converts an MBTA stop resource into the smaller internal stop shape.
 */
function toSubwayStop(resource: MbtaStopResource): SubwayStop {
  return {
    id: resource.id,
    name: resource.attributes.name,
  };
}

/**
 * Narrows MBTA route types to the light rail and heavy rail values we support.
 */
function isSubwayRouteType(value: number): value is SubwayRouteType {
  const isSupportedRouteType = SUBWAY_ROUTE_TYPES.some(
    (routeType) => routeType === value,
  );

  return isSupportedRouteType;
}

function normalizeApiKey(apiKey: string | undefined): string | undefined {
  const trimmedApiKey = apiKey?.trim();
  return trimmedApiKey === "" ? undefined : trimmedApiKey;
}
