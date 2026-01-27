#!/bin/bash
set -e

echo "Build started on $(date)"

echo "Validating required files..."
if [ ! -f "litellm.dockerfile" ]; then 
    echo "Error: litellm.dockerfile not found"
    exit 1
fi

if [ ! -f "config/litellm-config.yaml" ]; then 
    echo "Error: config/litellm-config.yaml not found"
    exit 1
fi

echo "Contents of litellm.dockerfile:"
cat litellm.dockerfile

echo "Building the Docker image..."
docker build -f litellm.dockerfile -t $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION .

docker tag $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION $IMAGE_URI:latest
docker tag $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION
