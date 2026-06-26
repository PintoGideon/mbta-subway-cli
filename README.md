# Broad MBTA Assessment

TypeScript CLI for the Broad TGG MBTA take-home assessment.

## Requirements

- Node.js 22 or newer
- pnpm 11

## macOS Setup

Install the latest Node.js LTS release from
[nodejs.org](https://nodejs.org/en/download).

Enable Corepack and activate the pnpm version used by this project:

```sh
corepack enable
corepack prepare pnpm@11.7.0 --activate
```

## Project Setup

```sh
pnpm install
```

The MBTA API can be used without an API key, but may rate-limit unauthenticated
requests. An API key is recommended for commands that make multiple requests,
such as `--list-connections` and `--plan-route`. If you have a key, copy the
example env file and paste your key:

```sh
cp .env.example .env
```

Then edit `.env`:

```sh
MBTA_API_KEY=your_api_key
```

## Run

Show CLI help:

```sh
pnpm start --help
```

List subway routes:

```sh
pnpm start --list-routes
```

Print the route or routes with the most stops:

```sh
pnpm start --print-route longest
```

Print the route or routes with the fewest stops:

```sh
pnpm start --print-route shortest
```

List stops that connect two or more subway routes:

```sh
pnpm start --list-connections
```

Plan a route between two stops:

```sh
pnpm start --plan-route Davis Kendall/MIT
pnpm start --plan-route Ashmont Arlington
pnpm start --plan-route Prudential "Back Bay"
```

Use quotes for stop names that contain spaces.

## Test

```sh
pnpm run typecheck
pnpm test
```

## Possible Further Improvements

- Add rate-limit handling options for unauthenticated MBTA API usage, such as
  retry/backoff behavior or clearer retry guidance when the API returns `429`.
- Cache route and stop data to reduce repeated MBTA API calls, while making the
  cache lifetime explicit so results do not become unexpectedly stale.
- Extend route planning from the current route-level breadth-first search to a
  stop-level pathfinding algorithm if exact stop-by-stop itineraries or travel
  optimization become requirements.

## AI Usage

OpenAI Codex was used as a development assistant for project bootstrapping, design and planning,  CLI
setup, boilerplate code, comparing public solutions, focused code edits, README
edits, and test-case generation.

All final code, behavior, and tradeoffs were reviewed manually. Validation was
performed with TypeScript typechecking, unit tests, and end-to-end CLI smoke
tests against the MBTA API.
