import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  InboundValidationError,
  ingestInboundEmail,
} from "@/lib/communications/ingest";

const VALID_PROVIDERS = ["resend", "sendgrid", "gmail", "generic"] as const;
const ProviderSchema = z.enum(VALID_PROVIDERS);

const WrappedInboundEmailSchema = z.object({
  provider: ProviderSchema,
  payload: z.record(z.unknown()),
});
const RawPayloadSchema = z.record(z.unknown());

/**
 * POST /api/inbound/email
 *
 * Webhook-style endpoint for receiving inbound broker emails.
 * Protected by INBOUND_WEBHOOK_SECRET bearer token.
 */
export async function POST(req: NextRequest) {
  if (!verifyWebhookAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const resolved = resolveInboundRequest(req, body);
  if (!resolved.success) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const { payload, provider } = resolved.data;

  try {
    const result = await ingestInboundEmail(
      provider,
      payload as Record<string, unknown>
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof InboundValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    console.error(
      "[nuke][inbound] ingestion failed",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Ingestion failed" },
      { status: 500 }
    );
  }
}

function verifyWebhookAuth(req: NextRequest): boolean {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  // If no secret configured, reject all requests (fail closed)
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function resolveInboundRequest(req: NextRequest, body: unknown) {
  const wrapped = WrappedInboundEmailSchema.safeParse(body);
  const hintedProvider = getProviderHint(req);

  if (wrapped.success) {
    if (hintedProvider && hintedProvider !== wrapped.data.provider) {
      return {
        success: false as const,
        error: {
          message:
            "Provider hint does not match wrapped payload provider.",
          details: {
            hintedProvider,
            payloadProvider: wrapped.data.provider,
          },
        },
      };
    }

    return {
      success: true as const,
      data: wrapped.data,
    };
  }

  const payload = RawPayloadSchema.safeParse(body);
  if (!payload.success) {
    return {
      success: false as const,
      error: payload.error.flatten(),
    };
  }

  if (!hintedProvider) {
    return {
      success: false as const,
      error: {
        message:
          "Missing provider hint. Supply a wrapped { provider, payload } body or pass ?provider=... / x-inbound-provider.",
      },
    };
  }

  return {
    success: true as const,
    data: {
      provider: hintedProvider,
      payload: payload.data,
    },
  };
}

function getProviderHint(req: NextRequest): z.infer<typeof ProviderSchema> | null {
  const provider =
    req.headers.get("x-inbound-provider") ??
    req.headers.get("x-provider") ??
    req.nextUrl.searchParams.get("provider");

  const parsed = ProviderSchema.safeParse(provider?.toLowerCase());
  return parsed.success ? parsed.data : null;
}
