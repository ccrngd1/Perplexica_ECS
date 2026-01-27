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
mkdir -p temp/perplexica-config/scripts
cp config/perplexica-config.toml temp/perplexica-config/config/
cp config/perplexica.dockerfile temp/perplexica-config/config/
cp config/perplexity-entrypoint.sh temp/perplexica-config/config/
cp scripts/build-perplexica-prebuild.sh temp/perplexica-config/scripts/
cp scripts/build-perplexica-build.sh temp/perplexica-config/scripts/
cp scripts/build-perplexica-postbuild.sh temp/perplexica-config/scripts/

# Copy SearXNG config files
mkdir -p temp/searxng-config/config
mkdir -p temp/searxng-config/scripts
cp config/searxng-settings.yml temp/searxng-config/config/settings.yml
cp config/searxng-limiter.toml temp/searxng-config/config/limiter.toml
cp config/searxng-uwsgi.ini temp/searxng-config/config/
cp scripts/build-searxng-prebuild.sh temp/searxng-config/scripts/
cp scripts/build-searxng-build.sh temp/searxng-config/scripts/
cp scripts/build-searxng-postbuild.sh temp/searxng-config/scripts/

# Copy LiteLLM config files
mkdir -p temp/litellm-config/config
mkdir -p temp/litellm-config/scripts
cp config/litellm-config.yaml temp/litellm-config/config/
cp config/litellm.dockerfile temp/litellm-config/litellm.dockerfile
cp scripts/build-litellm-prebuild.sh temp/litellm-config/scripts/
cp scripts/build-litellm-build.sh temp/litellm-config/scripts/
cp scripts/build-litellm-postbuild.sh temp/litellm-config/scripts/

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
echo ""

exit

# Trigger the pipelines
echo "Triggering CodePipeline executions..."

# Get pipeline names - tab-separated output
PIPELINES=$(aws codepipeline list-pipelines --query 'pipelines[*].name' --output text)

echo "DEBUG: Raw pipeline output: '$PIPELINES'"

# Convert tabs to newlines and process each pipeline
echo "$PIPELINES" | tr '\t' '\n' | while read -r pipeline; do
  # Skip empty lines
  [ -z "$pipeline" ] && continue
  
  echo "DEBUG: Checking pipeline: '$pipeline'"
  
  if echo "$pipeline" | grep -qi "perplexica"; then
    if echo "$pipeline" | grep -qi "pipeline"; then
      echo "Starting Perplexica pipeline: $pipeline"
      aws codepipeline start-pipeline-execution --name "$pipeline"
    fi
  elif echo "$pipeline" | grep -qi "searxng"; then
    if echo "$pipeline" | grep -qi "pipeline"; then
      echo "Starting SearXNG pipeline: $pipeline"
      aws codepipeline start-pipeline-execution --name "$pipeline"
    fi
  elif echo "$pipeline" | grep -qi "litellm"; then
    if echo "$pipeline" | grep -qi "pipeline"; then
      echo "Starting LiteLLM pipeline: $pipeline"
      aws codepipeline start-pipeline-execution --name "$pipeline"
    fi
  fi
done

echo ""
echo "Pipeline trigger complete!"
