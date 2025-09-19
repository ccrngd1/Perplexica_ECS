#!/bin/bash

# Script to upload configuration files to S3 for CodePipeline

set -e

# Get the S3 bucket name from CDK output
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name PerplexicaStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ArtifactsBucket`].OutputValue' \
  --output text)

if [ -z "$BUCKET_NAME" ]; then
  echo "Error: Could not find S3 bucket name. Make sure the CDK stack is deployed."
  exit 1
fi

echo "Using S3 bucket: $BUCKET_NAME"

# Create temporary directories
mkdir -p temp/perplexica-config
mkdir -p temp/searxng-config

# Copy Perplexica config files
cp config/perplexica-config.toml temp/perplexica-config/
cp config/perplexica.dockerfile temp/perplexica-config/

# Copy SearXNG config files
mkdir -p temp/searxng-config/config
cp config/searxng-settings.yml temp/searxng-config/config/
cp config/searxng-limiter.toml temp/searxng-config/config/
cp config/searxng-uwsgi.ini temp/searxng-config/config/

# Create zip files
cd temp/perplexica-config
zip -r ../config.zip .
cd ../..

cd temp/searxng-config
zip -r ../searxng-config.zip .
cd ../..

# Upload to S3
echo "Uploading Perplexica config..."
aws s3 cp temp/config.zip s3://$BUCKET_NAME/config.zip

echo "Uploading SearXNG config..."
aws s3 cp temp/searxng-config.zip s3://$BUCKET_NAME/searxng-config.zip

# Clean up
rm -rf temp/

echo "Configuration files uploaded successfully!"
echo "You can now trigger the pipelines to build and deploy the applications."