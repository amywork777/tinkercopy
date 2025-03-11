#!/bin/bash

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

echo "Starting server..."
node simple-checkout-server.cjs 