import { describe, expect, it } from "bun:test";
import request from "supertest";
import { createApp, attachErrorHandler } from "../../src/express/create-app";
import { defineUpload } from "../../src/express/upload";

describe("express defineUpload", () => {
  it("passes validated files to the handler, grouped by field name", async () => {
    const app = createApp();
    app.post(
      "/upload",
      defineUpload({}, async (c, { files }) =>
        c.json({ count: files.file?.length, name: files.file?.[0]?.originalname })
      )
    );
    attachErrorHandler(app);

    const res = await request(app).post("/upload").attach("file", Buffer.from("hello world"), "hello.txt");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 1, name: "hello.txt" });
  });

  it("rejects a file over maxFileSizeBytes with a 400", async () => {
    const app = createApp();
    app.post("/upload", defineUpload({ maxFileSizeBytes: 5 }, async (c) => c.json({ ok: true })));
    attachErrorHandler(app);

    const res = await request(app)
      .post("/upload")
      .attach("file", Buffer.from("this is more than five bytes"), "big.txt");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("file_too_large");
  });

  it("rejects a file whose type isn't allowed", async () => {
    const app = createApp();
    app.post("/upload", defineUpload({ allowedMimeTypes: ["image/png"] }, async (c) => c.json({ ok: true })));
    attachErrorHandler(app);

    const res = await request(app)
      .post("/upload")
      .attach("file", Buffer.from("plain text"), { filename: "note.txt", contentType: "text/plain" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("unsupported_file_type");
  });

  it("accepts a file whose Content-Type carries a charset parameter, matching by base type", async () => {
    const app = createApp();
    app.post(
      "/upload",
      defineUpload({ allowedMimeTypes: ["text/plain"] }, async (c, { files }) =>
        c.json({ count: files.file?.length ?? 0 })
      )
    );
    attachErrorHandler(app);

    const res = await request(app)
      .post("/upload")
      .attach("file", Buffer.from("plain text"), { filename: "note.txt", contentType: "text/plain; charset=utf-8" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 1 });
  });
});
