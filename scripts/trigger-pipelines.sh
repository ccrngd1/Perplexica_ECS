#!/bin/bash

# Script to trigger all CodePipelines (Perplexica, SearXNG, and LiteLLM)

set -e

echo "Triggering Perplexica pipeline..."
aws codepipeline start-pipeline-execution --name PerplexicaStack-PerplexicaPipeline*

echo "Triggering SearXNG pipeline..."
aws codepipeline start-pipeline-execution --name PerplexicaStack-SearxngPipeline*

echo "Triggering LiteLLM pipeline..."
aws codepipeline start-pipeline-execution --name PerplexicaStack-LitellmPipeline*

echo "All pipelines have been triggered!"
echo "You can monitor their progress in the AWS CodePipeline console."
echo ""
echo "Pipeline names:"
echo "- PerplexicaStack-PerplexicaPipeline*"
echo "- PerplexicaStack-SearxngPipeline*"
echo "- PerplexicaStack-LitellmPipeline*"