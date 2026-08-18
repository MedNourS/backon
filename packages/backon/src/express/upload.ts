import type { Request, Response, NextFunction } from "express";
import multer, { type Multer } from "multer";
import { AppError } from "../error";
import { createContext, type BackonContext } from "./types";

/** Content-Type headers can carry parameters ("text/plain;charset=utf-8") — comparisons only care about the type itself. */
function baseMimeType(type: string): string {
  return type.split(";")[0]?.trim() ?? type;
}

export interface UploadOptions {
  /** Rejects any file over this size with a 400. Unset means no limit. */
  maxFileSizeBytes?: number;
  /** Rejects any file whose type isn't in this list with a 400. Unset means no restriction. */
  allowedMimeTypes?: string[];
}

export type UploadHandler = (
  c: BackonContext,
  data: { files: Record<string, Express.Multer.File[]> }
) => unknown | Promise<unknown>;

/**
 * Same contract as the Hono defineUpload: parses a multipart/form-data
 * request, validates each file against maxFileSizeBytes/allowedMimeTypes,
 * throws AppError(400, ...) on the first violation. Built on multer (kept
 * in memory, not written to disk — same "handler decides what happens to
 * the data" philosophy as everything else here) since Express has no
 * built-in multipart parser the way Hono's c.req.parseBody() is.
 *
 *   app.post("/avatar", defineUpload(
 *     { maxFileSizeBytes: 2 * 1024 * 1024, allowedMimeTypes: ["image/png", "image/jpeg"] },
 *     async (c, { files }) => c.json({ uploaded: files.avatar.length })
 *   ));
 */
export function defineUpload(options: UploadOptions, handler: UploadHandler) {
  const upload: Multer = multer({
    storage: multer.memoryStorage(),
    limits: options.maxFileSizeBytes !== undefined ? { fileSize: options.maxFileSizeBytes } : undefined,
  });
  const parseMultipart = upload.any();

  return (req: Request, res: Response, next: NextFunction): void => {
    parseMultipart(req, res, async (err: unknown) => {
      if (err) {
        const code = (err as { code?: string }).code === "LIMIT_FILE_SIZE" ? "file_too_large" : "invalid_upload";
        next(new AppError(400, code, err instanceof Error ? err.message : "Upload failed"));
        return;
      }

      try {
        const filesByField: Record<string, Express.Multer.File[]> = {};
        for (const file of (req.files as Express.Multer.File[]) ?? []) {
          if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(baseMimeType(file.mimetype))) {
            throw new AppError(400, "unsupported_file_type", `${file.originalname} has unsupported type "${file.mimetype}"`);
          }
          (filesByField[file.fieldname] ??= []).push(file);
        }

        const ctx = createContext(req, res);
        await handler(ctx, { files: filesByField });
      } catch (handlerErr) {
        next(handlerErr);
      }
    });
  };
}
