# Magic Taiyaki AI Integration Guide

This document outlines how to implement the integration between FishCAD and the Magic Taiyaki AI service to properly track model generations for free and pro users.

## Overview

The FishCAD application embeds Magic Taiyaki AI in an iframe and needs to track when users generate models to enforce usage limits (2 models for free users, 20 for pro users).

## Communication Protocol

### Messages from FishCAD to Magic Taiyaki AI

1. **Configuration Message**
   
   When the iframe loads, FishCAD sends a configuration message:

   ```javascript
   {
     type: 'fishcad_configure',
     isPro: boolean,           // Whether the user has a pro subscription
     modelsRemaining: number,  // Number of models remaining this month
     modelLimit: number,       // Total model limit for this user (2 for free, 20 for pro)
     userId: string            // The user's ID in FishCAD system
   }
   ```

2. **Limits Updated Message**
   
   After a successful model generation, FishCAD sends an updated limits message:

   ```javascript
   {
     type: 'fishcad_limits_updated',
     modelsRemaining: number,  // Updated number of models remaining
     modelLimit: number        // Total model limit
   }
   ```

### Messages from Magic Taiyaki AI to FishCAD

When a model is generated, Magic Taiyaki AI should send a message to FishCAD:

```javascript
{
  type: 'fishcad_generation_complete',
  modelId: string,            // Optional: ID of the generated model
  success: boolean,           // Whether generation was successful
  metadata: {                 // Optional: Any additional metadata
    // ...
  }
}
```

## Implementation on Magic Taiyaki AI Side

1. Listen for messages from the parent window:

   ```javascript
   window.addEventListener('message', (event) => {
     // Verify origin for security
     if (event.origin !== 'https://your-fishcad-domain.com') return;
     
     const message = event.data;
     
     // Handle configuration message
     if (message.type === 'fishcad_configure') {
       // Store user limits and status
       const { isPro, modelsRemaining, modelLimit, userId } = message;
       
       // Update UI to reflect limits
       updateLimitsUI(isPro, modelsRemaining, modelLimit);
       
       // Store user ID for later use
       storeUserId(userId);
     }
     
     // Handle limits updated message
     if (message.type === 'fishcad_limits_updated') {
       const { modelsRemaining, modelLimit } = message;
       
       // Update UI to reflect new limits
       updateLimitsUI(null, modelsRemaining, modelLimit);
     }
   });
   ```

2. Send message when a model is generated:

   ```javascript
   // Call this function when a model is successfully generated
   function notifyModelGenerated(modelId) {
     window.parent.postMessage({
       type: 'fishcad_generation_complete',
       modelId,
       success: true
     }, 'https://your-fishcad-domain.com');
   }
   ```

3. Optional: Implement UI updates to show limits:

   ```javascript
   function updateLimitsUI(isPro, modelsRemaining, modelLimit) {
     // Update your UI elements to show remaining generations
     const limitElement = document.getElementById('generation-limit');
     if (limitElement) {
       if (isPro) {
         limitElement.textContent = `Pro: ${modelsRemaining}/${modelLimit} generations remaining`;
       } else {
         limitElement.textContent = `Free: ${modelsRemaining}/${modelLimit} generations remaining`;
       }
     }
     
     // If no generations remaining, possibly disable the generate button
     const generateButton = document.getElementById('generate-button');
     if (generateButton && modelsRemaining <= 0 && !isPro) {
       generateButton.disabled = true;
       generateButton.title = 'Generation limit reached';
     }
   }
   ```

## Testing

To test this integration:

1. Use the browser console to simulate messages from both sides
2. Verify that model generation events are properly tracked
3. Check that the UI updates correctly when limits change
4. Ensure pro users can continue generating models without limits

## Troubleshooting

- Check browser console for message events and errors
- Verify that the origin check is allowing messages through
- Make sure postMessage data is serializable (no functions, DOM elements, etc.) 