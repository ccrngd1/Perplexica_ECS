#!/bin/bash

# Get the Perplexica pipeline name
PIPELINE_NAME=$(aws codepipeline list-pipelines --query "pipelineList[?contains(name, 'PerplexicaPipeline')].name" --output text)

if [ -z "$PIPELINE_NAME" ] || [ "$PIPELINE_NAME" = "None" ]; then
    echo "Error: Perplexica pipeline not found"
    echo "Available pipelines:"
    aws codepipeline list-pipelines --query "pipelineList[].name" --output text
    exit 1
fi

echo "Found pipeline: $PIPELINE_NAME"
echo "Triggering pipeline..."

aws codepipeline start-pipeline-execution --name "$PIPELINE_NAME"

echo "Pipeline triggered successfully!"