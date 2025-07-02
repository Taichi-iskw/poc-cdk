#!/bin/bash

# CloudFront Distributionのorigin設定を更新するスクリプト
# 使用方法: ./scripts/configure-cloudfront.sh <environment>

set -e

ENVIRONMENT=${1:-dev}
DOMAIN_NAME=${DOMAIN_NAME:-example.com}
REGION=${CDK_DEFAULT_REGION:-ap-northeast-1}

echo "Configuring CloudFront origins for environment: $ENVIRONMENT"

# CDKアプリケーションを合成して、CloudFrontの設定を更新
cdk deploy SpaGlobalStack --require-approval never --context environment=$ENVIRONMENT --context domainName=$DOMAIN_NAME

echo "CloudFront origins configuration completed!" 