#!/bin/bash
# GitHub OIDC Providerを作成するスクリプト
# 既に存在する場合は何もしません
# 必要に応じてAWS CLIのprofileやregionを指定してください

set -e

# 変数
PROVIDER_URL="token.actions.githubusercontent.com"
AUDIENCE="sts.amazonaws.com"
THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1" # 2024年6月時点のGitHub Actions OIDC thumbprint

# 既存のOIDCプロバイダーを確認
EXISTING=$(aws iam list-open-id-connect-providers | grep $PROVIDER_URL || true)
if [ -n "$EXISTING" ]; then
  echo "GitHub OIDC Providerは既に存在します。"
  exit 0
fi

# OIDCプロバイダー作成
aws iam create-open-id-connect-provider \
  --url "https://$PROVIDER_URL" \
  --client-id-list "$AUDIENCE" \
  --thumbprint-list "$THUMBPRINT"

echo "GitHub OIDC Providerを作成しました。" 