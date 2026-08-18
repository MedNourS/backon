import { describe, expect, it } from "bun:test";
import request from "supertest";
import { createApp, attachErrorHandler } from "../../src/express/create-app";
import { defineStream } from "../../src/express/stream";

describe("express defineStream", () => {
  it("writes every chunk the handler produces into the response body", async () => {
    const app = createApp();
    app.get(
      "/export",
      defineStream((_c, write) => {
        for (let i = 0; i < 3; i++) write(`chunk ${i}\n`);
      })
    );
    attachErrorHandler(app);

    const res = await request(app).get("/export");
    expect(res.status).toBe(200);
    expect(res.text).toBe("chunk 0\nchunk 1\nchunk 2\n");
  });

  it("lets the handler set headers via c.header() before the first write", async () => {
    const app = createApp();
    app.get(
      "/export",
      defineStream((c, write) => {
        c.header("Content-Type", "text/event-stream");
        write("data: hi\n\n");
      })
    );
    attachErrorHandler(app);

    const res = await request(app).get("/export");
    expect(res.headers["content-type"]).toBe("text/event-stream");
  });
});
