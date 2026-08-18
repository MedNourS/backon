import { describe, expect, it } from "bun:test";
import { createApp } from "../src/create-app";
import { defineUpload } from "../src/upload";

function textFile(name: string, contents: string, type = "text/plain"): File {
  return new File([contents], name, { type });
}

describe("defineUpload", () => {
  it("passes validated files to the handler, grouped by field name", async () => {
    const app = createApp();
    app.post(
      "/upload",
      defineUpload({}, async (c, { files }) => c.json({ count: files.file?.length, name: files.file?.[0]?.name }))
    );

    const form = new FormData();
    form.append("file", textFile("hello.txt", "hello world"));

    const res = await app.request("/upload", { method: "POST", body: form });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1, name: "hello.txt" });
  });

  it("rejects a file over maxFileSizeBytes with a 400", async () => {
    const app = createApp();
    app.post("/upload", defineUpload({ maxFileSizeBytes: 5 }, async (c) => c.json({ ok: true })));

    const form = new FormData();
    form.append("file", textFile("big.txt", "this is more than five bytes"));

    const res = await app.request("/upload", { method: "POST", body: form });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("file_too_large");
  });

  it("rejects a file whose type isn't allowed, ignoring charset parameters on the Content-Type", async () => {
    const app = createApp();
    app.post(
      "/upload",
      defineUpload({ allowedMimeTypes: ["image/png"] }, async (c) => c.json({ ok: true }))
    );

    const form = new FormData();
    form.append("file", textFile("note.txt", "plain text", "text/plain;charset=utf-8"));

    const res = await app.request("/upload", { method: "POST", body: form });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("unsupported_file_type");
  });

  it("accepts a file whose Content-Type carries a charset parameter, matching by base type", async () => {
    const app = createApp();
    app.post(
      "/upload",
      defineUpload({ allowedMimeTypes: ["text/plain"] }, async (c, { files }) =>
        c.json({ count: files.file?.length ?? 0 })
      )
    );

    const form = new FormData();
    form.append("file", textFile("note.txt", "plain text", "text/plain;charset=utf-8"));

    const res = await app.request("/upload", { method: "POST", body: form });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1 });
  });
});
