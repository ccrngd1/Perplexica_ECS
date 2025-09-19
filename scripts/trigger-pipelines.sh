#!/bin/bash

# Script to trigger both CodePipelines

set -e

echo "Triggering Perplexica pipeline..."
aws codepipeline start-pipeline-execution --name PerplexicaStack-PerplexicaPipeline*

echo "Triggering SearXNG pipeline..."
aws codepipeline start-pipeline-execution --name PerplexicaStack-SearxngPipeline*

echo "Both pipelines have been triggered!"
echo "You can monitor their progress in the AWS CodePipeline console."