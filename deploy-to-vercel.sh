#!/bin/bash

# Script to deploy to Vercel with forced cache invalidation

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null
then
    echo "Vercel CLI is not installed. Installing now..."
    npm install -g vercel
fi

# Login to Vercel if not already logged in
vercel whoami &> /dev/null || vercel login

# Generate a timestamp for cache busting
TIMESTAMP=$(date +%s)
echo "Using deployment timestamp: $TIMESTAMP"

# Create or update a special build env var to bust caches
echo "Setting DEPLOY_TIMESTAMP=$TIMESTAMP to force fresh deployment..."
vercel env add DEPLOY_TIMESTAMP production $TIMESTAMP -y

# Force a fresh build and deployment
echo "Initiating deployment to Vercel with --force flag..."
vercel deploy --prod --force

echo "Deployment complete! Please verify your changes by visiting your production URL."
echo "After deployment, you can check if your subscription status updates correctly."
echo ""
echo "To debug subscription issues:"
echo "1. Visit [your-domain]/api/health to check API connectivity"
echo "2. Visit [your-domain]/api/subscription-debug?userId=YOUR_USER_ID to view subscription data"
echo "3. In your app, use the 'Refresh Subscription' button in the user dropdown menu" 