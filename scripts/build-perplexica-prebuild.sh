#!/bin/bash
set -e

echo "Logging in to Amazon ECR..."
aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com

echo "Checking AWS CLI version..."
aws --version

echo "Attempting ECR Public authentication"
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws || echo "ECR Public login failed - continuing with Docker Hub direct access"

echo "Current directory contents:"
ls -la

echo "Checking for config directory in source artifact..."
ls -la config/ || echo "Config directory not found in source artifact"

echo "Backing up config files from source artifact..."
mkdir -p /tmp/backup-config
if [ -d "config" ]; then 
    cp -r config/* /tmp/backup-config/
    echo "Config files backed up"
else 
    echo "No config directory to backup"
fi

echo "Contents of backup directory:"
ls -la /tmp/backup-config/ || echo "Backup directory is empty"

echo "Cloning Perplexica repository..."
rm -rf perplexica-repo
git clone https://github.com/ItzCrazyKns/Perplexica.git perplexica-repo

echo "Perplexica repository contents:"
ls -la perplexica-repo/

echo "Copying Perplexica files to build directory..."
cp -r perplexica-repo/* .
cp -r perplexica-repo/.* . 2>/dev/null || true

echo "Build directory contents after copying Perplexica files:"
ls -la

echo "Restoring config files from backup..."
ls -la /tmp/backup-config/ || echo "No backup config files found"

echo "Copying config files from backup..."
echo "Checking backup directory contents:"
ls -la /tmp/backup-config/ || echo "Backup directory not found"

if [ -f "/tmp/backup-config/perplexica-config.toml" ]; then 
    echo "Found perplexica-config.toml, copying to config.toml"
    cp /tmp/backup-config/perplexica-config.toml ./config.toml
else 
    echo "ERROR: perplexica-config.toml not found in backup"
    echo "Available files in backup:"
    ls -la /tmp/backup-config/ || echo "No backup directory"
    exit 1
fi

if [ -f "/tmp/backup-config/perplexica.dockerfile" ]; then 
    echo "Found perplexica.dockerfile, copying to app.dockerfile"
    cp /tmp/backup-config/perplexica.dockerfile ./app.dockerfile
else 
    echo "ERROR: perplexica.dockerfile not found in backup"
    echo "Available files in backup:"
    ls -la /tmp/backup-config/ || echo "No backup directory"
    exit 1
fi

if [ -f "/tmp/backup-config/perplexity-entrypoint.sh" ]; then 
    echo "Found perplexity-entrypoint.sh, copying to entrypoint.sh"
    cp /tmp/backup-config/perplexity-entrypoint.sh ./entrypoint.sh
else 
    echo "ERROR: perplexity-entrypoint.sh not found in backup"
    echo "Available files in backup:"
    ls -la /tmp/backup-config/ || echo "No backup directory"
    exit 1
fi

echo "Files after copying config:"
ls -la

echo "Getting ALB DNS names from CloudFormation..."
OUTPUTS=$(aws cloudformation describe-stacks --stack-name PerplexicaStack --query "Stacks[0].Outputs" --output json)
SEARXNG_DNS=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="SearxngLoadBalancerDNS") | .OutputValue')
LITELLM_DNS=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="LitellmLoadBalancerDNS") | .OutputValue')

echo "SearXNG ALB DNS: $SEARXNG_DNS"
echo "LiteLLM ALB DNS: $LITELLM_DNS"

if [ -z "$SEARXNG_DNS" ]; then 
    echo "Error: Could not get SearXNG ALB DNS"
    exit 1
fi

if [ -z "$LITELLM_DNS" ]; then 
    echo "Error: Could not get LiteLLM ALB DNS"
    exit 1
fi

echo "Updating config with ALB DNS names..."
sed -i "s|SEARXNG_ALB_DNS_PLACEHOLDER|$SEARXNG_DNS|g" ./config.toml
sed -i "s|LITELLM_ALB_DNS_PLACEHOLDER|$LITELLM_DNS|g" ./config.toml

echo "Updated config.toml contents:"
cat ./config.toml
