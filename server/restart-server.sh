#!/bin/bash

echo "===== RESTARTING SERVER WITH PRODUCTION STRIPE KEYS ====="

# Kill any existing server processes
echo "Checking for existing server processes on port 3001..."
PID=$(lsof -i:3001 -t)

if [ -n "$PID" ]; then
  echo "Found process $PID using port 3001. Stopping it..."
  kill -9 $PID
  sleep 1
  echo "Process stopped."
else
  echo "No process found using port 3001."
fi

# Verify environment variables are set
echo "Verifying Stripe production keys are set..."
grep "STRIPE_SECRET_KEY" .env | grep "sk_live" > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Stripe Secret Key (Live) is properly set"
else
  echo "❌ WARNING: Stripe Secret Key doesn't appear to be set to a live key!"
  echo "Please check your .env file"
fi

grep "STRIPE_PUBLISHABLE_KEY" .env | grep "pk_live" > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Stripe Publishable Key (Live) is properly set"
else
  echo "❌ WARNING: Stripe Publishable Key doesn't appear to be set to a live key!"
  echo "Please check your .env file"
fi

# Start the server
echo "Starting server with production Stripe keys..."
node simple-checkout-server.cjs

# This script will not reach this point unless the server crashes or is closed
echo "Server process has ended." 