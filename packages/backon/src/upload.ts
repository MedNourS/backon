import { AppError } from "./error";
import type { BackonContext } from "./types";

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
  data: { files: Record<string, File[]> }
) => Response | Promise<Response>;

/**
 * Parses a multipart/form-data request, validating each file against
 * `maxFileSizeBytes`/`allowedMimeTypes` before the handler runs — the same
 * "validate first, throw AppError(400, ...) on failure" contract as
 * defineRoute(), just for files instead of a JSON body. Fields uploaded more
 * than once under the same name all land under that field's array, same as
 * a single file — `files.avatar` is always an array, even with one file.
 *
 *   app.post("/avatar", defineUpload(
 *     { maxFileSizeBytes: 2 * 1024 * 1024, allowedMimeTypes: ["image/png", "image/jpeg"] },
 *     async (c, { files }) => c.json({ uploaded: files.avatar.length })
 *   ));
 */
export function defineUpload(options: UploadOptions, handler: UploadHandler) {
  return async (c: BackonContext): Promise<Response> => {
    const raw = await c.req.parseBody({ all: true });
    const files: Record<string, File[]> = {};

    for (const [field, value] of Object.entries(raw)) {
      const values = Array.isArray(value) ? value : [value];
      const fileValues = values.filter((entry): entry is File => entry instanceof File);
      if (fileValues.length === 0) continue;

      for (const file of fileValues) {
        if (options.maxFileSizeBytes !== undefined && file.size > options.maxFileSizeBytes) {
          throw new AppError(
            400,
            "file_too_large",
            `${file.name} is ${file.size} bytes, over the ${options.maxFileSizeBytes} byte limit`
          );
        }
        if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(baseMimeType(file.type))) {
          throw new AppError(400, "unsupported_file_type", `${file.name} has unsupported type "${file.type}"`);
        }
      }

      files[field] = fileValues;
    }

    return handler(c, { files });
  };
}
