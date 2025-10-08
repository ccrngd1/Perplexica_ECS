#!/bin/bash

# Script to trigger all CodePipelines (Perplexica, SearXNG, and LiteLLM)

set -e

# Function to find and trigger pipeline by pattern
trigger_pipeline() {
    local pattern=$1
    local description=$2
    
    echo "Finding $description pipeline..."
    local pipeline_name=$(aws codepipeline list-pipelines --query "pipelineList[?starts_with(name, '$pattern')].name" --output text)
    
    if [ -z "$pipeline_name" ]; then
        echo "Warning: No pipeline found matching pattern '$pattern'"
        return 1
    fi
    
    echo "Found pipeline: $pipeline_name"
    echo "Triggering $description pipeline..."
    aws codepipeline start-pipeline-execution --name "$pipeline_name"
    echo "✓ $description pipeline triggered successfully"
    echo ""
}

# Trigger each pipeline
trigger_pipeline "PerplexicaStack-PerplexicaPipeline" "Perplexica"
trigger_pipeline "PerplexicaStack-SearxngPipeline" "SearXNG"
trigger_pipeline "PerplexicaStack-LitellmPipeline" "LiteLLM"

echo "All pipelines have been triggered!"
echo "You can monitor their progress in the AWS CodePipeline console."