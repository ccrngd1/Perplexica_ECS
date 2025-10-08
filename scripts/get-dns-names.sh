#!/bin/bash

# Script to get DNS names for all load balancers (Perplexica, SearXNG, and LiteLLM)

set -e

echo "Getting load balancer DNS names..."

PERPLEXICA_DNS=$(aws cloudformation describe-stacks \
  --stack-name PerplexicaStack \
  --query 'Stacks[0].Outputs[?OutputKey==`PerplexicaLoadBalancerDNS`].OutputValue' \
  --output text)

SEARXNG_DNS=$(aws cloudformation describe-stacks \
  --stack-name PerplexicaStack \
  --query 'Stacks[0].Outputs[?OutputKey==`SearxngLoadBalancerDNS`].OutputValue' \
  --output text)

LITELLM_DNS=$(aws cloudformation describe-stacks \
  --stack-name PerplexicaStack \
  --query 'Stacks[0].Outputs[?OutputKey==`LitellmLoadBalancerDNS`].OutputValue' \
  --output text)

echo ""
echo "=== Application URLs ==="
echo "Perplexica: http://$PERPLEXICA_DNS/"
echo "SearXNG:    http://$SEARXNG_DNS/"
echo "LiteLLM:    http://$LITELLM_DNS/"
echo ""
echo "=== API Endpoints ==="
echo "LiteLLM API:    http://$LITELLM_DNS/v1/chat/completions"
echo "LiteLLM Health: http://$LITELLM_DNS/health"
echo "LiteLLM Docs:   http://$LITELLM_DNS/docs"
echo ""
echo "=== DNS Names ==="
echo "Perplexica ALB: $PERPLEXICA_DNS"
echo "SearXNG ALB:    $SEARXNG_DNS"
echo "LiteLLM ALB:    $LITELLM_DNS"