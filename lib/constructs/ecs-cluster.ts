import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";

export interface EcsClusterProps {
  environment: string;
  repository: ecr.Repository;
}

export class EcsCluster extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: EcsClusterProps) {
    super(scope, id);

    // Create VPC
    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
    });

    // Create ECS Cluster
    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc: this.vpc,
      clusterName: `${props.environment}-spa-cluster`,
    });

    // Create Task Definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    // Add container to task definition
    this.taskDefinition.addContainer("AppContainer", {
      image: ecs.ContainerImage.fromEcrRepository(props.repository, "latest"),
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
  }
}
