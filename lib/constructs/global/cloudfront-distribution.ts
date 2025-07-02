import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";

export interface CloudFrontDistributionProps {
  domainName: string;
  environment: string;
  baseName: string;
  certificate: acm.ICertificate;
  webAclId?: string; // Optional WAF Web ACL ID
  edgeAuthFunction?: lambda.Function; // Optional for initial creation
}

export interface CloudFrontOriginProps {
  s3Bucket: s3.IBucket;
  albLoadBalancer: elbv2.IApplicationLoadBalancer;
  edgeAuthFunction: lambda.Function;
}

export class CloudFrontDistribution extends Construct {
  public readonly distribution: cloudfront.Distribution;
  private readonly cfnDistribution: cloudfront.CfnDistribution;
  private readonly originAccessControl: cloudfront.CfnOriginAccessControl;

  constructor(scope: Construct, id: string, props: CloudFrontDistributionProps) {
    super(scope, id);

    // Create CloudFront Origin Access Control for S3
    this.originAccessControl = new cloudfront.CfnOriginAccessControl(this, "OriginAccessControl", {
      originAccessControlConfig: {
        name: `${props.baseName}-oac`,
        originAccessControlOriginType: "s3",
        signingBehavior: "always",
        signingProtocol: "sigv4",
      },
    });

    // Create CloudFront distribution with minimal configuration
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new origins.HttpOrigin("placeholder.example.com"), // Placeholder origin
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        functionAssociations: props.edgeAuthFunction
          ? [
              {
                function: new cloudfront.Function(this, "SpaFunction", {
                  code: cloudfront.FunctionCode.fromInline(`
                function handler(event) {
                  var request = event.request;
                  var uri = request.uri;
                  
                  // Check whether the URI is missing a file extension
                  if (uri.endsWith('/')) {
                    request.uri += 'index.html';
                  } else if (!uri.includes('.')) {
                    request.uri += '/index.html';
                  }
                  
                  return request;
                }
              `),
                }),
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              },
              {
                function: props.edgeAuthFunction,
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              },
            ]
          : [
              {
                function: new cloudfront.Function(this, "SpaFunction", {
                  code: cloudfront.FunctionCode.fromInline(`
                function handler(event) {
                  var request = event.request;
                  var uri = request.uri;
                  
                  // Check whether the URI is missing a file extension
                  if (uri.endsWith('/')) {
                    request.uri += 'index.html';
                  } else if (!uri.includes('.')) {
                    request.uri += '/index.html';
                  }
                  
                  return request;
                }
              `),
                }),
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              },
            ],
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      comment: `${props.environment} SPA with authentication`,
      webAclId: props.webAclId,
      certificate: props.certificate,
      domainNames: [props.environment === "prod" ? props.domainName : `${props.environment}.${props.domainName}`],
    });

    this.cfnDistribution = this.distribution.node.defaultChild as cloudfront.CfnDistribution;
  }

  public configureOrigins(props: CloudFrontOriginProps): void {
    // Create S3 origin
    const s3Origin = new origins.S3StaticWebsiteOrigin(props.s3Bucket);

    // Create ALB origin
    const albOrigin = new origins.LoadBalancerV2Origin(props.albLoadBalancer, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      customHeaders: {
        "X-Forwarded-Proto": "https",
      },
    });

    // Update distribution with actual origins
    this.cfnDistribution.addPropertyOverride("DistributionConfig.DefaultCacheBehavior.TargetOriginId", "S3Origin");
    this.cfnDistribution.addPropertyOverride("DistributionConfig.Origins", [
      {
        Id: "S3Origin",
        DomainName: props.s3Bucket.bucketWebsiteDomainName,
        S3OriginConfig: {
          OriginAccessIdentity: "",
        },
        OriginAccessControlId: this.originAccessControl.attrId,
      },
      {
        Id: "ALBOrigin",
        DomainName: props.albLoadBalancer.loadBalancerDnsName,
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy: "http-only",
          OriginSSLProtocols: ["TLSv1.2"],
        },
        CustomHeaders: [
          {
            HeaderName: "X-Forwarded-Proto",
            HeaderValue: "https",
          },
        ],
      },
    ]);

    // Update default behavior
    this.cfnDistribution.addPropertyOverride("DistributionConfig.DefaultCacheBehavior.TargetOriginId", "S3Origin");

    // Add additional behaviors
    this.cfnDistribution.addPropertyOverride("DistributionConfig.CacheBehaviors", [
      {
        PathPattern: "/api/*",
        TargetOriginId: "ALBOrigin",
        ViewerProtocolPolicy: "redirect-to-https",
        AllowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
        CachedMethods: ["GET", "HEAD", "OPTIONS"],
        Compress: true,
        CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", // CachingDisabled
        OriginRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac", // AllViewer
      },
      {
        PathPattern: "/callback",
        TargetOriginId: "S3Origin",
        ViewerProtocolPolicy: "redirect-to-https",
        AllowedMethods: ["GET", "HEAD", "OPTIONS"],
        CachedMethods: ["GET", "HEAD", "OPTIONS"],
        Compress: true,
        CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", // CachingDisabled
        OriginRequestPolicyId: "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf", // CORS-S3Origin
      },
      {
        PathPattern: "/logout",
        TargetOriginId: "S3Origin",
        ViewerProtocolPolicy: "redirect-to-https",
        AllowedMethods: ["GET", "HEAD", "OPTIONS"],
        CachedMethods: ["GET", "HEAD", "OPTIONS"],
        Compress: true,
        CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", // CachingDisabled
        OriginRequestPolicyId: "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf", // CORS-S3Origin
      },
    ]);

    // Grant CloudFront access to S3 bucket using OAC
    props.s3Bucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["s3:GetObject"],
        resources: [props.s3Bucket.arnForObjects("*")],
        conditions: {
          StringEquals: {
            "AWS:SourceArn": `arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${
              this.distribution.distributionId
            }`,
          },
        },
      })
    );
  }
}
