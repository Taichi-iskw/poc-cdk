import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export interface CognitoAuthProps {
  domainName: string;
  environment: string;
  baseName: string;
  account: string;
}

export class CognitoAuth extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly albUserPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: CognitoAuthProps) {
    super(scope, id);

    // Create Cognito User Pool
    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${props.baseName}-user-pool`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    // Create User Pool Domain
    this.userPoolDomain = new cognito.UserPoolDomain(this, "UserPoolDomain", {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: `${props.baseName}-${props.account}`,
      },
    });

    // Create User Pool Client for SPA (no secret for public clients)
    this.userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      userPoolClientName: `${props.environment}-spa-client`,
      generateSecret: false,
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          `https://${props.domainName}/callback`,
          `https://${props.environment}.${props.domainName}/callback`,
        ],
        logoutUrls: [`https://${props.domainName}/logout`, `https://${props.environment}.${props.domainName}/logout`],
      },
      preventUserExistenceErrors: true,
    });

    // Create User Pool Client for ALB OIDC authentication (with secret)
    // Note: Callback URLs will be updated after ALB is created
    this.albUserPoolClient = new cognito.UserPoolClient(this, "AlbUserPoolClient", {
      userPool: this.userPool,
      userPoolClientName: `${props.environment}-spa-alb-client`,
      generateSecret: true, // ALB OIDC requires client secret
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          // Placeholder URLs - will be updated after ALB creation
          "http://localhost/oauth2/idpresponse",
        ],
        logoutUrls: ["http://localhost/logout"],
      },
      preventUserExistenceErrors: true,
    });

    // Add a test user for development
    if (props.environment === "dev") {
      new cognito.CfnUserPoolUser(this, "TestUser", {
        userPoolId: this.userPool.userPoolId,
        username: "testuser",
        userAttributes: [
          {
            name: "email",
            value: "test@example.com",
          },
          {
            name: "email_verified",
            value: "true",
          },
        ],
        messageAction: "SUPPRESS",
      });
    }
  }

  // Method to update ALB client callback URLs after ALB is created
  public updateAlbClientCallbackUrls(albDnsName: string) {
    const cfnUserPoolClient = this.albUserPoolClient.node.defaultChild as cognito.CfnUserPoolClient;
    cfnUserPoolClient.callbackUrLs = [
      `http://${albDnsName}/oauth2/idpresponse`,
      `https://${albDnsName}/oauth2/idpresponse`,
    ];
    cfnUserPoolClient.logoutUrLs = [`http://${albDnsName}/logout`, `https://${albDnsName}/logout`];
  }
}
