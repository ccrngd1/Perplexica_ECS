#!/bin/bash
set -e

echo "Build completed on $(date)"

echo "Pushing the Docker images..."
docker push $IMAGE_URI:latest
docker push $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION

echo "Creating ECS image definitions file..."
printf '[{"name":"searxng","imageUri":"%s"}]' $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION > imagedefinitions.json

echo "Generated imagedefinitions.json:"
cat imagedefinitions.json

echo "Build and push completed successfully on $(date)"
