#!/bin/bash
set -e

echo "Logging in to Amazon ECR..."
aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com

echo "Checking AWS CLI version..."
aws --version

echo "Attempting ECR Public authentication"
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws || echo "ECR Public login failed - continuing with Docker Hub direct access"

echo "Pulling base SearXNG image..."
docker pull searxng/searxng:latest || (echo "Failed to pull from Docker Hub, trying without authentication..." && docker pull searxng/searxng:latest)
