#!/bin/bash

# Script to get DNS names for both load balancers

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

echo ""
echo "=== Application URLs ==="
echo "Perplexica: http://$PERPLEXICA_DNS/"
echo "SearXNG:    http://$SEARXNG_DNS/"
echo ""
echo "=== DNS Names ==="
echo "Perplexica ALB: $PERPLEXICA_DNS"
echo "SearXNG ALB:    $SEARXNG_DNS"