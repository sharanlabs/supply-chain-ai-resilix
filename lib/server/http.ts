import { NextResponse } from "next/server";
import { z } from "zod";

export function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, {
    ...init,
    headers
  });
}

export function apiError(
  code: string,
  detail: unknown,
  status: number,
  headers?: HeadersInit
) {
  return noStoreJson(
    {
      error: code,
      detail
    },
    { status, headers }
  );
}

export async function parseJsonRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
  options: { maxBytes?: number } = {}
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const maxBytes = options.maxBytes ?? 16_384;
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > maxBytes) {
    return {
      ok: false,
      response: apiError(
        "REQUEST_TOO_LARGE",
        `JSON body must be ${maxBytes} bytes or smaller`,
        413
      )
    };
  }

  const text = await request.text();
  if (new Blob([text]).size > maxBytes) {
    return {
      ok: false,
      response: apiError(
        "REQUEST_TOO_LARGE",
        `JSON body must be ${maxBytes} bytes or smaller`,
        413
      )
    };
  }

  let json: unknown = {};
  if (text.trim().length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      return {
        ok: false,
        response: apiError("INVALID_JSON", "Request body must be valid JSON", 400)
      };
    }
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError("INVALID_REQUEST", parsed.error.flatten(), 400)
    };
  }

  return { ok: true, data: parsed.data };
}
