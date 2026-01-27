#!/bin/bash
set -e

echo "Post-build started on $(date)"

echo "Pushing Docker images to ECR..."
docker push $IMAGE_URI:latest
docker push $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION

echo "Creating ECS image definitions file..."
printf '[{"name":"perplexica","imageUri":"%s"}]' $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION > imagedefinitions.json

echo "Generated imagedefinitions.json:"
cat imagedefinitions.json

echo "Build and push completed successfully on $(date)"
