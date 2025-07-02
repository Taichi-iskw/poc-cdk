import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { EcrRepository } from "./ecr-repository";
import { EcsCluster } from "./ecs-cluster";
import { AlbService } from "./alb-service";

export interface AlbFargateProps {
  environment: string;
  baseName: string;
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
    const ecrRepo = new EcrRepository(this, "EcrRepository", {
      environment: props.environment,
      baseName: props.baseName,
    });
    this.repository = ecrRepo.repository;

    // Create ECS Cluster
    const ecsCluster = new EcsCluster(this, "EcsCluster", {
      environment: props.environment,
      baseName: props.baseName,
      repository: ecrRepo.repository,
    });

    // Create ALB Service
    const albService = new AlbService(this, "AlbService", {
      environment: props.environment,
      baseName: props.baseName,
      vpc: ecsCluster.vpc,
      cluster: ecsCluster.cluster,
      taskDefinition: ecsCluster.taskDefinition,
      userPool: props.userPool,
      userPoolClient: props.userPoolClient,
      userPoolDomain: props.userPoolDomain,
    });

    this.loadBalancer = albService.loadBalancer;
    this.targetGroup = albService.targetGroup;
    this.service = albService.service;
  }
}
