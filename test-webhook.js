// Script to test webhook handling
require('dotenv').config({path: '.env.local'});
const fetch = require('node-fetch');
const crypto = require('crypto');

// Get webhook secret from environment
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!webhookSecret) {
  console.error('STRIPE_WEBHOOK_SECRET is not set in the environment');
  process.exit(1);
}

// Create a sample checkout.session.completed event
const sampleEvent = {
  id: 'evt_test_' + Date.now(),
  object: 'event',
  api_version: '2023-10-16',
  created: Math.floor(Date.now() / 1000),
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_' + Date.now(),
      object: 'checkout.session',
      after_expiration: null,
      allow_promotion_codes: true,
      amount_subtotal: 12900,
      amount_total: 12900,
      automatic_tax: { enabled: false, status: null },
      billing_address_collection: null,
      cancel_url: 'http://localhost:3000/pricing',
      client_reference_id: null,
      consent: null,
      consent_collection: null,
      created: Math.floor(Date.now() / 1000) - 300,
      currency: 'usd',
      custom_text: { shipping_address: null, submit: null },
      customer: 'cus_test_diagnostic',
      customer_creation: 'if_required',
      customer_details: {
        address: { city: null, country: null, line1: null, line2: null, postal_code: null, state: null },
        email: 'test@example.com',
        name: 'Test User',
        phone: null,
        tax_exempt: 'none',
        tax_ids: []
      },
      customer_email: 'test@example.com',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      invoice: null,
      invoice_creation: { enabled: true, invoice_data: { account_tax_ids: null, custom_fields: null, description: null, footer: null, metadata: {} } },
      livemode: false,
      locale: null,
      metadata: {
        userId: process.argv[2] || 'test_user_123', // Use provided userId or default
        source: 'diagnostic_test'
      },
      mode: 'subscription',
      payment_intent: null,
      payment_method_options: {},
      payment_method_types: ['card'],
      payment_status: 'paid',
      phone_number_collection: { enabled: false },
      recovered_from: null,
      setup_intent: null,
      shipping_address_collection: null,
      shipping_options: [],
      status: 'complete',
      submit_type: null,
      subscription: 'sub_test_diagnostic',
      success_url: 'http://localhost:3000/pricing/success?session_id={CHECKOUT_SESSION_ID}',
      total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
      url: null
    }
  }
};

// Function to sign the payload
function generateSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
    
  return `t=${timestamp},v1=${signature}`;
}

// Function to send the webhook request
async function testWebhook(webhookUrl, event, secret) {
  try {
    console.log(`Testing webhook with event: ${event.type}`);
    console.log(`Event ID: ${event.id}`);
    console.log(`User ID in metadata: ${event.data.object.metadata.userId}`);
    
    const payload = JSON.stringify(event);
    const signature = generateSignature(payload, secret);
    
    console.log(`Sending request to ${webhookUrl}`);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature
      },
      body: payload
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Response data:', data);
      console.log('\nWebhook test completed successfully');
    } else {
      const text = await response.text();
      console.error('Error response:', text);
    }
  } catch (error) {
    console.error('Error sending webhook test:', error);
  }
}

// Get webhook URL from command line or use default
const webhookUrl = process.argv[3] || 'http://localhost:4002/api/webhook';

// Execute the test
console.log('Running webhook test with the following configuration:');
console.log(`Webhook URL: ${webhookUrl}`);
console.log(`Webhook Secret: ${webhookSecret.substring(0, 5)}...`);
console.log(`User ID: ${sampleEvent.data.object.metadata.userId}`);
console.log('\nSending test event...\n');

testWebhook(webhookUrl, sampleEvent, webhookSecret); 