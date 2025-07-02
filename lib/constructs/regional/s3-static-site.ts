import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface S3StaticSiteProps {
  baseName: string;
  account: string;
}

export class S3StaticSite extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: S3StaticSiteProps) {
    super(scope, id);

    // Create S3 bucket for static site hosting
    this.bucket = new s3.Bucket(this, "StaticSiteBucket", {
      bucketName: `${props.baseName}-static-${props.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      versioned: false,
      publicReadAccess: false,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html", // SPA fallback
    });

    // Add CORS configuration for SPA
    this.bucket.addCorsRule({
      allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
      allowedOrigins: ["*"],
      allowedHeaders: ["*"],
      maxAge: 3000,
    });
  }

  // Method to grant CloudFront access to S3 bucket
  public grantCloudFrontAccess(cloudFrontDistributionId: string) {
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["s3:GetObject"],
        resources: [this.bucket.arnForObjects("*")],
        conditions: {
          StringEquals: {
            "AWS:SourceArn": `arn:aws:cloudfront::${
              cdk.Stack.of(this).account
            }:distribution/${cloudFrontDistributionId}`,
          },
        },
      })
    );
  }
}
