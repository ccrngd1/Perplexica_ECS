#!/bin/bash

# Script to trigger all CodePipelines using a more reliable approach

set -e

echo "Finding pipelines..."

# Get all pipelines and filter by our stack name
ALL_PIPELINES=$(aws codepipeline list-pipelines --output json)

# Extract pipeline names that start with our stack name
PERPLEXICA_PIPELINE=$(echo "$ALL_PIPELINES" | jq -r '.pipelines[] | select(.name | startswith("PerplexicaStack-PerplexicaPipeline")) | .name')
SEARXNG_PIPELINE=$(echo "$ALL_PIPELINES" | jq -r '.pipelines[] | select(.name | startswith("PerplexicaStack-SearxngPipeline")) | .name')
LITELLM_PIPELINE=$(echo "$ALL_PIPELINES" | jq -r '.pipelines[] | select(.name | startswith("PerplexicaStack-LitellmPipeline")) | .name')

echo "Found pipelines:"
echo "  Perplexica: $PERPLEXICA_PIPELINE"
echo "  SearXNG: $SEARXNG_PIPELINE"
echo "  LiteLLM: $LITELLM_PIPELINE"
echo ""

# Function to trigger pipeline if it exists
trigger_pipeline() {
    local pipeline_name="$1"
    local description="$2"
    
    if [ -n "$pipeline_name" ] && [ "$pipeline_name" != "null" ]; then
        echo "Triggering $description pipeline: $pipeline_name"
        aws codepipeline start-pipeline-execution --name "$pipeline_name"
        echo "✓ $description pipeline triggered successfully"
    else
        echo "⚠ $description pipeline not found, skipping..."
    fi
    echo ""
}

# Trigger each pipeline
trigger_pipeline "$PERPLEXICA_PIPELINE" "Perplexica"
trigger_pipeline "$SEARXNG_PIPELINE" "SearXNG"
trigger_pipeline "$LITELLM_PIPELINE" "LiteLLM"

echo "All available pipelines have been triggered!"