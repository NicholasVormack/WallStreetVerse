# `uws` compatibility shim (WallStreetVerse)

This package provides the `uws` module name at runtime by re-exporting the [`ws`](https://github.com/websockets/ws) package.

**Why:** colyseus 0.5 hard-depends on `uws` (via `require("uws")` in `lib/Server.js`). The real `uws@8.x` is unmaintained and its C++ addon does not compile against Node 20+/V8 11 (removed `IntegerValue()`/`ArrayBuffer::New` signatures), and no prebuilt binaries are published.

`uws` was always a `ws`-compatible implementation, and colyseus only uses the `ws`-compatible subset:

- `new uws.Server(options)`
- `server.on("connection", ...)`
- `client.on("message" | "close" | "error", ...)`
- `client.send(data, { binary: true })`

Version `8.14.1` is used so npm workspace linking satisfies colyseus's `"uws": "^8.14.1"` dependency without installing the unbuildable native module.
