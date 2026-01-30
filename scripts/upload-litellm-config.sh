#!/bin/bash

# Script to upload LiteLLM configuration files to S3 for CodePipeline

set -e

# Get the S3 bucket name from CDK output
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name PerplexicaStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ArtifactsBucketName`].OutputValue' \
  --output text)

if [ -z "$BUCKET_NAME" ]; then
  echo "Error: Could not find S3 bucket name. Make sure the CDK stack is deployed."
  exit 1
fi

echo "Using S3 bucket: $BUCKET_NAME"

# Create temporary directory
mkdir -p temp/litellm-config/config
mkdir -p temp/litellm-config/scripts

# Copy LiteLLM config files
cp config/litellm-config.yaml temp/litellm-config/config/
cp config/litellm.dockerfile temp/litellm-config/litellm.dockerfile
cp scripts/build-litellm-prebuild.sh temp/litellm-config/scripts/
cp scripts/build-litellm-build.sh temp/litellm-config/scripts/
cp scripts/build-litellm-postbuild.sh temp/litellm-config/scripts/

# Create zip file
cd temp/litellm-config
zip -r ../litellm-config.zip .
cd ../..

# Upload to S3
echo "Uploading LiteLLM config..."
aws s3 cp temp/litellm-config.zip s3://$BUCKET_NAME/litellm-config.zip

# Clean up
rm -rf temp/

echo "LiteLLM configuration uploaded successfully!"
