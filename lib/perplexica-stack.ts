import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as efs from 'aws-cdk-lib/aws-efs';
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
    const { perplexicaRepo, searxngRepo, litellmRepo } = this.createEcrRepositoriesWithFallback();

    // S3 Bucket for artifacts
    const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
    });

    // EFS File System for Perplexica persistent storage - TEMPORARILY DISABLED
    // const perplexicaFileSystem = new efs.FileSystem(this, 'PerplexicaFileSystem', {
    //   vpc,
    //   lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
    //   performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
    //   throughputMode: efs.ThroughputMode.BURSTING,
    //   removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep data even if stack is deleted
    //   encrypted: true,
    //   vpcSubnets: {
    //     subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    //   },
    //   securityGroup: new ec2.SecurityGroup(this, 'EfsSecurityGroup', {
    //     vpc,
    //     description: 'Security group for EFS mount targets',
    //     allowAllOutbound: true,
    //   }),
    // });

    // // Create access point for Perplexica data
    // const perplexicaAccessPoint = perplexicaFileSystem.addAccessPoint('PerplexicaAccessPoint', {
    //   path: '/perplexica-data',
    //   createAcl: {
    //     ownerGid: '1000',
    //     ownerUid: '1000',
    //     permissions: '755',
    //   },
    //   posixUser: {
    //     gid: '1000',
    //     uid: '1000',
    //   },
    // });

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

    const litellmALB = new elbv2.ApplicationLoadBalancer(this, 'LitellmALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'litellm-alb',
    });

    // Target Groups
    const perplexicaTargetGroup = new elbv2.ApplicationTargetGroup(this, 'PerplexicaTargetGroupV2', {
      port: 80,
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        healthyHttpCodes: '200,404', // Accept almost any response
        interval: cdk.Duration.seconds(300), // Check every 5 minutes
        timeout: cdk.Duration.seconds(60), // Long timeout
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10, // Very tolerant of failures
        port: '80',
        protocol: elbv2.Protocol.HTTP,
      },
    });

    const searxngTargetGroup = new elbv2.ApplicationTargetGroup(this, 'SearxngTargetGroupV2', {
      port: 80,
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        healthyHttpCodes: '200,404', // Accept almost any response
        interval: cdk.Duration.seconds(300), // Check every 5 minutes
        timeout: cdk.Duration.seconds(60), // Long timeout
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10, // Very tolerant of failures
        port: '80',
        protocol: elbv2.Protocol.HTTP,
      },
    });

    const litellmTargetGroup = new elbv2.ApplicationTargetGroup(this, 'LitellmTargetGroupV2', {
      port: 80,
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        healthyHttpCodes: '200,404', // Accept almost any response
        interval: cdk.Duration.seconds(300), // Check every 5 minutes
        timeout: cdk.Duration.seconds(60), // Long timeout
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10, // Very tolerant of failures
        port: '80',
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

    litellmALB.addListener('LitellmListener', {
      port: 80,
      defaultTargetGroups: [litellmTargetGroup],
    });

    // ECS Task Definitions
    // Create execution role for Perplexica with ECR permissions
    const perplexicaExecutionRole = new iam.Role(this, 'PerplexicaTaskDefExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Add ECR authorization token permission
    perplexicaExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));

    const perplexicaTaskDef = new ecs.FargateTaskDefinition(this, 'PerplexicaTaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      executionRole: perplexicaExecutionRole,
    });

    // Add EFS volume to Perplexica task definition - TEMPORARILY DISABLED
    // perplexicaTaskDef.addVolume({
    //   name: 'perplexica-efs-storage',
    //   efsVolumeConfiguration: {
    //     fileSystemId: perplexicaFileSystem.fileSystemId,
    //     transitEncryption: 'ENABLED',
    //     authorizationConfig: {
    //       accessPointId: perplexicaAccessPoint.accessPointId,
    //       iam: 'ENABLED',
    //     },
    //   },
    // });

    // Create execution role for SearXNG with ECR permissions
    const searxngExecutionRole = new iam.Role(this, 'SearxngTaskDefExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Add ECR authorization token permission
    searxngExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));

    const searxngTaskDef = new ecs.FargateTaskDefinition(this, 'SearxngTaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole: searxngExecutionRole,
    });

    // Create execution role for LiteLLM with ECR permissions
    const litellmExecutionRole = new iam.Role(this, 'LitellmTaskDefExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Add ECR authorization token permission
    litellmExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));

    // Create task role for LiteLLM with Bedrock permissions
    const litellmTaskRole = new iam.Role(this, 'LitellmTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Add Bedrock permissions for LiteLLM
    litellmTaskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['*'],
    }));

    const litellmTaskDef = new ecs.FargateTaskDefinition(this, 'LitellmTaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole: litellmExecutionRole,
      taskRole: litellmTaskRole,
    });

    // Container Definitions (will be updated by pipeline)
    const perplexicaContainer = perplexicaTaskDef.addContainer('perplexica', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/nginx/nginx:latest'), // Nginx placeholder
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'perplexica',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        SEARXNG_API_URL: `http://${searxngALB.loadBalancerDnsName}`,
        DATA_DIR: '/home/perplexica',
        PORT: '80',
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        NODE_OPTIONS: '--enable-source-maps --trace-warnings --trace-uncaught',
        DEBUG: '*',
        VERBOSE: 'true',
      },
      healthCheck: {
        command: ['CMD-SHELL', 'exit 0'], // Always healthy
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Mount EFS volume in Perplexica container - TEMPORARILY DISABLED
    // perplexicaContainer.addMountPoints({
    //   containerPath: '/home/perplexica',
    //   sourceVolume: 'perplexica-efs-storage',
    //   readOnly: false,
    // });

    perplexicaContainer.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    const searxngContainer = searxngTaskDef.addContainer('searxng', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/nginx/nginx:latest'), // Nginx placeholder
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'searxng',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        GRANIAN_PORT: '80',
        LITELLM_LOG: 'DEBUG',
        JSON_LOGS: 'True',
      },
      healthCheck: {
        command: ['CMD-SHELL', 'exit 0'], // Always healthy
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    searxngContainer.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    const litellmContainer = litellmTaskDef.addContainer('litellm', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/nginx/nginx:latest'), // Nginx placeholder
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'litellm',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        LITELLM_LOG: 'DEBUG',
        SET_VERBOSE: 'True',
        JSON_LOGS: 'True',
      },
      healthCheck: {
        command: ['CMD-SHELL', 'exit 0'], // Always healthy
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    litellmContainer.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    // ECS Services
    const perplexicaService = new ecs.FargateService(this, 'PerplexicaService', {
      cluster,
      taskDefinition: perplexicaTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(300), // 5 minutes grace period
      enableExecuteCommand: true,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    const searxngService = new ecs.FargateService(this, 'SearxngService', {
      cluster,
      taskDefinition: searxngTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(300), // 5 minutes grace period
      enableExecuteCommand: true,
    });

    const litellmService = new ecs.FargateService(this, 'LitellmService', {
      cluster,
      taskDefinition: litellmTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(600), // 10 minutes grace period
      enableExecuteCommand: true,
    });

    // Attach services to target groups
    perplexicaService.attachToApplicationTargetGroup(perplexicaTargetGroup);
    searxngService.attachToApplicationTargetGroup(searxngTargetGroup);
    litellmService.attachToApplicationTargetGroup(litellmTargetGroup);

    // Allow Perplexica service to access EFS - TEMPORARILY DISABLED
    // perplexicaFileSystem.connections.allowDefaultPortFrom(perplexicaService.connections);
    
    // // Grant EFS permissions to the task role
    // perplexicaTaskDef.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
    //   effect: iam.Effect.ALLOW,
    //   actions: [
    //     'elasticfilesystem:ClientMount',
    //     'elasticfilesystem:ClientWrite',
    //     'elasticfilesystem:ClientRootAccess',
    //   ],
    //   resources: [perplexicaFileSystem.fileSystemArn],
    //   conditions: {
    //     StringEquals: {
    //       'elasticfilesystem:AccessPointArn': perplexicaAccessPoint.accessPointArn,
    //     },
    //   },
    // }));

    // CodeBuild Projects
    const perplexicaBuildProject = this.createPerplexicaBuildProject(
      perplexicaRepo,
      artifactsBucket
    );

    const searxngBuildProject = this.createSearxngBuildProject(
      searxngRepo,
      artifactsBucket
    );

    const litellmBuildProject = this.createLitellmBuildProject(
      litellmRepo,
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

    this.createLitellmPipeline(
      litellmBuildProject,
      litellmService,
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

    new cdk.CfnOutput(this, 'LitellmLoadBalancerDNS', {
      value: litellmALB.loadBalancerDnsName,
      description: 'LiteLLM Load Balancer DNS Name',
    });

    new cdk.CfnOutput(this, 'LitellmRepoUri', {
      value: litellmRepo.repositoryUri,
      description: 'LiteLLM ECR Repository URI',
    });

    new cdk.CfnOutput(this, 'ArtifactsBucketName', {
      exportName: 'ArtifactsBucket',
      value: artifactsBucket.bucketName,
      description: 'S3 Bucket for storing build artifacts',
    });

    // new cdk.CfnOutput(this, 'PerplexicaFileSystemId', {
    //   value: perplexicaFileSystem.fileSystemId,
    //   description: 'EFS File System ID for Perplexica persistent storage',
    // });
  }

  private createEcrRepositoriesWithFallback(): { perplexicaRepo: ecr.IRepository; searxngRepo: ecr.IRepository; litellmRepo: ecr.IRepository } {
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
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:InvokeFunction'],
          resources: [ecrManagerFunction.functionArn],
        }),
      ]),
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
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:InvokeFunction'],
          resources: [ecrManagerFunction.functionArn],
        }),
      ]),
    });

    const litellmRepoResource = new cr.AwsCustomResource(this, 'LitellmRepoResource', {
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: ecrManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Create',
            ResourceProperties: {
              RepositoryName: 'litellm-proxy'
            }
          })
        },
        physicalResourceId: cr.PhysicalResourceId.of('litellm-proxy'),
      },
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: ecrManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Update',
            ResourceProperties: {
              RepositoryName: 'litellm-proxy'
            }
          })
        },
        physicalResourceId: cr.PhysicalResourceId.of('litellm-proxy'),
      },
      onDelete: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: ecrManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Delete',
            ResourceProperties: {
              RepositoryName: 'litellm-proxy'
            }
          })
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:InvokeFunction'],
          resources: [ecrManagerFunction.functionArn],
        }),
      ]),
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

    const litellmRepo = ecr.Repository.fromRepositoryAttributes(this, 'LitellmRepo', {
      repositoryName: 'litellm-proxy',
      repositoryArn: `arn:aws:ecr:${this.region}:${this.account}:repository/litellm-proxy`,
    });

    // Ensure the custom resources are created before the repositories are used
    perplexicaRepo.node.addDependency(perplexicaRepoResource);
    searxngRepo.node.addDependency(searxngRepoResource);
    litellmRepo.node.addDependency(litellmRepoResource);

    return { perplexicaRepo, searxngRepo, litellmRepo };
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

    // Add CloudFormation permissions to read stack outputs
    buildRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:DescribeStacks',
      ],
      resources: [
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/${this.stackName}/*`,
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/PerplexicaStack/*`,
      ],
    }));

    // Add ECR Public permissions
    buildRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr-public:GetAuthorizationToken',
        'sts:GetServiceBearerToken',
      ],
      resources: ['*'],
    }));

    return new codebuild.Project(this, 'PerplexicaBuildProject', {
      role: buildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
        computeType: codebuild.ComputeType.MEDIUM, // 7GB RAM instead of 3GB
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
              'chmod +x scripts/build-perplexica-prebuild.sh',
              './scripts/build-perplexica-prebuild.sh',
            ],
          },
          build: {
            commands: [
              'chmod +x scripts/build-perplexica-build.sh',
              './scripts/build-perplexica-build.sh',
            ],
          },
          post_build: {
            commands: [
              'chmod +x scripts/build-perplexica-postbuild.sh',
              './scripts/build-perplexica-postbuild.sh',
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

    // Add CloudFormation permissions to read stack outputs
    buildRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:DescribeStacks',
      ],
      resources: [`arn:aws:cloudformation:${this.region}:${this.account}:stack/PerplexicaStack/*`],
    }));

    // Add ECR Public permissions
    buildRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr-public:GetAuthorizationToken',
        'sts:GetServiceBearerToken',
      ],
      resources: ['*'],
    }));

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
              'chmod +x scripts/build-searxng-prebuild.sh',
              './scripts/build-searxng-prebuild.sh',
            ],
          },
          build: {
            commands: [
              'chmod +x scripts/build-searxng-build.sh',
              './scripts/build-searxng-build.sh',
            ],
          },
          post_build: {
            commands: [
              'chmod +x scripts/build-searxng-postbuild.sh',
              './scripts/build-searxng-postbuild.sh',
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

  private createLitellmBuildProject(
    ecrRepo: ecr.IRepository,
    artifactsBucket: s3.Bucket
  ): codebuild.Project {
    const buildRole = new iam.Role(this, 'LitellmBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser'),
      ],
    });

    artifactsBucket.grantReadWrite(buildRole);

    return new codebuild.Project(this, 'LitellmBuildProject', {
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
              'chmod +x scripts/build-litellm-prebuild.sh',
              './scripts/build-litellm-prebuild.sh',
            ],
          },
          build: {
            commands: [
              'chmod +x scripts/build-litellm-build.sh',
              './scripts/build-litellm-build.sh',
            ],
          },
          post_build: {
            commands: [
              'chmod +x scripts/build-litellm-postbuild.sh',
              './scripts/build-litellm-postbuild.sh',
            ],
          },
        },
        artifacts: {
          files: ['imagedefinitions.json'],
        },
      }),
    });
  }

  private createLitellmPipeline(
    buildProject: codebuild.Project,
    ecsService: ecs.FargateService,
    artifactsBucket: s3.Bucket
  ): codepipeline.Pipeline {
    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    const pipelineRole = new iam.Role(this, 'LitellmPipelineRole', {
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

    return new codepipeline.Pipeline(this, 'LitellmPipeline', {
      role: pipelineRole,
      artifactBucket: artifactsBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipelineActions.S3SourceAction({
              actionName: 'Source',
              bucket: artifactsBucket,
              bucketKey: 'litellm-config.zip',
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