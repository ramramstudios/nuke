import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifyToken(
  token: string
): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as { sub: string };
  } catch {
    return null;
  }
}

/** Read the auth token from cookies and return userId or null */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("nuke_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload?.sub ?? null;
}
