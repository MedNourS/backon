/**
 * Same playground as dev-server.ts, but on the Express adapter. Run with
 * `bun run dev:express`, then hit it with the same curl commands as the
 * Hono example — the point is that the routes below read identically to
 * the Hono version even though a different engine is running underneath.
 */
import { z } from "zod";
import { createApp, defineRoute, requireAuth, rateLimit, serve } from "../src/express/index";

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
app.get("/whoami", (_req, res) => res.json({ auth: res.locals.auth }));

app.use("/limited", rateLimit({ windowMs: 10_000, max: 3 }));
app.get("/limited", (_req, res) => res.json({ ok: true }));

serve(app);

// curl http://localhost:3000/health
// curl "http://localhost:3000/hello?name=nour"
// curl -X POST http://localhost:3000/echo -H 'content-type: application/json' -d '{"text":"hi"}'
// curl -X POST http://localhost:3000/echo -H 'content-type: application/json' -d '{}'   # 400, invalid_body
// curl http://localhost:3000/boom                                                        # 500, internal_error
// curl http://localhost:3000/whoami                                                      # 401, unauthorized
// curl http://localhost:3000/whoami -H "authorization: Bearer <token signed with AUTH_SECRET>"
// for i in 1 2 3 4; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/limited; done   # 200 200 200 429
