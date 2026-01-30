#!/bin/bash

# Script to upload SearXNG configuration files to S3 for CodePipeline

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
mkdir -p temp/searxng-config/config
mkdir -p temp/searxng-config/scripts

# Copy SearXNG config files
cp config/searxng-settings.yml temp/searxng-config/config/settings.yml
cp config/searxng-limiter.toml temp/searxng-config/config/limiter.toml
cp config/searxng-uwsgi.ini temp/searxng-config/config/
cp scripts/build-searxng-prebuild.sh temp/searxng-config/scripts/
cp scripts/build-searxng-build.sh temp/searxng-config/scripts/
cp scripts/build-searxng-postbuild.sh temp/searxng-config/scripts/

# Create zip file
cd temp/searxng-config
zip -r ../searxng-config.zip .
cd ../..

# Upload to S3
echo "Uploading SearXNG config..."
aws s3 cp temp/searxng-config.zip s3://$BUCKET_NAME/searxng-config.zip

# Clean up
rm -rf temp/

echo "SearXNG configuration uploaded successfully!"
