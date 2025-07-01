import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export interface AlbServiceProps {
  environment: string;
  vpc: ec2.Vpc;
  cluster: ecs.Cluster;
  taskDefinition: ecs.FargateTaskDefinition;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  userPoolDomain: cognito.UserPoolDomain;
}

export class AlbService extends Construct {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: AlbServiceProps) {
    super(scope, id);

    // Create ALB
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: `${props.environment}-spa-alb`,
    });

    // CloudFrontのマネージドプレフィックスリストID
    const cloudFrontPrefixListId = "pl-68a54001";
    this.loadBalancer.connections.allowFrom(
      ec2.Peer.prefixList(cloudFrontPrefixListId),
      ec2.Port.tcp(80),
      "Allow CloudFront only"
    );

    // Create Target Group
    this.targetGroup = new elbv2.ApplicationTargetGroup(this, "TargetGroup", {
      vpc: props.vpc,
      port: 5000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/health",
        healthyHttpCodes: "200",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // Create Fargate Service
    this.service = new ecs.FargateService(this, "Service", {
      cluster: props.cluster,
      taskDefinition: props.taskDefinition,
      serviceName: `${props.environment}-spa-service`,
      desiredCount: 2,
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    // Attach service to target group
    this.service.attachToApplicationTargetGroup(this.targetGroup);

    // Create ALB Listener
    const listener = this.loadBalancer.addListener("Listener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([this.targetGroup]),
    });

    // Add rule for API paths with OIDC authentication using Cognito
    listener.addAction("ApiAuthAction", {
      priority: 100,
      conditions: [elbv2.ListenerCondition.pathPatterns(["/api/*"])],
      action: elbv2.ListenerAction.authenticateOidc({
        authorizationEndpoint: `https://${props.userPoolDomain.domainName}.auth.${
          cdk.Stack.of(this).region
        }.amazoncognito.com/oauth2/authorize`,
        tokenEndpoint: `https://${props.userPoolDomain.domainName}.auth.${
          cdk.Stack.of(this).region
        }.amazoncognito.com/oauth2/token`,
        userInfoEndpoint: `https://${props.userPoolDomain.domainName}.auth.${
          cdk.Stack.of(this).region
        }.amazoncognito.com/oauth2/userInfo`,
        clientId: props.userPoolClient.userPoolClientId,
        clientSecret: props.userPoolClient.userPoolClientSecret!,
        issuer: `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${props.userPool.userPoolId}`,
        scope: "openid email profile",
        sessionTimeout: cdk.Duration.days(1),
        next: elbv2.ListenerAction.forward([this.targetGroup]),
      }),
    });

    // Add rule for health check endpoint (no authentication required)
    listener.addAction("HealthCheckAction", {
      priority: 200,
      conditions: [elbv2.ListenerCondition.pathPatterns(["/health"])],
      action: elbv2.ListenerAction.forward([this.targetGroup]),
    });

    // Allow ALB to access ECS service
    this.service.connections.allowFrom(this.loadBalancer, ec2.Port.tcp(5000));

    // Add security group rules
    const serviceSecurityGroup = this.service.connections.securityGroups[0];
    serviceSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5000), "Allow inbound traffic from ALB");
  }
}
