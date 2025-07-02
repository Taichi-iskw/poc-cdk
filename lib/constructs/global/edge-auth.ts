import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import * as path from "path";

export interface EdgeAuthFunctionProps {
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  environment: string;
  baseName: string;
  account: string;
}

export class EdgeAuthFunction extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: EdgeAuthFunctionProps) {
    super(scope, id);

    // Create Lambda@Edge function for authentication
    this.function = new lambda.Function(this, "EdgeAuthFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "lambdas/edge-auth")),
      environment: {
        USER_POOL_ID: props.userPool.userPoolId,
        USER_POOL_CLIENT_ID: props.userPoolClient.userPoolClientId,
        COGNITO_DOMAIN: `${props.baseName}-${props.account}`,
        CALLBACK_URL: `https://${props.environment === "dev" ? "dev." : ""}example.com/callback`,
      },
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
    });

    // Grant permissions to access Cognito User Pool
    props.userPool.grant(this.function, "cognito-idp:DescribeUserPool");
    props.userPool.grant(this.function, "cognito-idp:DescribeUserPoolClient");
  }
}
