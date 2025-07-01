import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface GitHubOidcProps {
  repository: string; // e.g., "username/repository"
  environment: string;
}

export class GitHubOidc extends Construct {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: GitHubOidcProps) {
    super(scope, id);

    // Use existing OIDC Identity Provider for GitHub
    const githubOidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GitHubOidcProvider",
      `arn:aws:iam::${cdk.Stack.of(this).account}:oidc-provider/token.actions.githubusercontent.com`
    );

    // Create IAM Role for GitHub Actions
    this.role = new iam.Role(this, "GitHubActionsRole", {
      roleName: `${props.environment}-github-actions-role`,
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${props.repository}:*`,
        },
      }),
      description: "Role for GitHub Actions to deploy SPA infrastructure",
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Create policy for CDK deployment
    const cdkDeployPolicy = new iam.Policy(this, "CdkDeployPolicy", {
      policyName: `${props.environment}-cdk-deploy-policy`,
      statements: [
        // CloudFormation permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["cloudformation:*"],
          resources: ["*"],
        }),
        // IAM permissions for CDK
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "iam:CreateRole",
            "iam:DeleteRole",
            "iam:GetRole",
            "iam:PutRolePolicy",
            "iam:DeleteRolePolicy",
            "iam:AttachRolePolicy",
            "iam:DetachRolePolicy",
            "iam:PassRole",
            "iam:TagRole",
            "iam:UntagRole",
          ],
          resources: ["*"],
        }),
        // S3 permissions for CDK assets
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "s3:CreateBucket",
            "s3:DeleteBucket",
            "s3:GetBucketLocation",
            "s3:GetBucketPolicy",
            "s3:PutBucketPolicy",
            "s3:DeleteBucketPolicy",
            "s3:PutBucketVersioning",
            "s3:PutBucketPublicAccessBlock",
            "s3:PutBucketEncryption",
            "s3:PutBucketCors",
            "s3:PutObject",
            "s3:GetObject",
            "s3:DeleteObject",
            "s3:ListBucket",
          ],
          resources: [
            "arn:aws:s3:::cdk-*",
            "arn:aws:s3:::cdk-*/*",
            "arn:aws:s3:::*-spa-static-*",
            "arn:aws:s3:::*-spa-static-*/*",
          ],
        }),
        // CloudFront permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["cloudfront:*"],
          resources: ["*"],
        }),
        // Cognito permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["cognito-idp:*"],
          resources: ["*"],
        }),
        // Lambda permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["lambda:*"],
          resources: ["*"],
        }),
        // ECS permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["ecs:*"],
          resources: ["*"],
        }),
        // EC2 permissions for VPC and ALB
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["ec2:*"],
          resources: ["*"],
        }),
        // ELB permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["elasticloadbalancing:*"],
          resources: ["*"],
        }),
        // CloudWatch Logs permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["logs:*"],
          resources: ["*"],
        }),
        // Route53 permissions (if using custom domain)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["route53:*"],
          resources: ["*"],
        }),
        // ACM permissions (if using custom domain)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["acm:*"],
          resources: ["*"],
        }),
        // Secrets Manager permissions (if needed)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "secretsmanager:GetSecretValue",
            "secretsmanager:CreateSecret",
            "secretsmanager:UpdateSecret",
            "secretsmanager:DeleteSecret",
          ],
          resources: ["*"],
        }),
        // KMS permissions (if using encryption)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "kms:Decrypt",
            "kms:DescribeKey",
            "kms:Encrypt",
            "kms:ReEncrypt*",
            "kms:GenerateDataKey*",
            "kms:CreateGrant",
            "kms:ListGrants",
            "kms:RevokeGrant",
          ],
          resources: ["*"],
        }),
      ],
    });

    // Attach policy to role
    this.role.attachInlinePolicy(cdkDeployPolicy);

    // Add managed policy for CloudWatch Logs
    this.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess"));

    // Add managed policy for AWSCloudFormationFullAccess
    this.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCloudFormationFullAccess"));

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

      this.role.attachInlinePolicy(prodRestrictionsPolicy);
    }
  }
}
