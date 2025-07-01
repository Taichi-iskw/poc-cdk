#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { SpaStack } from "../lib/spa-stack";
import { SpaGlobalStack } from "../lib/spa-global-stack";

const app = new cdk.App();

// Environment variables
const domainName = process.env.DOMAIN_NAME || "example.com";
const environment = process.env.ENVIRONMENT || "dev";
const repository = process.env.GITHUB_REPOSITORY || "username/poc-cdk";

const spaStack = new SpaStack(app, "SpaStack", {
  domainName,
  environment,
  repository,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "ap-northeast-1",
  },
  description: `SPA with authentication - ${environment} environment`,
  crossRegionReferences: true,
});

// CloudFront/ACMなどus-east-1で作成すべきグローバルリソース用Stack
const globalStack = new SpaGlobalStack(app, "SpaGlobalStack", {
  domainName,
  environment,
  repository,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
  description: `SPA Global resources - ${environment} environment`,
  crossRegionReferences: true,
});

// Apply removal policy to all resources for POC
// Note: Individual resources should set their own removal policy in their construct definitions

cdk.RemovalPolicies.of(app).destroy();
