# The browser demo

The published site at **https://nicholasvormack.github.io/WallStreetVerse/** runs
the real client against an in-browser simulator. This page is explicit about what
that means, because "it's on GitHub Pages" and "it's the multiplayer game" are
not the same claim.

## Why there is a simulator

GitHub Pages serves static files. It cannot run the Colyseus server, Postgres or
Redis that online play needs. There are three honest options:

1. Publish nothing and say the project needs a server.
2. Publish a screenshot.
3. Publish the real client with a browser-side authority behind it, clearly
   labelled.

Option 3 is what this repo does. The scene has no idea which transport it has:
`Network` and `LocalServer` implement the same interface, so the deployed demo
exercises the same prediction, reconciliation, interpolation, collision and
portal code that online play uses. The only thing that changes is who runs the
20 Hz tick.

## What is real in the demo

- The **client** is the production client: same scene, same input manager, same
  `ClientLoop` prediction and `SnapshotBuffer` interpolation.
- **Collision geometry** is the server's geometry, transcribed into
  `packages/client/src/game/zones.ts`. Collision resolution uses the same
  `@wallstreet/shared` helpers (`collideCircleStatic`, `clampToBounds`).
- **Portals and zone transfers** work. Walking into a portal switches zone, moves
  you to the portal's spawn, and rebuilds the bots for the new room.
- **The tick rate is 20 Hz**, and inputs are queued and drained per tick rather
  than applied per animation frame, matching the server loop.
- **Remote entities** are interpolated from snapshots at `now - 100ms`, so the
  smoothing you see is the real smoothing path.

## What is simulated, and labelled as such

- **Authority.** The browser is the server. Anything in the demo could be edited
  in devtools because it is all client-side. That is exactly what the real
  architecture prevents, and it is why online play still requires the server.
- **Other players.** The three magenta entities are bots (`MM-Alpha`, `Retail-7`,
  `Whale-3`) walking waypoint loops. There are no other humans.
- **Market data.** Prices in the ticker and the zone panels come from
  `packages/client/src/game/market.ts`: a seeded random walk over hard-coded
  starting prices. It is not market data, it is not a real feed, and the UI says
  "simulated data" under the panel title.
- **Latency.** `rtt` reads near zero because the round trip never leaves the tab.

## Running the demo locally

```bash
npm ci
npm run build:shared
npm run dev:client
```

Open http://127.0.0.1:5173. With no `VITE_WS_URL` set, the client uses
`LocalServer`.

## Running the real thing

```bash
docker compose up -d          # Postgres + Redis
npm ci
npm run build:shared
npm run dev:server            # Colyseus + Fastify on :2567
VITE_WS_URL=ws://127.0.0.1:2567 npm run dev:client
```

Now the client talks to the authoritative server, bots are replaced by other
connected clients, and the server owns every position.

## Roadmap beyond the demo

Phase 1 is movement and zoning. Phase 2 - trading, order books, positions,
persistence of a player's portfolio - needs the server, because that state is
money and money cannot live in a client. The market module is deliberately
shaped like a feed so a real data source can replace it without touching the
scene.
