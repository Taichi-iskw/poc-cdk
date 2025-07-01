import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";

export interface AlbFargateProps {
  environment: string;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  userPoolDomain: cognito.UserPoolDomain;
}

export class AlbFargate extends Construct {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly service: ecs.FargateService;
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: AlbFargateProps) {
    super(scope, id);

    // Create ECR Repository
    this.repository = new ecr.Repository(this, "Repository", {
      repositoryName: `${props.environment}-spa-api`,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          maxImageCount: 5, // Keep only 5 latest images
        },
      ],
    });

    // Create VPC
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
    });
    (vpc.node.defaultChild as cdk.CfnResource).applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: `${props.environment}-spa-cluster`,
    });
    (cluster.node.defaultChild as cdk.CfnResource).applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Create Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
      memoryLimitMiB: 512,
      cpu: 256,
    });
    (taskDefinition.node.defaultChild as cdk.CfnResource).applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Add container to task definition
    const container = taskDefinition.addContainer("AppContainer", {
      image: ecs.ContainerImage.fromEcrRepository(this.repository, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `${props.environment}-spa-api`,
      }),
      environment: {
        ENVIRONMENT: props.environment,
      },
      portMappings: [
        {
          containerPort: 5000,
          protocol: ecs.Protocol.TCP,
        },
      ],
    });

    // Create ALB
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc,
      internetFacing: true,
      loadBalancerName: `${props.environment}-spa-alb`,
    });
    (this.loadBalancer.node.defaultChild as cdk.CfnResource).applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Create Target Group
    this.targetGroup = new elbv2.ApplicationTargetGroup(this, "TargetGroup", {
      vpc,
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
    (this.targetGroup.node.defaultChild as cdk.CfnResource).applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Create Fargate Service
    this.service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      serviceName: `${props.environment}-spa-service`,
      desiredCount: 2,
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });
    (this.service.node.defaultChild as cdk.CfnResource).applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

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
