#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { SpaStack } from "../lib/spa-stack";

const app = new cdk.App();

// Environment variables
const domainName = process.env.DOMAIN_NAME || "example.com";
const environment = process.env.ENVIRONMENT || "dev";
const repository = process.env.GITHUB_REPOSITORY || "username/poc-cdk";

new SpaStack(app, "SpaStack", {
  domainName,
  environment,
  repository,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  description: `SPA with authentication - ${environment} environment`,
});
