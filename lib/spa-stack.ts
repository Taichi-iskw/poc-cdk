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

    // Outputs - Essential information for development and deployment
    new cdk.CfnOutput(this, "UserPoolId", {
      value: cognito.userPool.userPoolId,
      description: "Cognito User Pool ID for frontend authentication",
    });

    new cdk.CfnOutput(this, "CognitoDomain", {
      value: cognito.userPoolDomain.domainName,
      description: "Cognito Domain Name for frontend authentication",
    });

    new cdk.CfnOutput(this, "GitHubActionsRoleArn", {
      value: githubOidc.role.roleArn,
      description: "GitHub Actions IAM Role ARN for deployment",
    });

    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: albFargate.repository.repositoryUri,
      description: "ECR Repository URI for container image push",
    });
  }
}
