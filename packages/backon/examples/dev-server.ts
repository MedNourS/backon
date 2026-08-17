/**
 * A tiny playground for manually exercising backon while you're building it.
 * Run with `bun run dev`, then hit it with curl (see the commands in the
 * README/comments below) to see real HTTP responses — the automated tests
 * use app.request() in-process and never open a real socket, so this is the
 * easiest way to actually see headers, status codes, and error bodies as a
 * client would.
 */
import { z } from "zod";
import { createApp, defineRoute, requireAuth, rateLimit, serve } from "../src/index";

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
  defineRoute({ body: z.object({ text: z.string() }) }, (c, { body }) => c.json({ youSaid: body.text }))
);

app.get("/boom", () => {
  throw new Error("deliberately unhandled, to see the generic 500 shape");
});

app.use("/whoami", requireAuth({ secret: AUTH_SECRET }));
app.get("/whoami", (c) => c.json({ auth: c.get("auth") }));

app.use("/limited", rateLimit({ windowMs: 10_000, max: 3 }));
app.get("/limited", (c) => c.json({ ok: true }));

serve(app);

// curl http://localhost:3000/health
// curl "http://localhost:3000/hello?name=nour"
// curl -X POST http://localhost:3000/echo -H 'content-type: application/json' -d '{"text":"hi"}'
// curl -X POST http://localhost:3000/echo -H 'content-type: application/json' -d '{}'   # 400, invalid_body
// curl http://localhost:3000/boom                                                        # 500, internal_error
// curl http://localhost:3000/whoami                                                      # 401, unauthorized
// curl http://localhost:3000/whoami -H "authorization: Bearer <token signed with AUTH_SECRET>"
// for i in 1 2 3 4; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/limited; done   # 200 200 200 429
