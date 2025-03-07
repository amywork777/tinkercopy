# FishCAD Pricing & Subscription Setup Guide

This guide explains how to set up and test the pricing and subscription functionality for FishCAD.

## Prerequisites

- Node.js installed
- Firebase project with Firestore enabled
- Stripe account with API keys

## Environment Variables

The following environment variables need to be set:

### Stripe Configuration

```
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_MONTHLY=price_xxx
STRIPE_PRICE_ANNUAL=price_xxx
```

### Firebase Configuration

```
FIREBASE_PROJECT_ID=xxx
FIREBASE_PRIVATE_KEY_ID=xxx
FIREBASE_PRIVATE_KEY=xxx
FIREBASE_CLIENT_EMAIL=xxx
FIREBASE_CLIENT_ID=xxx
FIREBASE_CLIENT_CERT_URL=xxx
```

## Setup Instructions

1. **Initialize Firestore**

   Run the initialization script to set up subscription fields for existing users:

   ```bash
   cd server
   node scripts/init-firestore-subscriptions.js
   ```

2. **Set up Stripe Webhook**

   Create a webhook endpoint in your Stripe dashboard:
   - Go to Developers > Webhooks
   - Add Endpoint: `https://fishcad.com/api/pricing/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

3. **Update Firestore Security Rules**

   Copy the rules from `firestore-rules.txt` to your Firebase console:
   - Go to Firebase Console > Firestore Database > Rules
   - Replace existing rules with the contents of the file

## Testing the Implementation

1. **Test with Stripe Test Mode**

   Before going live, test the subscription flow using Stripe test cards:
   - Toggle to test mode in your Stripe dashboard
   - Use test card number: `4242 4242 4242 4242`
   - Any future expiration date and any 3-digit CVC

2. **Test the Monthly Reset**

   The system automatically resets usage limits on the first day of each month.
   To manually trigger a reset for testing:

   ```javascript
   // In your browser console while logged in as an admin
   async function triggerReset() {
     const response = await fetch('/api/admin/reset-monthly-limits', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({ adminKey: 'your-admin-key' })
     });
     console.log(await response.json());
   }
   triggerReset();
   ```

3. **Verify Subscription Status**

   After subscribing, check the user's status:
   - Go to your account page
   - Verify the "Pro" badge appears
   - Check that model generation limits have been increased to 20

## Troubleshooting

### Webhook Issues

If webhooks aren't being received:
1. Check your firewall/network settings
2. Verify the webhook secret matches
3. Look at webhook events in the Stripe dashboard

### Firebase Issues

If subscription updates aren't working:
1. Check Firebase logs for errors
2. Verify security rules are allowing updates
3. Check that the service account has proper permissions

## Going Live

When ready to go live:
1. Ensure stripe is in "live" mode 
2. Update all test price IDs to live price IDs
3. Make sure webhooks are configured for the live environment
4. Test a real transaction with a small amount 