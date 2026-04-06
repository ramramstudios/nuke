export interface ParsedJsonResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  rawText: string;
}

export async function parseJsonResponse<T>(
  response: Response
): Promise<ParsedJsonResponse<T>> {
  const rawText = await response.text();

  if (!rawText) {
    return {
      ok: response.ok,
      status: response.status,
      data: null,
      rawText,
    };
  }

  try {
    return {
      ok: response.ok,
      status: response.status,
      data: JSON.parse(rawText) as T,
      rawText,
    };
  } catch {
    return {
      ok: response.ok,
      status: response.status,
      data: null,
      rawText,
    };
  }
}

export function getResponseErrorMessage(
  response: ParsedJsonResponse<{ error?: unknown }>,
  fallback: string
): string {
  if (typeof response.data?.error === "string" && response.data.error.length > 0) {
    return response.data.error;
  }

  if (looksLikeHtml(response.rawText)) {
    if (response.status === 404) {
      return `${fallback} The API returned an HTML 404 page. Restart the Next.js dev server and try again.`;
    }

    return `${fallback} The API returned HTML instead of JSON. Restart the Next.js dev server and try again.`;
  }

  return fallback;
}

function looksLikeHtml(value: string): boolean {
  const normalized = value.trimStart().toLowerCase();
  return normalized.startsWith("<!doctype html") || normalized.startsWith("<html");
}
