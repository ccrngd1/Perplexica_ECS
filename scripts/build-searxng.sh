#!/bin/bash

# Build and push SearXNG container to ECR
# This script follows the same steps as the CodeBuild project in perplexica-stack.ts

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== SearXNG Container Build and Push Script ===${NC}"

# Get AWS account and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=${AWS_DEFAULT_REGION:-$(aws configure get region)}
IMAGE_REPO_NAME="searxng-custom"
IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${IMAGE_REPO_NAME}"

echo -e "${YELLOW}AWS Account ID:${NC} $AWS_ACCOUNT_ID"
echo -e "${YELLOW}AWS Region:${NC} $AWS_REGION"
echo -e "${YELLOW}ECR Repository:${NC} $IMAGE_URI"

# Pre-build phase
echo -e "\n${GREEN}=== Pre-Build Phase ===${NC}"

echo "Logging in to Amazon ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

echo "Checking AWS CLI version..."
aws --version

echo "Attempting ECR Public authentication..."
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws || echo "ECR Public login failed - continuing with Docker Hub direct access"

echo "Pulling base SearXNG image..."
docker pull searxng/searxng:latest || (echo "Failed to pull from Docker Hub, trying without authentication..." && docker pull searxng/searxng:latest)

# Build phase
echo -e "\n${GREEN}=== Build Phase ===${NC}"

echo "Build started on $(date)"

# Create temporary build directory
BUILD_DIR=$(mktemp -d)
echo "Using temporary build directory: $BUILD_DIR"

cd "$BUILD_DIR"

echo "Creating custom Dockerfile..."
cat > Dockerfile << 'EOF'
FROM searxng/searxng:latest
COPY config/settings.yml /etc/searxng/settings.yml
COPY config/limiter.toml /etc/searxng/limiter.toml
COPY config/searxng-uwsgi.ini /usr/local/searxng/searx/uwsgi.ini
ENTRYPOINT ["/usr/local/searxng/entrypoint.sh"]
EOF

echo "Generated Dockerfile:"
cat Dockerfile

# Copy config files
echo "Copying config files..."
mkdir -p config
cp "$OLDPWD/config/searxng-settings.yml" config/settings.yml
cp "$OLDPWD/config/searxng-limiter.toml" config/limiter.toml
cp "$OLDPWD/config/searxng-uwsgi.ini" config/searxng-uwsgi.ini

echo "Config files copied:"
ls -la config/

# Generate image tag
IMAGE_TAG=$(date +%Y%m%d-%H%M%S)
echo "Using image tag: $IMAGE_TAG"

echo "Building the Docker image..."
docker build -t ${IMAGE_REPO_NAME}:${IMAGE_TAG} .

echo "Tagging Docker images..."
docker tag ${IMAGE_REPO_NAME}:${IMAGE_TAG} ${IMAGE_URI}:latest
docker tag ${IMAGE_REPO_NAME}:${IMAGE_TAG} ${IMAGE_URI}:${IMAGE_TAG}

# Post-build phase
echo -e "\n${GREEN}=== Post-Build Phase ===${NC}"

echo "Build completed on $(date)"

echo "Pushing the Docker images..."
docker push ${IMAGE_URI}:latest
docker push ${IMAGE_URI}:${IMAGE_TAG}

echo "Creating ECS image definitions file..."
printf '[{"name":"searxng","imageUri":"%s"}]' ${IMAGE_URI}:${IMAGE_TAG} > imagedefinitions.json

echo "Generated imagedefinitions.json:"
cat imagedefinitions.json

# Cleanup
cd "$OLDPWD"
rm -rf "$BUILD_DIR"

echo -e "\n${GREEN}=== Build and push completed successfully on $(date) ===${NC}"
echo -e "${GREEN}Image URI:${NC} ${IMAGE_URI}:latest"
echo -e "${GREEN}Image URI:${NC} ${IMAGE_URI}:${IMAGE_TAG}"
