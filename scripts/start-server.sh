#!/bin/bash

# Start script for ModelFusionStudio with Firebase and Stripe integrations
echo "Starting ModelFusionStudio server..."

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo "Error: .env file not found. Please create one with necessary environment variables."
  exit 1
fi

# Check for required environment variables
source .env
REQUIRED_VARS=(
  "STRIPE_SECRET_KEY"
  "FIREBASE_API_KEY"
  "VITE_API_URL"
)

MISSING_VARS=0
for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR}" ]; then
    echo "Missing required environment variable: $VAR"
    MISSING_VARS=$((MISSING_VARS+1))
  fi
done

if [ $MISSING_VARS -gt 0 ]; then
  echo "Please set all required environment variables in your .env file."
  exit 1
fi

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p uploads
mkdir -p stl-files
mkdir -p logs

# Create a start timestamp for logging
TIMESTAMP=$(date +%Y%m%d%H%M%S)
LOG_FILE="logs/server-${TIMESTAMP}.log"

echo "Starting server with Firebase and Stripe integrations..."
echo "Server output will be logged to: $LOG_FILE"

# Run the server with NODE_ENV set to production for better performance
NODE_ENV=production npm run dev 2>&1 | tee -a "$LOG_FILE" 