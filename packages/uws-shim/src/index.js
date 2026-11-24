// uws compatibility shim.
// colyseus 0.5 requires "uws" at runtime. uws 8.x is unmaintained and fails to
// compile against Node 20+/V8 11 (removed IntegerValue()/ArrayBuffer::New
// signatures). uws was always a ws-compatible implementation, so we re-export
// the ws package, which implements the identical API surface colyseus uses:
//
//   new uws.Server(options)  |  server.on("connection", ...)  |
//   client.on("message"/"close"/"error")  |  client.send(data, { binary: true })
module.exports = require("ws");
