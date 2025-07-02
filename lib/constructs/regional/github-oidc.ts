import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { GitHubActionsRole } from "./github-actions-role";

export interface GitHubOidcProps {
  repository: string; // e.g., "username/repository"
  environment: string;
}

export class GitHubOidc extends Construct {
  public readonly role: any;

  constructor(scope: Construct, id: string, props: GitHubOidcProps) {
    super(scope, id);

    // Create GitHub Actions Role
    const githubActionsRole = new GitHubActionsRole(this, "GitHubActionsRole", {
      repository: props.repository,
      environment: props.environment,
    });
    this.role = githubActionsRole.role;
  }
}
