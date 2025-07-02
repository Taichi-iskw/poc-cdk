import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface ProductionRestrictionsProps {
  environment: string;
  role: iam.Role;
}

export class ProductionRestrictions extends Construct {
  constructor(scope: Construct, id: string, props: ProductionRestrictionsProps) {
    super(scope, id);

    // Create a more restrictive policy for production
    if (props.environment === "prod") {
      const prodRestrictionsPolicy = new iam.Policy(this, "ProdRestrictionsPolicy", {
        policyName: `${props.environment}-prod-restrictions-policy`,
        statements: [
          // Deny deletion of production resources
          new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            actions: [
              "cloudformation:DeleteStack",
              "s3:DeleteBucket",
              "cognito-idp:DeleteUserPool",
              "lambda:DeleteFunction",
              "ecs:DeleteService",
              "ecs:DeleteCluster",
            ],
            resources: ["*"],
            conditions: {
              StringEquals: {
                "aws:RequestTag/Environment": "prod",
              },
            },
          }),
          // Require MFA for sensitive operations
          new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            actions: [
              "iam:CreateAccessKey",
              "iam:DeleteAccessKey",
              "iam:UpdateAccessKey",
              "iam:CreateLoginProfile",
              "iam:DeleteLoginProfile",
              "iam:UpdateLoginProfile",
            ],
            resources: ["*"],
            conditions: {
              Bool: {
                "aws:MultiFactorAuthPresent": "false",
              },
            },
          }),
        ],
      });

      props.role.attachInlinePolicy(prodRestrictionsPolicy);
    }
  }
}
