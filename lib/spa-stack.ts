import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { S3StaticSite } from "./constructs/regional/s3-static-site";
import { CognitoAuth } from "./constructs/regional/cognito";
import { AlbFargate } from "./constructs/regional/alb-fargate";
import { GitHubOidc } from "./constructs/regional/github-oidc";

export interface SpaStackProps extends cdk.StackProps {
  domainName: string;
  environment: string;
  repository: string; // GitHub repository (e.g., "username/repository")
  baseName: string;
  account: string;
}

export class SpaStack extends cdk.Stack {
  public readonly s3Bucket: s3.Bucket;
  public readonly albLoadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: SpaStackProps) {
    super(scope, id, props);

    // Create S3 static site
    const s3Site = new S3StaticSite(this, "S3StaticSite", {
      baseName: props.baseName,
      account: props.account,
    });
    this.s3Bucket = s3Site.bucket;

    // Create Cognito User Pool
    const cognito = new CognitoAuth(this, "CognitoAuth", {
      domainName: props.domainName,
      environment: props.environment,
      baseName: props.baseName,
      account: props.account,
    });
    this.userPool = cognito.userPool;
    this.userPoolClient = cognito.userPoolClient;

    // Create ALB + Fargate backend
    const albFargate = new AlbFargate(this, "AlbFargate", {
      environment: props.environment,
      baseName: props.baseName,
      userPool: cognito.userPool,
      userPoolClient: cognito.albUserPoolClient,
      userPoolDomain: cognito.userPoolDomain,
    });
    this.albLoadBalancer = albFargate.loadBalancer;

    // Update ALB client callback URLs with actual ALB DNS name
    cognito.updateAlbClientCallbackUrls(albFargate.loadBalancer.loadBalancerDnsName);

    // Create GitHub OIDC for CI/CD (uses existing OIDC provider)
    const githubOidc = new GitHubOidc(this, "GitHubOidc", {
      repository: props.repository,
      environment: props.environment,
      baseName: props.baseName,
    });

    // Export resources for cross-stack reference
    new cdk.CfnOutput(this, "S3BucketName", {
      value: s3Site.bucket.bucketName,
      description: "S3 Bucket Name",
      exportName: `${props.baseName}-s3-bucket-name`,
    });

    new cdk.CfnOutput(this, "AlbLoadBalancerArn", {
      value: albFargate.loadBalancer.loadBalancerArn,
      description: "ALB Load Balancer ARN",
      exportName: `${props.baseName}-alb-load-balancer-arn`,
    });

    new cdk.CfnOutput(this, "AlbLoadBalancerDnsName", {
      value: albFargate.loadBalancer.loadBalancerDnsName,
      description: "ALB Load Balancer DNS Name",
      exportName: `${props.baseName}-alb-load-balancer-dns-name`,
    });

    new cdk.CfnOutput(this, "UserPoolArn", {
      value: cognito.userPool.userPoolArn,
      description: "Cognito User Pool ARN",
      exportName: `${props.baseName}-user-pool-arn`,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: cognito.userPoolClient.userPoolClientId,
      description: "Cognito User Pool Client ID",
      exportName: `${props.baseName}-user-pool-client-id`,
    });

    // Outputs
    new cdk.CfnOutput(this, "UserPoolId", {
      value: cognito.userPool.userPoolId,
      description: "Cognito User Pool ID",
    });

    new cdk.CfnOutput(this, "CognitoDomain", {
      value: cognito.userPoolDomain.domainName,
      description: "Cognito Domain Name",
    });

    new cdk.CfnOutput(this, "AlbDnsName", {
      value: albFargate.loadBalancer.loadBalancerDnsName,
      description: "Application Load Balancer DNS Name",
    });

    new cdk.CfnOutput(this, "GitHubActionsRoleArn", {
      value: githubOidc.role.roleArn,
      description: "GitHub Actions IAM Role ARN",
    });

    new cdk.CfnOutput(this, "GitHubActionsRoleName", {
      value: githubOidc.role.roleName,
      description: "GitHub Actions IAM Role Name",
    });

    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: albFargate.repository.repositoryUri,
      description: "ECR Repository URI",
    });

    new cdk.CfnOutput(this, "EcrRepositoryName", {
      value: albFargate.repository.repositoryName,
      description: "ECR Repository Name",
    });

    // Configure CloudFront origins after all resources are created
    // This will be called by the global stack after this stack is deployed
    this.node.addDependency(albFargate);
    this.node.addDependency(cognito);
    this.node.addDependency(s3Site);
  }
}
