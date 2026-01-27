#!/bin/bash
set -e

echo "Build started on $(date)"

echo "Creating custom Dockerfile..."
cat > Dockerfile <<'EOF'
FROM searxng/searxng:latest
COPY config/settings.yml /etc/searxng/settings.yml
COPY config/limiter.toml /etc/searxng/limiter.toml
COPY config/searxng-uwsgi.ini /usr/local/searxng/searx/uwsgi.ini
ENTRYPOINT ["/usr/local/searxng/entrypoint.sh"]
EOF

echo "Generated Dockerfile:"
cat Dockerfile

echo "Building the Docker image..."
docker build -t $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION .

docker tag $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION $IMAGE_URI:latest
docker tag $IMAGE_REPO_NAME:$CODEBUILD_RESOLVED_SOURCE_VERSION $IMAGE_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION
