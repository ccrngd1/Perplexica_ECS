import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class PerplexicaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'PerplexicaVpc', {
      maxAzs: 2,
      natGateways: 1,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'PerplexicaCluster', {
      vpc,
      containerInsights: true,
    });

    // ECR Repositories - Create or use existing with custom resource
    const { perplexicaRepo, searxngRepo } = this.createEcrRepositoriesWithFallback();

    // S3 Bucket for artifacts
    const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Application Load Balancers - Separate ALBs for each service
    const perplexicaALB = new elbv2.ApplicationLoadBalancer(this, 'PerplexicaALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'perplexica-alb',
    });

    const searxngALB = new elbv2.ApplicationLoadBalancer(this, 'SearxngALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'searxng-alb',
    });

    // Target Groups
    const perplexicaTargetGroup = new elbv2.ApplicationTargetGroup(this, 'PerplexicaTargetGroup', {
      port: 3000,
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        healthyHttpCodes: '200,302',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
        port: '3000',
        protocol: elbv2.Protocol.HTTP,
      },
    });

    const searxngTargetGroup = new elbv2.ApplicationTargetGroup(this, 'SearxngTargetGroup', {
      port: 8080,
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        healthyHttpCodes: '200,302',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
        port: '8080',
        protocol: elbv2.Protocol.HTTP,
      },
    });

    // ALB Listeners - Each ALB gets its own listener
    perplexicaALB.addListener('PerplexicaListener', {
      port: 80,
      defaultTargetGroups: [perplexicaTargetGroup],
    });

    searxngALB.addListener('SearxngListener', {
      port: 80,
      defaultTargetGroups: [searxngTargetGroup],
    });

    // ECS Task Definitions
    const perplexicaTaskDef = new ecs.FargateTaskDefinition(this, 'PerplexicaTaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024,
    });

    const searxngTaskDef = new ecs.FargateTaskDefinition(this, 'SearxngTaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
    });

    // Container Definitions (will be updated by pipeline)
    const perplexicaContainer = perplexicaTaskDef.addContainer('perplexica', {
      image: ecs.ContainerImage.fromRegistry('nginx:latest'), // Placeholder
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'perplexica',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        SEARXNG_API_URL: `http://${searxngALB.loadBalancerDnsName}`,
        DATA_DIR: '/home/perplexica',
      },
    });

    perplexicaContainer.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    const searxngContainer = searxngTaskDef.addContainer('searxng', {
      image: ecs.ContainerImage.fromRegistry('nginx:latest'), // Placeholder
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'searxng',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    searxngContainer.addPortMappings({
      containerPort: 8080,
      protocol: ecs.Protocol.TCP,
    });

    // ECS Services
    const perplexicaService = new ecs.FargateService(this, 'PerplexicaService', {
      cluster,
      taskDefinition: perplexicaTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
    });

    const searxngService = new ecs.FargateService(this, 'SearxngService', {
      cluster,
      taskDefinition: searxngTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
    });

    // Attach services to target groups
    perplexicaService.attachToApplicationTargetGroup(perplexicaTargetGroup);
    searxngService.attachToApplicationTargetGroup(searxngTargetGroup);

    // CodeBuild Projects
    const perplexicaBuildProject = this.createPerplexicaBuildProject(
      perplexicaRepo,
      artifactsBucket
    );

    const searxngBuildProject = this.createSearxngBuildProject(
      searxngRepo,
      artifactsBucket
    );

    // CodePipelines
    this.createPerplexicaPipeline(
      perplexicaBuildProject,
      perplexicaService,
      artifactsBucket
    );

    this.createSearxngPipeline(
      searxngBuildProject,
      searxngService,
      artifactsBucket
    );

    // Outputs
    new cdk.CfnOutput(this, 'PerplexicaLoadBalancerDNS', {
      value: perplexicaALB.loadBalancerDnsName,
      description: 'Perplexica Load Balancer DNS Name',
    });

    new cdk.CfnOutput(this, 'SearxngLoadBalancerDNS', {
      value: searxngALB.loadBalancerDnsName,
      description: 'SearXNG Load Balancer DNS Name',
    });

    new cdk.CfnOutput(this, 'PerplexicaRepoUri', {
      value: perplexicaRepo.repositoryUri,
      description: 'Perplexica ECR Repository URI',
    });

    new cdk.CfnOutput(this, 'SearxngRepoUri', {
      value: searxngRepo.repositoryUri,
      description: 'SearXNG ECR Repository URI',
    });
  }

  private createEcrRepositoriesWithFallback(): { perplexicaRepo: ecr.IRepository; searxngRepo: ecr.IRepository } {
    // Create a custom resource that handles ECR repository creation with fallback
    const ecrManagerFunction = new lambda.Function(this, 'EcrManagerFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(60),
      code: lambda.Code.fromInline(`
import boto3
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    ecr = boto3.client('ecr')
    
    request_type = event['RequestType']
    repo_name = event['ResourceProperties']['RepositoryName']
    
    try:
        if request_type == 'Create':
            # Try to create the repository
            try:
                response = ecr.create_repository(
                    repositoryName=repo_name,
                    imageScanningConfiguration={'scanOnPush': False}
                )
                logger.info(f"Created repository: {repo_name}")
                repo_uri = response['repository']['repositoryUri']
            except ecr.exceptions.RepositoryAlreadyExistsException:
                # Repository exists, get its details
                logger.info(f"Repository {repo_name} already exists, using existing one")
                response = ecr.describe_repositories(repositoryNames=[repo_name])
                repo_uri = response['repositories'][0]['repositoryUri']
            
            # Set lifecycle policy
            try:
                ecr.put_lifecycle_policy(
                    repositoryName=repo_name,
                    lifecyclePolicyText=json.dumps({
                        "rules": [{
                            "rulePriority": 1,
                            "selection": {
                                "tagStatus": "any",
                                "countType": "imageCountMoreThan",
                                "countNumber": 10
                            },
                            "action": {
                                "type": "expire"
                            }
                        }]
                    })
                )
            except Exception as e:
                logger.warning(f"Could not set lifecycle policy: {str(e)}")
            
            return {
                'PhysicalResourceId': repo_name,
                'Data': {
                    'RepositoryUri': repo_uri,
                    'RepositoryName': repo_name
                }
            }
            
        elif request_type == 'Delete':
            # Don't delete the repository on stack deletion (retain policy)
            logger.info(f"Retaining repository: {repo_name}")
            return {'PhysicalResourceId': repo_name}
            
        else:  # Update
            # Get current repository details
            response = ecr.describe_repositories(repositoryNames=[repo_name])
            repo_uri = response['repositories'][0]['repositoryUri']
            return {
                'PhysicalResourceId': repo_name,
                'Data': {
                    'RepositoryUri': repo_uri,
                    'RepositoryName': repo_name
                }
            }
            
    except Exception as e:
        logger.error(f"Error managing repository {repo_name}: {str(e)}")
        raise e
      `),
    });

    // Grant ECR permissions to the Lambda function
    ecrManagerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:CreateRepository',
        'ecr:DescribeRepositories',
        'ecr:PutLifecyclePolicy',
        'ecr:GetLifecyclePolicy',
      ],
      resources: ['*'],
    }));

    // Custom resources for each repository
    const perplexicaRepoResource = new cr.AwsCustomResource(this, 'PerplexicaRepoResource', {
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: ecrManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Create',
            ResourceProperties: {
              RepositoryName: 'perplexica-app'
            }
          })
        },
        physicalResourceId: cr.PhysicalResourceId.of('perplexica-app'),
      },
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: ecrManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Update',
            ResourceProperties: {
              RepositoryName: 'perplexica-app'
            }
          })
        },
        physicalResourceId: cr.PhysicalResourceId.of('perplexica-app'),
      },
      onDelete: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: ecrManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Delete',
            ResourceProperties: {
              RepositoryName: 'perplexica-app'
            }
          })
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    const searxngRepoResource = new cr.AwsCustomResource(this, 'SearxngRepoResource', {
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: ecrManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Create',
            ResourceProperties: {
              RepositoryName: 'searxng-custom'
            }
          })
        },
        physicalResourceId: cr.PhysicalResourceId.of('searxng-custom'),
      },
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: ecrManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Update',
            ResourceProperties: {
              RepositoryName: 'searxng-custom'
            }
          })
        },
        physicalResourceId: cr.PhysicalResourceId.of('searxng-custom'),
      },
      onDelete: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: ecrManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Delete',
            ResourceProperties: {
              RepositoryName: 'searxng-custom'
            }
          })
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    // Create repository interfaces from the custom resources
    const perplexicaRepo = ecr.Repository.fromRepositoryAttributes(this, 'PerplexicaRepo', {
      repositoryName: 'perplexica-app',
      repositoryArn: `arn:aws:ecr:${this.region}:${this.account}:repository/perplexica-app`,
    });

    const searxngRepo = ecr.Repository.fromRepositoryAttributes(this, 'SearxngRepo', {
      repositoryName: 'searxng-custom',
      repositoryArn: `arn:aws:ecr:${this.region}:${this.account}:repository/searxng-custom`,
    });

    // Ensure the custom resources are created before the repositories are used
    perplexicaRepo.node.addDependency(perplexicaRepoResource);
    searxngRepo.node.addDependency(searxngRepoResource);

    return { perplexicaRepo, searxngRepo };
  }

  private createPerplexicaBuildProject(
    ecrRepo: ecr.IRepository,
    artifactsBucket: s3.Bucket
  ): codebuild.Project {
    const buildRole = new iam.Role(this, 'PerplexicaBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser'),
      ],
    });

    artifactsBucket.grantReadWrite(buildRole);

    return new codebuild.Project(this, 'PerplexicaBuildProject', {
      role: buildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
      },
      environmentVariables: {
        AWS_DEFAULT_REGION: { value: this.region },
        AWS_ACCOUNT_ID: { value: this.account },
        IMAGE_REPO_NAME: { value: ecrRepo.repositoryName },
        IMAGE_URI: { value: ecrRepo.repositoryUri },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
              'echo Cloning Perplexica repository...',
              'git clone https://github.com/ItzCrazyKns/Perplexica.git .',
              'echo Replacing config files...',
              'cp ../config/perplexica-config.toml ./config.toml',
              'cp ../config/perplexica.dockerfile ./app.dockerfile',
              'echo Getting SearXNG ALB DNS...',
              'SEARXNG_DNS=$(aws cloudformation describe-stacks --stack-name PerplexicaStack --query "Stacks[0].Outputs[?OutputKey==\`SearxngLoadBalancerDNS\`].OutputValue" --output text)',
              'echo Updating config with SearXNG DNS: $SEARXNG_DNS',
              'sed -i "s|SEARXNG_ALB_DNS_PLACEHOLDER|$SEARXNG_DNS|g" ./config.toml',
            ],
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Building the Docker image...',
              'docker build -f app.dockerfile -t $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION .',
              'docker tag $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION $IMAGE_URI:latest',
              'docker tag $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
            ],
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'echo Pushing the Docker images...',
              'docker push $IMAGE_URI:latest',
              'docker push $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
              'echo Writing image definitions file...',
              'printf \'[{"name":"perplexica","imageUri":"%s"}]\' $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION > imagedefinitions.json',
            ],
          },
        },
        artifacts: {
          files: ['imagedefinitions.json'],
        },
      }),
    });
  }

  private createSearxngBuildProject(
    ecrRepo: ecr.IRepository,
    artifactsBucket: s3.Bucket
  ): codebuild.Project {
    const buildRole = new iam.Role(this, 'SearxngBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser'),
      ],
    });

    artifactsBucket.grantReadWrite(buildRole);

    return new codebuild.Project(this, 'SearxngBuildProject', {
      role: buildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
      },
      environmentVariables: {
        AWS_DEFAULT_REGION: { value: this.region },
        AWS_ACCOUNT_ID: { value: this.account },
        IMAGE_REPO_NAME: { value: ecrRepo.repositoryName },
        IMAGE_URI: { value: ecrRepo.repositoryUri },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
              'echo Pulling base SearXNG image...',
              'docker pull docker.io/searxng/searxng:latest',
            ],
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Creating custom Dockerfile...',
              'cat > Dockerfile << EOF',
              'FROM docker.io/searxng/searxng:latest',
              'COPY config/searxng-settings.yml /etc/searxng/settings.yml',
              'COPY config/searxng-limiter.toml /etc/searxng/limiter.toml',
              'COPY config/searxng-uwsgi.ini /etc/searxng/uwsgi.ini',
              'EOF',
              'echo Building the Docker image...',
              'docker build -t $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION .',
              'docker tag $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION $IMAGE_URI:latest',
              'docker tag $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
            ],
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'echo Pushing the Docker images...',
              'docker push $IMAGE_URI:latest',
              'docker push $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
              'echo Writing image definitions file...',
              'printf \'[{"name":"searxng","imageUri":"%s"}]\' $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION > imagedefinitions.json',
            ],
          },
        },
        artifacts: {
          files: ['imagedefinitions.json'],
        },
      }),
    });
  }

  private createPerplexicaPipeline(
    buildProject: codebuild.Project,
    ecsService: ecs.FargateService,
    artifactsBucket: s3.Bucket
  ): codepipeline.Pipeline {
    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    const pipelineRole = new iam.Role(this, 'PerplexicaPipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    artifactsBucket.grantReadWrite(pipelineRole);

    pipelineRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecs:UpdateService',
        'ecs:DescribeServices',
        'ecs:DescribeTaskDefinition',
        'ecs:RegisterTaskDefinition',
        'iam:PassRole',
      ],
      resources: ['*'],
    }));

    return new codepipeline.Pipeline(this, 'PerplexicaPipeline', {
      role: pipelineRole,
      artifactBucket: artifactsBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipelineActions.S3SourceAction({
              actionName: 'Source',
              bucket: artifactsBucket,
              bucketKey: 'config.zip',
              output: sourceOutput,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipelineActions.CodeBuildAction({
              actionName: 'Build',
              project: buildProject,
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
        {
          stageName: 'Deploy',
          actions: [
            new codepipelineActions.EcsDeployAction({
              actionName: 'Deploy',
              service: ecsService,
              input: buildOutput,
            }),
          ],
        },
      ],
    });
  }

  private createSearxngPipeline(
    buildProject: codebuild.Project,
    ecsService: ecs.FargateService,
    artifactsBucket: s3.Bucket
  ): codepipeline.Pipeline {
    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    const pipelineRole = new iam.Role(this, 'SearxngPipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    artifactsBucket.grantReadWrite(pipelineRole);

    pipelineRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecs:UpdateService',
        'ecs:DescribeServices',
        'ecs:DescribeTaskDefinition',
        'ecs:RegisterTaskDefinition',
        'iam:PassRole',
      ],
      resources: ['*'],
    }));

    return new codepipeline.Pipeline(this, 'SearxngPipeline', {
      role: pipelineRole,
      artifactBucket: artifactsBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipelineActions.S3SourceAction({
              actionName: 'Source',
              bucket: artifactsBucket,
              bucketKey: 'searxng-config.zip',
              output: sourceOutput,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipelineActions.CodeBuildAction({
              actionName: 'Build',
              project: buildProject,
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
        {
          stageName: 'Deploy',
          actions: [
            new codepipelineActions.EcsDeployAction({
              actionName: 'Deploy',
              service: ecsService,
              input: buildOutput,
            }),
          ],
        },
      ],
    });
  }
}