FROM ghcr.io/berriai/litellm:main-latest

WORKDIR /app

# Copy the LiteLLM configuration file
COPY config/litellm-config.yaml /app/config.yaml

# Expose port 80
EXPOSE 80

# Run LiteLLM with the configuration file
ENTRYPOINT ["litellm"]
CMD ["--config", "/app/config.yaml", "--port", "80"]
