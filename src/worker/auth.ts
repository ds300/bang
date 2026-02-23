interface Env {
  AUTH_KV: KVNamespace;
  AUTH_SECRET: string;
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hmacVerify(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await hmacSign(payload, secret);
  return expected === signature;
}

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

export async function createToken(
  doId: string,
  secret: string,
): Promise<string> {
  const payload = JSON.stringify({
    sub: doId,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  });
  const encodedPayload = base64urlEncode(payload);
  const signature = await hmacSign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<{ sub: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const valid = await hmacVerify(encodedPayload, signature, secret);
  if (!valid) return null;

  try {
    const payload = JSON.parse(base64urlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

function generatePassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => chars[b % chars.length])
    .join("");
}

export async function handleSignup(env: Env): Promise<Response> {
  const password = generatePassword();
  const hash = await sha256(password);

  await env.AUTH_KV.put(
    hash,
    JSON.stringify({ created_at: new Date().toISOString() }),
  );

  const token = await createToken(hash, env.AUTH_SECRET);

  return Response.json({ password, token });
}

export async function handleLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.password) {
    return Response.json({ error: "Password required" }, { status: 400 });
  }

  const hash = await sha256(body.password);
  const entry = await env.AUTH_KV.get(hash);

  if (!entry) {
    return Response.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createToken(hash, env.AUTH_SECRET);
  return Response.json({ token });
}

export async function extractDoId(
  request: Request,
  secret: string,
): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    const url = new URL(request.url);
    const tokenParam = url.searchParams.get("token");
    if (tokenParam) {
      const payload = await verifyToken(tokenParam, secret);
      return payload?.sub ?? null;
    }
    return null;
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, secret);
  return payload?.sub ?? null;
}
