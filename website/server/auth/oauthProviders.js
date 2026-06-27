import { createSign, randomBytes } from "node:crypto";

const providerSpecs = {
  apple: {
    id: "apple",
    label: "使用 Apple 繼續",
    shortLabel: "Apple",
    platformHint: "iPhone / iPad",
    scope: "name email",
    authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
    tokenEndpoint: "https://appleid.apple.com/auth/token",
    issuer: "https://appleid.apple.com",
  },
  google: {
    id: "google",
    label: "使用 Google 繼續",
    shortLabel: "Google",
    platformHint: "Android / Web",
    scope: "openid email profile",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  },
  line: {
    id: "line",
    label: "使用 LINE 繼續",
    shortLabel: "LINE",
    platformHint: "台灣常用帳號",
    scope: "openid profile email",
    authorizationEndpoint: "https://access.line.me/oauth2/v2.1/authorize",
    tokenEndpoint: "https://api.line.me/oauth2/v2.1/token",
    issuer: "https://access.line.me",
  },
};

const providerOrder = ["apple", "google", "line"];

function envValue(env, names) {
  for (const name of names) {
    if (env[name]) return env[name];
  }
  return "";
}

function providerCredentials(provider, env) {
  if (provider === "apple") {
    return {
      clientId: envValue(env, ["APPLE_CLIENT_ID", "APPLE_SERVICE_ID"]),
      teamId: env.APPLE_TEAM_ID || "",
      keyId: env.APPLE_KEY_ID || "",
      privateKey: env.APPLE_PRIVATE_KEY || "",
      missing: ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"].filter((key) => !env[key]),
    };
  }

  if (provider === "google") {
    return {
      clientId: env.GOOGLE_CLIENT_ID || "",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "",
      missing: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"].filter((key) => !env[key]),
    };
  }

  if (provider === "line") {
    return {
      clientId: envValue(env, ["LINE_CLIENT_ID", "LINE_CHANNEL_ID"]),
      clientSecret: envValue(env, ["LINE_CLIENT_SECRET", "LINE_CHANNEL_SECRET"]),
      missing: [
        env.LINE_CLIENT_ID || env.LINE_CHANNEL_ID ? null : "LINE_CLIENT_ID",
        env.LINE_CLIENT_SECRET || env.LINE_CHANNEL_SECRET ? null : "LINE_CLIENT_SECRET",
      ].filter(Boolean),
    };
  }

  return { clientId: "", clientSecret: "", missing: ["unknown provider"] };
}

export function supportedAuthProviders(env = process.env) {
  return providerOrder.map((id) => {
    const spec = providerSpecs[id];
    const credentials = providerCredentials(id, env);
    return {
      id,
      label: spec.label,
      shortLabel: spec.shortLabel,
      platformHint: spec.platformHint,
      configured: credentials.missing.length === 0,
      missingEnv: credentials.missing,
      startUrl: `/api/auth/${id}/start`,
    };
  });
}

export function requireProviderSpec(provider) {
  const spec = providerSpecs[provider];
  if (!spec) {
    const supported = providerOrder.join(", ");
    throw new Error(`Unsupported auth provider: ${provider}. Supported providers: ${supported}`);
  }
  return spec;
}

export function requireConfiguredProvider(provider, env = process.env) {
  const spec = requireProviderSpec(provider);
  const credentials = providerCredentials(provider, env);
  if (credentials.missing.length > 0) {
    const error = new Error(`${spec.shortLabel} login is not configured`);
    error.status = 501;
    error.missingEnv = credentials.missing;
    throw error;
  }
  return { spec, credentials };
}

function base64Url(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer.toString("base64url");
}

function decodeJwtPayload(token) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("id_token is missing a payload");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function normalizePrivateKey(value) {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function appleClientSecret({ teamId, clientId, keyId, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64Url(
    JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + 60 * 60 * 24 * 180,
      aud: "https://appleid.apple.com",
      sub: clientId,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("sha256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64Url(signer.sign(normalizePrivateKey(privateKey)))}`;
}

function redirectUriFor(req, provider) {
  const configuredBase = process.env.AUTH_BASE_URL || process.env.PUBLIC_BASE_URL;
  const base =
    configuredBase ||
    `${req.get("x-forwarded-proto") || req.protocol || "https"}://${req.get("x-forwarded-host") || req.get("host")}`;
  return `${base.replace(/\/+$/, "")}/api/auth/${provider}/callback`;
}

export function buildAuthorizationUrl({ provider, req, state, nonce }) {
  const { spec, credentials } = requireConfiguredProvider(provider);
  const redirectUri = redirectUriFor(req, provider);
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: spec.scope,
    state,
    nonce,
  });

  if (provider === "apple") {
    params.set("response_mode", "form_post");
  }

  if (provider === "google") {
    params.set("prompt", "select_account");
    params.set("access_type", "online");
  }

  return {
    url: `${spec.authorizationEndpoint}?${params.toString()}`,
    redirectUri,
  };
}

function assertValidTokenPayload({ provider, spec, credentials, payload, expectedNonce }) {
  const issuers = Array.isArray(spec.issuer) ? spec.issuer : [spec.issuer];
  if (!issuers.includes(payload.iss)) throw new Error(`${provider} id_token issuer mismatch`);

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(credentials.clientId)) throw new Error(`${provider} id_token audience mismatch`);

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || Number(payload.exp) <= now) throw new Error(`${provider} id_token has expired`);
  if (payload.nonce && expectedNonce && payload.nonce !== expectedNonce) {
    throw new Error(`${provider} id_token nonce mismatch`);
  }
}

function normalizeIdentity({ provider, payload, rawUser }) {
  const appleName =
    rawUser?.name && [rawUser.name.firstName, rawUser.name.lastName].filter(Boolean).join(" ").trim();
  const displayName = payload.name || appleName || payload.email || `${provider}:${payload.sub}`;
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";

  return {
    provider,
    providerUserId: String(payload.sub),
    email: payload.email || null,
    emailVerified,
    displayName,
    avatarUrl: payload.picture || null,
    rawProfile: {
      providerPayload: payload,
      user: rawUser || null,
    },
  };
}

export async function exchangeOAuthCode({ provider, req, code, nonce, rawUser }) {
  const { spec, credentials } = requireConfiguredProvider(provider);
  const redirectUri = redirectUriFor(req, provider);
  const clientSecret =
    provider === "apple"
      ? appleClientSecret(credentials)
      : credentials.clientSecret;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: credentials.clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(spec.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await response.json().catch(() => null);
  if (!response.ok || !token?.id_token) {
    throw new Error(`${spec.shortLabel} token exchange failed`);
  }

  const payload = decodeJwtPayload(token.id_token);
  assertValidTokenPayload({ provider, spec, credentials, payload, expectedNonce: nonce });
  return {
    identity: normalizeIdentity({ provider, payload, rawUser }),
    token,
  };
}

export function oauthRandomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
