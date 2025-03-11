#!/bin/bash

echo "===== DEPLOYING TO FISHCAD.COM WITH PRODUCTION STRIPE KEYS ====="

# Check if we have the necessary environment files with production keys
echo "Verifying Stripe production keys are set..."

if [ -f "server/.env" ]; then
  grep "STRIPE_SECRET_KEY" server/.env | grep "sk_live" > /dev/null
  if [ $? -eq 0 ]; then
    echo "✅ Server: Stripe Secret Key (Live) is properly set"
  else
    echo "❌ WARNING: Server: Stripe Secret Key doesn't appear to be set to a live key!"
    echo "Please check your server/.env file"
    exit 1
  fi

  grep "STRIPE_PUBLISHABLE_KEY" server/.env | grep "pk_live" > /dev/null
  if [ $? -eq 0 ]; then
    echo "✅ Server: Stripe Publishable Key (Live) is properly set"
  else
    echo "❌ WARNING: Server: Stripe Publishable Key doesn't appear to be set to a live key!"
    echo "Please check your server/.env file"
    exit 1
  fi
else
  echo "❌ ERROR: server/.env file not found!"
  exit 1
fi

if [ -f "client/.env" ]; then
  grep "VITE_STRIPE_PUBLISHABLE_KEY" client/.env | grep "pk_live" > /dev/null
  if [ $? -eq 0 ]; then
    echo "✅ Client: Stripe Publishable Key (Live) is properly set"
  else
    echo "❌ WARNING: Client: Stripe Publishable Key doesn't appear to be set to a live key!"
    echo "Please check your client/.env file"
    exit 1
  fi
else
  echo "❌ ERROR: client/.env file not found!"
  exit 1
fi

echo "All Stripe keys are properly configured for production!"

# Your deployment steps go here, depending on how you deploy to fishcad.com
# Examples might be:
# - git push to a repo that triggers deployment
# - using a deployment tool like Vercel, Netlify, etc.
# - rsync or scp files to a server

echo "======================================================"
echo "DEPLOYMENT INSTRUCTIONS FOR FISHCAD.COM:"
echo "======================================================"
echo ""
echo "1. Commit all your changes with a message that indicates this is a"
echo "   production deployment with live Stripe keys:"
echo ""
echo "   git add ."
echo "   git commit -m \"Switch to production Stripe keys for fishcad.com deployment\""
echo ""
echo "2. Push to your deployment branch (usually main/master):"
echo ""
echo "   git push origin main"
echo ""
echo "3. Make sure your deployment process on fishcad.com correctly uses"
echo "   the environment variables from your .env files"
echo ""
echo "4. After deployment, verify that the live Stripe keys are being used by"
echo "   checking that subscription payments work in production"
echo ""
echo "5. Monitor for any subscription or payment issues after the deployment"
echo ""
echo "======================================================"
echo "DEPLOYMENT PREPARED SUCCESSFULLY"
echo "======================================================" 