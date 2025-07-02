import * as jwt from "jsonwebtoken";
import * as jwksClient from "jwks-rsa";

// JWKS client for Cognito
const client = jwksClient({
  jwksUri: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.USER_POOL_ID}/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, function (err: any, key: any) {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

interface CloudFrontEvent {
  Records: Array<{
    cf: {
      request: {
        uri: string;
        headers: {
          cookie?: Array<{
            key: string;
            value: string;
          }>;
        };
      };
    };
  }>;
}

interface CloudFrontResponse {
  status: string;
  statusDescription: string;
  headers: {
    [key: string]: Array<{
      key: string;
      value: string;
    }>;
  };
}

export const handler = async (event: CloudFrontEvent) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;

  // Skip authentication for callback and logout paths
  if (request.uri === "/callback" || request.uri === "/logout" || request.uri.startsWith("/api/")) {
    return request;
  }

  // Get JWT token from cookies
  let token: string | null = null;
  if (headers.cookie) {
    const cookies = headers.cookie[0].value.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "id_token" || name === "access_token") {
        token = value;
        break;
      }
    }
  }

  // If no token found, redirect to Cognito login
  if (!token) {
    const response: CloudFrontResponse = {
      status: "302",
      statusDescription: "Found",
      headers: {
        location: [
          {
            key: "Location",
            value: `https://${process.env.COGNITO_DOMAIN}.auth.${
              process.env.AWS_REGION
            }.amazoncognito.com/login?client_id=${
              process.env.USER_POOL_CLIENT_ID
            }&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(
              process.env.CALLBACK_URL || ""
            )}`,
          },
        ],
        "cache-control": [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    };
    return response;
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, getKey, {
      algorithms: ["RS256"],
      issuer: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.USER_POOL_ID}`,
      audience: process.env.USER_POOL_CLIENT_ID,
    });

    // Token is valid, allow request to proceed
    return request;
  } catch (error) {
    console.error("JWT verification failed:", error);

    // Token is invalid, redirect to Cognito login
    const response: CloudFrontResponse = {
      status: "302",
      statusDescription: "Found",
      headers: {
        location: [
          {
            key: "Location",
            value: `https://${process.env.COGNITO_DOMAIN}.auth.${
              process.env.AWS_REGION
            }.amazoncognito.com/login?client_id=${
              process.env.USER_POOL_CLIENT_ID
            }&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(
              process.env.CALLBACK_URL || ""
            )}`,
          },
        ],
        "cache-control": [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    };
    return response;
  }
};
