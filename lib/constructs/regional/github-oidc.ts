import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { GitHubActionsRole } from "./github-actions-role";

export interface GitHubOidcProps {
  repository: string; // e.g., "username/repository"
  environment: string;
  baseName: string;
}

export class GitHubOidc extends Construct {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: GitHubOidcProps) {
    super(scope, id);

    // Create GitHub Actions Role
    const githubActionsRole = new GitHubActionsRole(this, "GitHubActionsRole", {
      repository: props.repository,
      environment: props.environment,
      baseName: props.baseName,
    });
    this.role = githubActionsRole.role;
  }
}
