import * as cdk from "aws-cdk-lib";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";

export interface WafProps {
  environment: string;
  baseName: string;
}

export class Waf extends Construct {
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: WafProps) {
    super(scope, id);

    // Create WAF Web ACL with basic AWS Managed Rules
    this.webAcl = new wafv2.CfnWebACL(this, "WebACL", {
      name: `${props.baseName}-web-acl`,
      description: "WAF Web ACL for SPA application with basic AWS Managed Rules",
      scope: "CLOUDFRONT", // CloudFront用
      defaultAction: {
        allow: {},
      },
      rules: [
        // AWS Managed Rules - Common Rule Set (基本的な攻撃パターン)
        {
          name: "AWSManagedRulesCommonRuleSet",
          priority: 1,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
          overrideAction: {
            none: {},
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "AWSManagedRulesCommonRuleSet",
          },
        },
        // AWS Managed Rules - Known Bad Inputs (XSS, SQLi等)
        {
          name: "AWSManagedRulesKnownBadInputsRuleSet",
          priority: 2,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesKnownBadInputsRuleSet",
            },
          },
          overrideAction: {
            none: {},
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "AWSManagedRulesKnownBadInputsRuleSet",
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: "WebACLMetric",
      },
    });
  }
}
