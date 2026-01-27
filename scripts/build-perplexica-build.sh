#!/bin/bash
set -e

echo "Build started on $(date)"

echo "Validating required files..."
if [ ! -f "app.dockerfile" ]; then 
    echo "Error: app.dockerfile not found"
    exit 1
fi

if [ ! -f "config.toml" ]; then 
    echo "Error: config.toml not found"
    exit 1
fi

echo "Building the Docker image..."
docker build -f app.dockerfile -t $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION .

echo "Tagging Docker images..."
docker tag $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION $IMAGE_URI:latest
docker tag $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION

echo "Docker build completed successfully"
