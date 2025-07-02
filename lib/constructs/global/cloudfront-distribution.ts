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
  s3Bucket?: s3.IBucket; // S3 bucket for static site
  albLoadBalancer?: elbv2.IApplicationLoadBalancer; // ALB for API
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

    // Create CloudFront distribution with actual origins
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: props.s3Bucket
          ? new origins.S3StaticWebsiteOrigin(props.s3Bucket)
          : new origins.HttpOrigin("placeholder.example.com"), // Fallback for development
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
      additionalBehaviors: props.albLoadBalancer
        ? {
            "/api/*": {
              origin: new origins.LoadBalancerV2Origin(props.albLoadBalancer, {
                protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
                customHeaders: {
                  "X-Forwarded-Proto": "https",
                },
              }),
              viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
              allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
              cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
              compress: true,
              cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
              originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
            },
            "/callback": {
              origin: props.s3Bucket
                ? new origins.S3StaticWebsiteOrigin(props.s3Bucket)
                : new origins.HttpOrigin("placeholder.example.com"),
              viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
              allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
              cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
              compress: true,
              cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
              originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
            },
            "/logout": {
              origin: props.s3Bucket
                ? new origins.S3StaticWebsiteOrigin(props.s3Bucket)
                : new origins.HttpOrigin("placeholder.example.com"),
              viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
              allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
              cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
              compress: true,
              cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
              originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
            },
          }
        : undefined,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      comment: `${props.environment} SPA with authentication`,
      webAclId: props.webAclId,
      certificate: props.certificate,
      domainNames: [props.environment === "prod" ? props.domainName : `${props.environment}.${props.domainName}`],
    });

    this.cfnDistribution = this.distribution.node.defaultChild as cloudfront.CfnDistribution;
  }
}
