FROM ghcr.io/berriai/litellm:main-latest

WORKDIR /app

# Copy the LiteLLM configuration file
COPY litellm-config.yaml /app/config.yaml

# Expose port 80
EXPOSE 80

# Run LiteLLM with the configuration file
CMD ["litellm", "--config", "/app/config.yaml", "--port", "80", "--num_workers", "1"]
