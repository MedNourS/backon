import { describe, expect, it } from "bun:test";
import { createApp } from "../src/create-app";
import { defineStream } from "../src/stream";

describe("defineStream", () => {
  it("writes every chunk the handler produces into the response body", async () => {
    const app = createApp();
    app.get(
      "/export",
      defineStream(async (_c, write) => {
        for (let i = 0; i < 3; i++) await write(`chunk ${i}\n`);
      })
    );

    const res = await app.request("/export");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("chunk 0\nchunk 1\nchunk 2\n");
  });

  it("lets the handler set headers via c.header() before the first write", async () => {
    const app = createApp();
    app.get(
      "/export",
      defineStream(async (c, write) => {
        c.header("Content-Type", "text/event-stream");
        await write("data: hi\n\n");
      })
    );

    const res = await app.request("/export");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });
});
