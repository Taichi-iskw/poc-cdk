import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface GitHubActionsRoleProps {
  repository: string; // e.g., "username/repository"
  environment: string;
}

export class GitHubActionsRole extends Construct {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: GitHubActionsRoleProps) {
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

    // Create policy for CDK deployment with minimal permissions
    const cdkDeployPolicy = new iam.Policy(this, "CdkDeployPolicy", {
      policyName: `${props.environment}-cdk-deploy-policy`,
      statements: [
        // CloudFormation permissions (limited to specific stacks)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "cloudformation:CreateStack",
            "cloudformation:UpdateStack",
            "cloudformation:DeleteStack",
            "cloudformation:DescribeStacks",
            "cloudformation:ListStacks",
            "cloudformation:GetTemplateSummary",
            "cloudformation:ValidateTemplate",
            "cloudformation:DescribeStackEvents",
            "cloudformation:DescribeStackResources",
          ],
          resources: [
            `arn:aws:cloudformation:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stack/${
              props.environment
            }-*/*`,
            `arn:aws:cloudformation:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stack/SpaStack/*`,
            `arn:aws:cloudformation:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stack/SpaGlobalStack/*`,
          ],
        }),
        // IAM permissions for CDK (limited to specific roles)
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
            "iam:CreatePolicy",
            "iam:DeletePolicy",
            "iam:AttachRolePolicy",
            "iam:DetachRolePolicy",
          ],
          resources: [
            `arn:aws:iam::${cdk.Stack.of(this).account}:role/${props.environment}-*`,
            `arn:aws:iam::${cdk.Stack.of(this).account}:policy/${props.environment}-*`,
            `arn:aws:iam::${cdk.Stack.of(this).account}:role/cdk-*`,
            `arn:aws:iam::${cdk.Stack.of(this).account}:policy/cdk-*`,
          ],
        }),
        // S3 permissions for CDK assets and static site
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
            "s3:DeleteBucket",
          ],
          resources: [
            `arn:aws:s3:::cdk-*`,
            `arn:aws:s3:::cdk-*/*`,
            `arn:aws:s3:::${props.environment}-spa-static-*`,
            `arn:aws:s3:::${props.environment}-spa-static-*/*`,
          ],
        }),
        // CloudWatch Logs permissions (limited to specific log groups)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
            "logs:DescribeLogGroups",
            "logs:DescribeLogStreams",
            "logs:DeleteLogGroup",
          ],
          resources: [
            `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/lambda/${
              props.environment
            }-*`,
            `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/ecs/${
              props.environment
            }-*`,
            `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:cdk-*`,
          ],
        }),
        // ECR permissions (limited to specific repositories)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "ecr:CreateRepository",
            "ecr:DeleteRepository",
            "ecr:DescribeRepositories",
            "ecr:GetRepositoryPolicy",
            "ecr:SetRepositoryPolicy",
            "ecr:DeleteRepositoryPolicy",
            "ecr:GetLifecyclePolicy",
            "ecr:PutLifecyclePolicy",
            "ecr:DeleteLifecyclePolicy",
          ],
          resources: [
            `arn:aws:ecr:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:repository/${props.environment}-*`,
          ],
        }),
        // Lambda permissions (limited to specific functions)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "lambda:CreateFunction",
            "lambda:DeleteFunction",
            "lambda:GetFunction",
            "lambda:UpdateFunctionCode",
            "lambda:UpdateFunctionConfiguration",
            "lambda:AddPermission",
            "lambda:RemovePermission",
            "lambda:GetPolicy",
            "lambda:PutFunctionConcurrency",
            "lambda:DeleteFunctionConcurrency",
          ],
          resources: [
            `arn:aws:lambda:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:function:${props.environment}-*`,
            `arn:aws:lambda:us-east-1:${cdk.Stack.of(this).account}:function:${props.environment}-*`,
          ],
        }),
        // ECS permissions (limited to specific clusters and services)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "ecs:CreateCluster",
            "ecs:DeleteCluster",
            "ecs:DescribeClusters",
            "ecs:CreateService",
            "ecs:DeleteService",
            "ecs:UpdateService",
            "ecs:DescribeServices",
            "ecs:RegisterTaskDefinition",
            "ecs:DeregisterTaskDefinition",
            "ecs:DescribeTaskDefinition",
            "ecs:ListTasks",
            "ecs:DescribeTasks",
          ],
          resources: [
            `arn:aws:ecs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:cluster/${props.environment}-*`,
            `arn:aws:ecs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:service/${props.environment}-*`,
            `arn:aws:ecs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:task-definition/${
              props.environment
            }-*`,
            `arn:aws:ecs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:task/${props.environment}-*`,
          ],
        }),
        // EC2 permissions (limited to specific VPC and security groups)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "ec2:CreateVpc",
            "ec2:DeleteVpc",
            "ec2:DescribeVpcs",
            "ec2:CreateSubnet",
            "ec2:DeleteSubnet",
            "ec2:DescribeSubnets",
            "ec2:CreateSecurityGroup",
            "ec2:DeleteSecurityGroup",
            "ec2:DescribeSecurityGroups",
            "ec2:AuthorizeSecurityGroupIngress",
            "ec2:RevokeSecurityGroupIngress",
            "ec2:CreateInternetGateway",
            "ec2:DeleteInternetGateway",
            "ec2:AttachInternetGateway",
            "ec2:DetachInternetGateway",
            "ec2:CreateRouteTable",
            "ec2:DeleteRouteTable",
            "ec2:CreateRoute",
            "ec2:DeleteRoute",
            "ec2:AssociateRouteTable",
            "ec2:DisassociateRouteTable",
            "ec2:CreateNatGateway",
            "ec2:DeleteNatGateway",
            "ec2:AllocateAddress",
            "ec2:ReleaseAddress",
          ],
          resources: ["*"],
          conditions: {
            StringEquals: {
              "aws:RequestTag/Environment": props.environment,
            },
          },
        }),
        // ELB permissions (limited to specific load balancers)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "elasticloadbalancing:CreateLoadBalancer",
            "elasticloadbalancing:DeleteLoadBalancer",
            "elasticloadbalancing:DescribeLoadBalancers",
            "elasticloadbalancing:CreateTargetGroup",
            "elasticloadbalancing:DeleteTargetGroup",
            "elasticloadbalancing:DescribeTargetGroups",
            "elasticloadbalancing:CreateListener",
            "elasticloadbalancing:DeleteListener",
            "elasticloadbalancing:DescribeListeners",
            "elasticloadbalancing:ModifyListener",
            "elasticloadbalancing:RegisterTargets",
            "elasticloadbalancing:DeregisterTargets",
          ],
          resources: [
            `arn:aws:elasticloadbalancing:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:loadbalancer/${
              props.environment
            }-*`,
            `arn:aws:elasticloadbalancing:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:targetgroup/${
              props.environment
            }-*`,
            `arn:aws:elasticloadbalancing:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:listener/${
              props.environment
            }-*`,
          ],
        }),
        // Cognito permissions (limited to specific user pools)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "cognito-idp:CreateUserPool",
            "cognito-idp:DeleteUserPool",
            "cognito-idp:DescribeUserPool",
            "cognito-idp:UpdateUserPool",
            "cognito-idp:CreateUserPoolClient",
            "cognito-idp:DeleteUserPoolClient",
            "cognito-idp:DescribeUserPoolClient",
            "cognito-idp:UpdateUserPoolClient",
            "cognito-idp:CreateUserPoolDomain",
            "cognito-idp:DeleteUserPoolDomain",
            "cognito-idp:DescribeUserPoolDomain",
            "cognito-idp:CreateUserPoolUser",
            "cognito-idp:DeleteUserPoolUser",
          ],
          resources: [
            `arn:aws:cognito-idp:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:userpool/${
              props.environment
            }-*`,
          ],
        }),
        // CloudFront permissions (limited to specific distributions)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "cloudfront:CreateDistribution",
            "cloudfront:DeleteDistribution",
            "cloudfront:GetDistribution",
            "cloudfront:UpdateDistribution",
            "cloudfront:CreateInvalidation",
            "cloudfront:GetInvalidation",
            "cloudfront:ListInvalidations",
          ],
          resources: [`arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/*`],
        }),
        // ACM permissions (limited to specific certificates)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "acm:RequestCertificate",
            "acm:DeleteCertificate",
            "acm:DescribeCertificate",
            "acm:ListCertificates",
            "acm:GetCertificate",
          ],
          resources: [
            `arn:aws:acm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:certificate/*`,
            `arn:aws:acm:us-east-1:${cdk.Stack.of(this).account}:certificate/*`,
          ],
        }),
        // WAF permissions (limited to specific web ACLs)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "wafv2:CreateWebACL",
            "wafv2:DeleteWebACL",
            "wafv2:GetWebACL",
            "wafv2:UpdateWebACL",
            "wafv2:ListWebACLs",
            "wafv2:CreateIPSet",
            "wafv2:DeleteIPSet",
            "wafv2:GetIPSet",
            "wafv2:UpdateIPSet",
            "wafv2:ListIPSets",
            "wafv2:CreateRuleGroup",
            "wafv2:DeleteRuleGroup",
            "wafv2:GetRuleGroup",
            "wafv2:UpdateRuleGroup",
            "wafv2:ListRuleGroups",
          ],
          resources: [
            `arn:aws:wafv2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:regional/webacl/${
              props.environment
            }-*`,
            `arn:aws:wafv2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:regional/ipset/${
              props.environment
            }-*`,
            `arn:aws:wafv2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:regional/rulegroup/${
              props.environment
            }-*`,
            `arn:aws:wafv2:us-east-1:${cdk.Stack.of(this).account}:global/webacl/${props.environment}-*`,
            `arn:aws:wafv2:us-east-1:${cdk.Stack.of(this).account}:global/ipset/${props.environment}-*`,
            `arn:aws:wafv2:us-east-1:${cdk.Stack.of(this).account}:global/rulegroup/${props.environment}-*`,
          ],
        }),
        // Route53 permissions (for domain and DNS management)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "route53:ListHostedZones",
            "route53:GetChange",
            "route53:ChangeResourceRecordSets",
            "route53:ListResourceRecordSets",
            "route53:GetHostedZone",
            "route53:CreateHostedZone",
            "route53:DeleteHostedZone",
          ],
          resources: [`arn:aws:route53:::hostedzone/*`, `arn:aws:route53:::change/*`],
        }),
      ],
    });

    // Attach policy to role
    this.role.attachInlinePolicy(cdkDeployPolicy);
  }
}
