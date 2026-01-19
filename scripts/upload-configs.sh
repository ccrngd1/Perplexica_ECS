#!/bin/bash

# Script to upload configuration files to S3 for CodePipeline

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

# Create temporary directories
mkdir -p temp/perplexica-config
mkdir -p temp/searxng-config
mkdir -p temp/litellm-config

# Copy Perplexica config files
mkdir -p temp/perplexica-config/config
cp config/perplexica-config.toml temp/perplexica-config/config/
cp config/perplexica.dockerfile temp/perplexica-config/config/
cp config/perplexity-entrypoint.sh temp/perplexica-config/config/

# Copy SearXNG config files
mkdir -p temp/searxng-config/config
cp config/searxng-settings.yml temp/searxng-config/config/settings.yml
cp config/searxng-limiter.toml temp/searxng-config/config/limiter.toml
cp config/searxng-uwsgi.ini temp/searxng-config/config/

# Copy LiteLLM config files
mkdir -p temp/litellm-config/config
cp config/litellm-config.yaml temp/litellm-config/config/
cp config/litellm.dockerfile temp/litellm-config/litellm.dockerfile

# Create zip files
cd temp/perplexica-config
zip -r ../config.zip .
cd ../..

cd temp/searxng-config
zip -r ../searxng-config.zip .
cd ../..

cd temp/litellm-config
zip -r ../litellm-config.zip .
cd ../..

# Upload to S3
echo "Uploading Perplexica config..."
aws s3 cp temp/config.zip s3://$BUCKET_NAME/config.zip

echo "Uploading SearXNG config..."
aws s3 cp temp/searxng-config.zip s3://$BUCKET_NAME/searxng-config.zip

echo "Uploading LiteLLM config..."
aws s3 cp temp/litellm-config.zip s3://$BUCKET_NAME/litellm-config.zip

# Clean up
rm -rf temp/

echo "All configuration files uploaded successfully!"
echo "- Perplexica config uploaded"
echo "- SearXNG config uploaded" 
echo "- LiteLLM config uploaded"
echo ""
echo "You can now trigger the pipelines to build and deploy all applications."