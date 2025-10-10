# Perplexica Build Process

## Overview

The Perplexica build process automatically clones the Perplexica repository from GitHub and uses the existing config file deployment process via S3 and CodePipeline.

## Build Process Flow

### 1. Git Clone
The build process automatically clones the latest Perplexica repository from:
```
https://github.com/ItzCrazyKns/Perplexica.git
```

### 2. Configuration File Handling

The build process uses the existing S3-based config deployment:

1. **Config files are provided via the CodePipeline source stage**
   - The pipeline expects a `config.zip` file in the artifacts S3 bucket
   - This zip should contain the `config/` directory with all necessary files:
     - `config/perplexica-config.toml`
     - `config/perplexica.dockerfile`

2. **Build process copies config files**
   - Copies `config/perplexica-config.toml` to `./config.toml`
   - Copies `config/perplexica.dockerfile` to `./app.dockerfile`

### 3. Dynamic Configuration Updates

The build process automatically updates the configuration:
- Replaces `SEARXNG_ALB_DNS_PLACEHOLDER` with the actual SearXNG ALB DNS name
- Replaces `LITELLM_ALB_DNS_PLACEHOLDER` with the actual LiteLLM ALB DNS name
- Retrieves both DNS names from CloudFormation stack outputs
- Validates that all required files and URLs are present before building

## Usage - Deploying Config Files

### Using the Existing Process

The existing infrastructure expects config files to be uploaded as `config.zip` to the artifacts bucket. The pipeline will automatically trigger when this file is updated.

### Using the Existing Upload Script

The easiest way to deploy config files is to use the existing upload script:

1. **Edit your config files in the `config/` directory:**
   - `config/perplexica-config.toml` - Main Perplexica configuration
   - `config/perplexica.dockerfile` - Custom Dockerfile (optional)

2. **Run the upload script:**
   ```bash
   ./scripts/upload-configs.sh
   ```

   This script will:
   - Get the artifacts bucket name from CloudFormation
   - Package all config files for Perplexica, SearXNG, and LiteLLM
   - Upload them to S3 to trigger the respective pipelines

3. **The CodePipelines will automatically trigger and deploy the new configs**

### Manual Deployment (Alternative)

If you need more control, you can manually upload just the Perplexica config:

```bash
# Get the artifacts bucket name
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name PerplexicaStack \
  --query "Stacks[0].Outputs[?OutputKey=='ArtifactsBucketName'].OutputValue" \
  --output text)

# Create and upload config package
mkdir -p temp/config
cp config/perplexica-config.toml temp/config/
cp config/perplexica.dockerfile temp/config/
cd temp && zip -r config.zip config/ && cd ..
aws s3 cp temp/config.zip s3://$BUCKET/config.zip
rm -rf temp/
```

## Configuration File Format

The configuration file should follow the Perplexica TOML format. Key sections include:

```toml
[GENERAL]
SIMILARITY_MEASURE = "cosine"
KEEP_ALIVE = "5m"

[MODELS.CUSTOM_OPENAI]
API_KEY = "none"
API_URL = "http://LITELLM_ALB_DNS_PLACEHOLDER"  # Auto-replaced during build
MODEL_NAME = "gpt-4o"

[API_ENDPOINTS]
SEARXNG = "http://SEARXNG_ALB_DNS_PLACEHOLDER/"  # Auto-replaced during build
```

## Key Benefits

- **Always uses latest Perplexica code**: Clones fresh from GitHub on each build
- **Integrates with existing config process**: Uses the established S3/CodePipeline workflow
- **Automatic configuration updates**: Replaces placeholders with actual ALB DNS names
- **No manual repository management**: No need to maintain a fork or copy of Perplexica

## Troubleshooting

### Build Failures
- Ensure the Perplexica repository is accessible from CodeBuild
- Verify ECR permissions for pushing images
- Check that config files exist in the source artifact
- Review CodeBuild logs for detailed error messages

### Configuration Issues
- Validate TOML syntax in your config file
- Ensure all required sections are present
- Check that placeholder replacement worked in build logs
- Verify the config.zip contains the correct directory structure