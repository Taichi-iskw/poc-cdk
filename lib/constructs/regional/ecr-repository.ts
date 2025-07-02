import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";

export interface EcrRepositoryProps {
  environment: string;
  baseName: string;
}

export class EcrRepository extends Construct {
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrRepositoryProps) {
    super(scope, id);

    // Create ECR Repository
    this.repository = new ecr.Repository(this, "Repository", {
      repositoryName: `${props.baseName}-api`,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          maxImageCount: 5, // Keep only 5 latest images
        },
      ],
    });
  }
}
