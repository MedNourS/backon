/**
 * A tiny playground for manually exercising backon while you're building it.
 * Run with `bun run dev`, then hit it with curl (see the commands in the
 * README/comments below) to see real HTTP responses — the automated tests
 * use app.request() in-process and never open a real socket, so this is the
 * easiest way to actually see headers, status codes, and error bodies as a
 * client would.
 */
import { z } from "zod";
import { createApp, defineRoute, serve } from "../src/index";

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

serve(app);

// curl http://localhost:3000/health
// curl "http://localhost:3000/hello?name=nour"
// curl -X POST http://localhost:3000/echo -H 'content-type: application/json' -d '{"text":"hi"}'
// curl -X POST http://localhost:3000/echo -H 'content-type: application/json' -d '{}'   # 400, invalid_body
// curl http://localhost:3000/boom                                                        # 500, internal_error
