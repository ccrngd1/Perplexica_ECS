#!/bin/bash

# Get the Perplexica pipeline name
PIPELINE_NAME=$(aws codepipeline list-pipelines --query "pipelineList[?contains(name, 'PerplexicaPipeline')].name" --output text)

if [ -z "$PIPELINE_NAME" ]; then
    echo "Error: Perplexica pipeline not found"
    exit 1
fi

echo "Checking status of pipeline: $PIPELINE_NAME"

# Get pipeline state
aws codepipeline get-pipeline-state --name "$PIPELINE_NAME" --query "stageStates[*].{Stage:stageName,Status:latestExecution.status}" --output table

# Get the build project name
BUILD_PROJECT=$(aws codebuild list-projects --query "projects[?contains(@, 'PerplexicaBuild')]" --output text)

if [ ! -z "$BUILD_PROJECT" ]; then
    echo ""
    echo "Recent builds for project: $BUILD_PROJECT"
    aws codebuild list-builds-for-project --project-name "$BUILD_PROJECT" --sort-order DESCENDING --query "ids[0:3]" --output table
    
    # Get the latest build ID
    LATEST_BUILD=$(aws codebuild list-builds-for-project --project-name "$BUILD_PROJECT" --sort-order DESCENDING --query "ids[0]" --output text)
    
    if [ ! -z "$LATEST_BUILD" ]; then
        echo ""
        echo "Latest build status: $LATEST_BUILD"
        aws codebuild batch-get-builds --ids "$LATEST_BUILD" --query "builds[0].{Status:buildStatus,Phase:currentPhase,StartTime:startTime}" --output table
    fi
fi