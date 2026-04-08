import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db";
import { encryptJSON } from "@/lib/crypto/encrypt";
import { decodeStoredProfile } from "@/lib/removal/profile";

const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
});

const schema = z.object({
  fullNames: z.array(z.string().min(1)).min(1),
  emails: z.array(z.string().email()).min(1),
  phones: z.array(z.string()).default([]),
  addresses: z.array(addressSchema).default([]),
  advertisingIds: z.array(z.string()).optional(),
  vin: z.string().optional(),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user, profile, lastSubmittedRequest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    prisma.userProfile.findUnique({
      where: { userId },
      select: {
        fullNames: true,
        emails: true,
        phones: true,
        addresses: true,
        advertisingIds: true,
        vin: true,
        updatedAt: true,
      },
    }),
    prisma.removalRequest.findFirst({
      where: {
        deletionRequest: { userId },
        submittedAt: { not: null },
      },
      orderBy: { submittedAt: "desc" },
      select: { submittedAt: true },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    accountEmail: user.email,
    profile: decodeStoredProfile(profile),
    profileUpdatedAt: profile.updatedAt.toISOString(),
    lastSubmittedAt: lastSubmittedRequest?.submittedAt?.toISOString() ?? null,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Encrypt all PII fields
  const profile = await prisma.userProfile.upsert({
    where: { userId },
    update: {
      fullNames: encryptJSON(data.fullNames),
      emails: encryptJSON(data.emails),
      phones: encryptJSON(data.phones),
      addresses: encryptJSON(data.addresses),
      advertisingIds: data.advertisingIds
        ? encryptJSON(data.advertisingIds)
        : null,
      vin: data.vin ? encryptJSON(data.vin) : null,
    },
    create: {
      userId,
      fullNames: encryptJSON(data.fullNames),
      emails: encryptJSON(data.emails),
      phones: encryptJSON(data.phones),
      addresses: encryptJSON(data.addresses),
      advertisingIds: data.advertisingIds
        ? encryptJSON(data.advertisingIds)
        : null,
      vin: data.vin ? encryptJSON(data.vin) : null,
    },
  });

  return NextResponse.json({
    profileId: profile.id,
    status: "saved",
    profileUpdatedAt: profile.updatedAt.toISOString(),
  });
}
