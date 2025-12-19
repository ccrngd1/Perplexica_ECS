#!/bin/bash

# Direct approach - use the actual pipeline name we found
PIPELINE_NAME="PerplexicaStack-PerplexicaPipeline799B4F05-rpn5LJj1nsty"

echo "Triggering Perplexica pipeline directly: $PIPELINE_NAME"

aws codepipeline start-pipeline-execution --name "$PIPELINE_NAME"

if [ $? -eq 0 ]; then
    echo "✓ Perplexica pipeline triggered successfully!"
else
    echo "✗ Failed to trigger pipeline"
    echo "Let's check what pipelines are available:"
    aws codepipeline list-pipelines --output table
fi