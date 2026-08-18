/**
 * A playground for manually exercising backon during development. Run with
 * `bun run dev`, then hit it with curl (see the commands below) to see real
 * HTTP responses — the automated tests use app.request() in-process and
 * never open a real socket, so this is the way to see actual headers,
 * status codes, and error bodies.
 */
import { z } from "zod";
import {
  createApp,
  defineRoute,
  requireAuth,
  rateLimit,
  defineWebSocket,
  defineStream,
  defineUpload,
  serveApiDocs,
  serve,
} from "../src/index";

const AUTH_SECRET = "dev-only-secret-do-not-use-in-real-life";

const app = createApp();

app.get(
  "/hello",
  defineRoute({ query: z.object({ name: z.string().optional() }) }, (c, { query }) =>
    c.json({ message: `hello ${query.name ?? "world"}` })
  )
);

app.post(
  "/echo",
  defineRoute({ body: z.object({ text: z.string() }) }, (c, { body }) => c.json({ said: body.text }))
);

app.get("/boom", () => {
  throw new Error("deliberately unhandled, to see the generic 500 shape");
});

app.use("/whoami", requireAuth({ secret: AUTH_SECRET }));
app.get("/whoami", (c) => c.json({ auth: c.get("auth") }));

app.use("/limited", rateLimit({ windowMs: 10_000, max: 3 }));
app.get("/limited", (c) => c.json({ ok: true }));

app.get("/ws", defineWebSocket({ onMessage: (ws, data) => ws.send(`echo: ${data}`) }));

app.get(
  "/stream",
  defineStream(async (_c, write) => {
    for (let i = 0; i < 3; i++) await write(`chunk ${i}\n`);
  })
);

app.post(
  "/upload",
  defineUpload({ maxFileSizeBytes: 1024 * 1024, allowedMimeTypes: ["text/plain"] }, async (c, { files }) =>
    c.json({ received: files.file?.map((file) => file.name) ?? [] })
  )
);

serveApiDocs(app, "/docs", { title: "backon dev server" });

await serve(app);

// curl http://localhost:3000/health
// curl "http://localhost:3000/hello?name=nour"
// curl -X POST http://localhost:3000/echo -H 'content-type: application/json' -d '{"text":"hi"}'
// curl -X POST http://localhost:3000/echo -H 'content-type: application/json' -d '{}'   # 400, invalid_body
// curl http://localhost:3000/boom                                                        # 500, internal_error
// curl http://localhost:3000/whoami                                                      # 401, unauthorized
// curl http://localhost:3000/whoami -H "authorization: Bearer <token signed with AUTH_SECRET>"
// for i in 1 2 3 4; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/limited; done   # 200 200 200 429
// curl -N http://localhost:3000/stream
// curl -F "file=@somefile.txt;type=text/plain" http://localhost:3000/upload
// curl http://localhost:3000/docs/openapi.json
// open http://localhost:3000/docs                                                        # rendered API reference
// bun -e 'const ws = new WebSocket("ws://localhost:3000/ws"); ws.onopen = () => ws.send("hi"); ws.onmessage = (e) => console.log(e.data);'
