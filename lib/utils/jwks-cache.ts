import * as https from "https";

interface JWK {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface JWKS {
  keys: JWK[];
}

interface CachedJWKS {
  jwks: JWKS;
  expiresAt: number;
}

class JWKSCache {
  private cache: Map<string, CachedJWKS> = new Map();
  private readonly ttl = 10 * 60 * 1000; // 10 minutes

  async getJWKS(jwksUrl: string): Promise<JWKS> {
    const cached = this.cache.get(jwksUrl);

    if (cached && Date.now() < cached.expiresAt) {
      return cached.jwks;
    }

    const jwks = await this.fetchJWKS(jwksUrl);
    this.cache.set(jwksUrl, {
      jwks,
      expiresAt: Date.now() + this.ttl,
    });

    return jwks;
  }

  private async fetchJWKS(jwksUrl: string): Promise<JWKS> {
    return new Promise((resolve, reject) => {
      https
        .get(jwksUrl, (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            try {
              const jwks = JSON.parse(data) as JWKS;
              resolve(jwks);
            } catch (error) {
              reject(new Error(`Failed to parse JWKS: ${error}`));
            }
          });
        })
        .on("error", (error) => {
          reject(new Error(`Failed to fetch JWKS: ${error}`));
        });
    });
  }

  getSigningKey(jwks: JWKS, kid: string): JWK | null {
    const key = jwks.keys.find((k) => k.kid === kid);
    return key || null;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const jwksCache = new JWKSCache();
export type { JWK, JWKS };
