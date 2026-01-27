#!/bin/bash
set -e

echo "Build completed on $(date)"

echo "Pushing the Docker images..."
docker push $IMAGE_URI:latest
docker push $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION

echo "Writing image definitions file..."
printf '[{"name":"litellm","imageUri":"%s"}]' $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION > imagedefinitions.json
