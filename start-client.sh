#!/bin/bash

echo "===== STARTING CLIENT WITH PRODUCTION STRIPE KEYS ====="

# Change to client directory
cd client

# Verify environment variables are set
echo "Verifying Stripe production keys are set..."
grep "VITE_STRIPE_PUBLISHABLE_KEY" .env | grep "pk_live" > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Stripe Publishable Key (Live) is properly set in client/.env"
else
  echo "❌ WARNING: Stripe Publishable Key doesn't appear to be set to a live key!"
  echo "Please check your client/.env file"
fi

# Start a simple HTTP server for the client
echo "Starting client on http://localhost:8000..."
echo "Press Ctrl+C to stop"
python -m http.server 8000 