import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db";
import { encryptJSON } from "@/lib/crypto/encrypt";

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

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
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

  return NextResponse.json({ profileId: profile.id, status: "saved" });
}
