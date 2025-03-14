#!/usr/bin/env node

/**
 * PRODUCTION WEBHOOK VERIFICATION SCRIPT
 * This script directly checks Stripe webhook settings and verifies recent events
 * 
 * Usage: 
 *   node scripts/check-webhook.js
 */

const { Stripe } = require('stripe');
const readline = require('readline');

// Create readline interface for CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt for user input
function promptUser(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  try {
    let stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      console.log('No Stripe secret key found in environment variables.');
      stripeSecretKey = await promptUser('Enter your Stripe secret key: ');
      
      if (!stripeSecretKey) {
        console.error('Stripe secret key is required.');
        process.exit(1);
      }
    }
    
    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });
    
    console.log('\n🔍 Checking Stripe webhook endpoints...');
    const webhookEndpoints = await stripe.webhookEndpoints.list({
      limit: 10,
    });
    
    if (webhookEndpoints.data.length === 0) {
      console.error('⚠️ No webhook endpoints found for this Stripe account!');
    } else {
      console.log(`Found ${webhookEndpoints.data.length} webhook endpoints:`);
      
      for (const endpoint of webhookEndpoints.data) {
        console.log(`\n📌 Webhook Endpoint: ${endpoint.url}`);
        console.log(`   Status: ${endpoint.status}`);
        console.log(`   Events: ${endpoint.enabled_events.join(', ')}`);
        
        // Check if this endpoint is for fishcad.com
        if (endpoint.url.includes('fishcad.com')) {
          console.log('   ✅ This appears to be the fishcad.com webhook');
          
          // Check if it has the necessary events
          const requiredEvents = [
            'checkout.session.completed',
            'customer.subscription.updated',
            'customer.subscription.deleted'
          ];
          
          const missingEvents = requiredEvents.filter(
            event => !endpoint.enabled_events.includes(event) && 
                    !endpoint.enabled_events.includes('*')
          );
          
          if (missingEvents.length > 0) {
            console.log(`   ⚠️ Missing required events: ${missingEvents.join(', ')}`);
          } else {
            console.log('   ✅ All required events are configured');
          }
        }
      }
    }
    
    // Check recent webhook events
    console.log('\n🔍 Checking recent Stripe events...');
    const events = await stripe.events.list({
      limit: 25,
    });
    
    if (events.data.length === 0) {
      console.log('No recent events found.');
    } else {
      console.log(`Found ${events.data.length} recent events:`);
      
      // Filter for subscription-related events
      const subscriptionEvents = events.data.filter(event => 
        event.type.startsWith('checkout.session') || 
        event.type.startsWith('customer.subscription')
      );
      
      if (subscriptionEvents.length === 0) {
        console.log('⚠️ No recent subscription-related events found!');
      } else {
        console.log(`\n📊 Recent subscription-related events (${subscriptionEvents.length}):`);
        
        for (const event of subscriptionEvents) {
          console.log(`\n▶️ Event: ${event.type} (${new Date(event.created * 1000).toLocaleString()})`);
          
          // For checkout session events, check if they have userId in metadata
          if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            
            if (session.metadata && session.metadata.userId) {
              console.log(`   ✅ User ID found in session metadata: ${session.metadata.userId}`);
            } else {
              console.log('   ⚠️ No userId found in session metadata!');
            }
            
            // Check for subscription data
            if (session.subscription) {
              const subscriptionId = typeof session.subscription === 'string' ? 
                session.subscription : session.subscription.id;
              
              console.log(`   📝 Subscription ID: ${subscriptionId}`);
              
              // Get subscription details
              try {
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                
                if (subscription.metadata && subscription.metadata.userId) {
                  console.log(`   ✅ User ID found in subscription metadata: ${subscription.metadata.userId}`);
                } else {
                  console.log('   ⚠️ No userId found in subscription metadata!');
                }
                
                console.log(`   📝 Subscription status: ${subscription.status}`);
              } catch (error) {
                console.log(`   ⚠️ Error retrieving subscription: ${error.message}`);
              }
            } else {
              console.log('   ⚠️ No subscription found in checkout session!');
            }
          }
        }
      }
    }
    
    // Check recent checkout sessions
    console.log('\n🔍 Checking recent checkout sessions...');
    const sessions = await stripe.checkout.sessions.list({
      limit: 10,
    });
    
    if (sessions.data.length === 0) {
      console.log('No recent checkout sessions found.');
    } else {
      console.log(`Found ${sessions.data.length} recent checkout sessions:`);
      
      for (const session of sessions.data) {
        console.log(`\n📝 Session ID: ${session.id} (${new Date(session.created * 1000).toLocaleString()})`);
        console.log(`   Status: ${session.status}`);
        console.log(`   Mode: ${session.mode}`);
        
        if (session.metadata && session.metadata.userId) {
          console.log(`   ✅ User ID found in session metadata: ${session.metadata.userId}`);
        } else {
          console.log('   ⚠️ No userId found in session metadata!');
        }
        
        if (session.customer) {
          const customerId = typeof session.customer === 'string' ? 
            session.customer : session.customer.id;
          
          console.log(`   👤 Customer ID: ${customerId}`);
          
          // Check customer metadata
          try {
            const customer = await stripe.customers.retrieve(customerId);
            if (customer.metadata && customer.metadata.userId) {
              console.log(`   ✅ User ID found in customer metadata: ${customer.metadata.userId}`);
            } else {
              console.log('   ⚠️ No userId found in customer metadata!');
            }
          } catch (error) {
            console.log(`   ⚠️ Error retrieving customer: ${error.message}`);
          }
        }
      }
    }
    
    // Finish with summary
    console.log('\n✨ Webhook check completed!');
    console.log('If you see any warnings above, those are areas that need attention.');
    console.log('\nCommon issues to check:');
    console.log('1. Make sure your webhook endpoint URL is correct: https://fishcad.com/api/webhook');
    console.log('2. Ensure the webhook secret in your environment matches the one in Stripe');
    console.log('3. Verify all required events are enabled for your webhook');
    console.log('4. Check that userId is included in both session and subscription metadata');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    rl.close();
  }
}

// Run the main function
main(); 