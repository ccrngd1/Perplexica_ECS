# Perplexica AWS CDK Deployment

This CDK project deploys Perplexica and SearXNG to AWS using ECS Fargate, with automated CI/CD pipelines.

## Architecture

- **VPC**: Custom VPC with public and private subnets across 2 AZs
- **ECS Cluster**: Fargate cluster for running containers
- **ECR Repositories**: One for Perplexica app, one for custom SearXNG
- **Application Load Balancers**: Separate ALBs for each service with their own DNS endpoints
- **CodePipeline**: Automated build and deployment pipelines
- **CodeBuild**: Builds Docker images and pushes to ECR

## Services

### 1. Perplexica Application
- Clones from https://github.com/ItzCrazyKns/Perplexica.git
- Replaces config files with custom configuration
- Builds and deploys to ECS Fargate
- Accessible via ALB on port 80

### 2. SearXNG Search Engine
- Based on `docker.io/searxng/searxng:latest`
- Custom configuration for AWS deployment
- Accessible via ALB at `/searxng` path
- Provides search API for Perplexica

## Prerequisites

1. AWS CLI configured with appropriate permissions
2. Node.js and npm/yarn installed
3. AWS CDK CLI installed: `npm install -g aws-cdk`

## Deployment Steps

### 1. Install Dependencies
```bash
cd cdk-perplexica
npm install
```

### 2. Bootstrap CDK (if not done before)
```bash
cdk bootstrap
```

### 3. Deploy the Infrastructure
```bash
cdk deploy
```

### 4. Upload Configuration Files
```bash
chmod +x scripts/upload-configs.sh
./scripts/upload-configs.sh
```

### 5. Trigger the Pipelines
```bash
chmod +x scripts/trigger-pipelines.sh
./scripts/trigger-pipelines.sh
```

## Configuration

### Perplexica Configuration
Edit `config/perplexica-config.toml` to customize:
- AI model settings (OpenAI, Anthropic, etc.)
- Search engine endpoints
- General application settings

### SearXNG Configuration
Edit the following files in `config/`:
- `searxng-settings.yml`: Main SearXNG configuration
- `searxng-limiter.toml`: Rate limiting settings
- `searxng-uwsgi.ini`: UWSGI server configuration

## Monitoring

- **CloudWatch Logs**: Application logs are automatically sent to CloudWatch
- **ECS Console**: Monitor service health and scaling
- **CodePipeline Console**: Track build and deployment status

## Accessing the Applications

After deployment, get the load balancer DNS names:

**Perplexica:**
```bash
aws cloudformation describe-stacks \
  --stack-name PerplexicaStack \
  --query 'Stacks[0].Outputs[?OutputKey==`PerplexicaLoadBalancerDNS`].OutputValue' \
  --output text
```

**SearXNG:**
```bash
aws cloudformation describe-stacks \
  --stack-name PerplexicaStack \
  --query 'Stacks[0].Outputs[?OutputKey==`SearxngLoadBalancerDNS`].OutputValue' \
  --output text
```

- **Perplexica**: `http://<perplexica-alb-dns>/`
- **SearXNG**: `http://<searxng-alb-dns>/`

## Updating Configurations

1. Modify files in the `config/` directory
2. Run `./scripts/upload-configs.sh` to upload new configs
3. Run `./scripts/trigger-pipelines.sh` to rebuild and redeploy

## Cleanup

To destroy all resources:
```bash
cdk destroy
```

## Troubleshooting

### Pipeline Failures
- Check CodeBuild logs in the AWS Console
- Verify ECR permissions
- Ensure configuration files are valid

### Service Health Issues
- Check ECS service logs in CloudWatch
- Verify target group health in ALB console
- Check security group rules

### Configuration Issues
- Validate TOML and YAML syntax
- Ensure all required environment variables are set
- Check container port mappings

## Cost Optimization

- ECS services are set to 1 desired count by default
- Consider using Spot instances for non-production workloads
- Monitor CloudWatch costs and set up billing alerts

## Security Considerations

- Services run in private subnets
- ALB provides public access with security groups
- ECR repositories have lifecycle policies to manage image retention
- IAM roles follow least privilege principle