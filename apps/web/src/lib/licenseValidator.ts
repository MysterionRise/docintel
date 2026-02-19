const SECRET_KEY = 'docintel-license-v1';

interface LicensePayload {
  email: string;
  expiry: number; // Unix timestamp
  tier: 'pro';
}

export function parseLicenseKey(key: string): { email: string; expiry: number; signature: string } | null {
  // Format: DINTEL-XXXX-XXXX-XXXX-XXXX (base64url encoded payload + HMAC)
  const cleaned = key.replace(/^DINTEL-/, '').replace(/-/g, '');
  try {
    const decoded = atob(cleaned);
    const parts = decoded.split('|');
    if (parts.length !== 3) return null;
    return {
      email: parts[0],
      expiry: parseInt(parts[1], 10),
      signature: parts[2],
    };
  } catch {
    return null;
  }
}

export async function validateLicenseKey(key: string): Promise<{ valid: boolean; payload?: LicensePayload; error?: string }> {
  const parsed = parseLicenseKey(key);
  if (!parsed) {
    return { valid: false, error: 'Invalid key format' };
  }

  if (parsed.expiry < Date.now() / 1000) {
    return { valid: false, error: 'License expired' };
  }

  const dataToSign = `${parsed.email}|${parsed.expiry}`;
  const expectedSig = await hmacSha256(dataToSign, SECRET_KEY);

  if (expectedSig !== parsed.signature) {
    return { valid: false, error: 'Invalid license key' };
  }

  return {
    valid: true,
    payload: { email: parsed.email, expiry: parsed.expiry, tier: 'pro' },
  };
}

async function hmacSha256(data: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateLicenseKey(email: string, expiryDays: number): Promise<string> {
  const expiry = Math.floor(Date.now() / 1000) + expiryDays * 86400;
  const dataToSign = `${email}|${expiry}`;
  const signature = await hmacSha256(dataToSign, SECRET_KEY);
  const payload = `${email}|${expiry}|${signature}`;
  const encoded = btoa(payload);
  // Format as DINTEL-XXXX-XXXX-...
  const chunks = encoded.match(/.{1,4}/g) ?? [];
  return `DINTEL-${chunks.join('-')}`;
}
