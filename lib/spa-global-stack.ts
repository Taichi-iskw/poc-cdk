import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53_targets from "aws-cdk-lib/aws-route53-targets";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";
import { CloudFrontDistribution } from "./constructs/global/cloudfront-distribution";
import { EdgeAuthFunction } from "./constructs/global/edge-auth";
import { Waf } from "./constructs/global/waf";
// 必要に応じてACMや他のリソースもimport

export interface SpaGlobalStackProps extends cdk.StackProps {
  domainName: string;
  environment: string;
  repository: string;
}

export class SpaGlobalStack extends cdk.Stack {
  public readonly certificate: acm.Certificate;
  public readonly cloudFrontDistribution: CloudFrontDistribution;
  public readonly edgeAuthFunction: EdgeAuthFunction;
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: SpaGlobalStackProps) {
    super(scope, id, props);

    // Create ACM Certificate for CloudFront
    this.certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.domainName,
      subjectAlternativeNames: [
        `*.${props.environment}.${props.domainName}`,
        `${props.environment}.${props.domainName}`,
      ],
      validation: acm.CertificateValidation.fromDns(),
    });

    // Create WAF Web ACL
    const waf = new Waf(this, "Waf", {
      environment: props.environment,
    });
    this.webAcl = waf.webAcl;

    // Create Lambda@Edge function for authentication
    this.edgeAuthFunction = new EdgeAuthFunction(this, "EdgeAuthFunction", {
      userPool: cognito.UserPool.fromUserPoolArn(
        this,
        "ImportedUserPool",
        cdk.Fn.importValue(`${props.environment}-spa-user-pool-arn`)
      ),
      userPoolClient: cognito.UserPoolClient.fromUserPoolClientId(
        this,
        "ImportedUserPoolClient",
        cdk.Fn.importValue(`${props.environment}-spa-user-pool-client-id`)
      ),
      environment: props.environment,
    });

    // Create CloudFront distribution (basic configuration only)
    this.cloudFrontDistribution = new CloudFrontDistribution(this, "CloudFrontDistribution", {
      domainName: props.domainName,
      environment: props.environment,
      certificate: this.certificate,
      webAclId: waf.webAcl.attrId,
      edgeAuthFunction: this.edgeAuthFunction.function,
    });

    // Route53: HostedZone lookup & ARecord for CloudFront
    // Note: Uncomment after first deployment when HostedZone is available
    // const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
    //   domainName: props.domainName,
    // });
    // new route53.ARecord(this, "CloudFrontAliasRecord", {
    //   zone: hostedZone,
    //   recordName: props.environment === "prod" ? props.domainName : `${props.environment}.${props.domainName}`,
    //   target: route53.RecordTarget.fromAlias(
    //     new route53_targets.CloudFrontTarget(this.cloudFrontDistribution.distribution)
    //   ),
    // });

    // Outputs
    new cdk.CfnOutput(this, "CertificateArn", {
      value: this.certificate.certificateArn,
      description: "ACM Certificate ARN",
    });

    new cdk.CfnOutput(this, "WebAclId", {
      value: waf.webAcl.attrId,
      description: "WAF Web ACL ID",
    });

    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: this.cloudFrontDistribution.distribution.distributionId,
      description: "CloudFront Distribution ID",
    });

    new cdk.CfnOutput(this, "CloudFrontDomainName", {
      value: this.cloudFrontDistribution.distribution.distributionDomainName,
      description: "CloudFront Domain Name",
    });
  }

  // Method to configure CloudFront origins after regional resources are created
  public configureCloudFrontOrigins(): void {
    // Import resources from SpaStack
    const s3Bucket = s3.Bucket.fromBucketName(
      this,
      "ImportedS3Bucket",
      cdk.Fn.importValue(`${this.environment}-spa-s3-bucket-name`)
    );

    const albLoadBalancer = elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, "ImportedALB", {
      loadBalancerArn: cdk.Fn.importValue(`${this.environment}-spa-alb-load-balancer-arn`),
      loadBalancerDnsName: cdk.Fn.importValue(`${this.environment}-spa-alb-load-balancer-dns-name`),
      securityGroupId: "sg-placeholder", // This will be replaced by actual SG ID if needed
    });

    // Configure CloudFront origins
    this.cloudFrontDistribution.configureOrigins({
      s3Bucket,
      albLoadBalancer,
      edgeAuthFunction: this.edgeAuthFunction.function,
    });
  }
}
