# Magic Taiyaki AI Integration Guide

This document outlines how to implement the integration between FishCAD and the Magic Taiyaki AI service to properly track STL downloads for free and pro users.

## Overview

The FishCAD application embeds Magic Taiyaki AI in an iframe and needs to track when users download STL files to enforce usage limits (2 downloads for free users, 20 for pro users).

## Communication Protocol

### Messages from FishCAD to Magic Taiyaki AI

1. **Configuration Message**
   
   When the iframe loads, FishCAD sends a configuration message:

   ```javascript
   {
     type: 'fishcad_configure',
     isPro: boolean,           // Whether the user has a pro subscription
     modelsRemaining: number,  // Number of downloads remaining this month
     modelLimit: number,       // Total download limit for this user (2 for free, 20 for pro)
     userId: string            // The user's ID in FishCAD system
   }
   ```

2. **Limits Updated Message**
   
   After a successful download, FishCAD sends an updated limits message:

   ```javascript
   {
     type: 'fishcad_limits_updated',
     modelsRemaining: number,  // Updated number of downloads remaining
     modelLimit: number        // Total download limit
   }
   ```

### Messages from Magic Taiyaki AI to FishCAD

When a user clicks a "Download STL" button, Magic Taiyaki AI should send a message to FishCAD:

```javascript
{
  type: 'download_stl',
  modelId: string,            // Optional: ID of the model being downloaded
  fileName: string,           // Optional: Filename of the STL
  element: string,            // Optional: The element type that was clicked (button, a, etc.)
  text: string                // Optional: Text content of the element clicked
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

2. Send message when a user clicks "Download STL":

   ```javascript
   // First, track all download buttons in your application
   document.querySelectorAll('button, a').forEach(element => {
     if (element.textContent.toLowerCase().includes('download') ||
         element.textContent.toLowerCase().includes('stl') ||
         (element.tagName === 'A' && element.getAttribute('download')) ||
         (element.tagName === 'A' && element.getAttribute('href')?.endsWith('.stl'))) {
       
       element.addEventListener('click', function(e) {
         // Notify parent window about the download attempt
         window.parent.postMessage({
           type: 'download_stl',
           modelId: getCurrentModelId(), // Your function to get current model ID
           fileName: getFileName(),      // Your function to get filename
           element: this.tagName,
           text: this.textContent
         }, 'https://your-fishcad-domain.com');
       });
     }
   });
   ```

3. Disable download buttons for free users with no remaining downloads:

   ```javascript
   function updateLimitsUI(isPro, modelsRemaining, modelLimit) {
     // Update your UI elements to show remaining downloads
     const limitElement = document.getElementById('download-limit');
     if (limitElement) {
       if (isPro) {
         limitElement.textContent = `Pro: Unlimited downloads`;
       } else {
         limitElement.textContent = `${modelsRemaining}/${modelLimit} downloads remaining`;
       }
     }
     
     // If no downloads remaining, disable the download buttons
     if (!isPro && modelsRemaining <= 0) {
       document.querySelectorAll('button, a').forEach(element => {
         if (element.textContent.toLowerCase().includes('download') ||
             element.textContent.toLowerCase().includes('stl') ||
             (element.tagName === 'A' && element.getAttribute('download')) ||
             (element.tagName === 'A' && element.getAttribute('href')?.endsWith('.stl'))) {
           
           // Disable the button
           element.setAttribute('disabled', 'true');
           element.classList.add('disabled');
           element.style.opacity = '0.5';
           element.style.cursor = 'not-allowed';
           
           // Add tooltip
           element.setAttribute('title', 'No downloads remaining. Upgrade to Pro for more.');
           
           // Prevent default action
           element.addEventListener('click', e => {
             e.preventDefault();
             e.stopPropagation();
             
             // Optionally show a message
             const limitReachedEvent = new CustomEvent('limitReached');
             document.dispatchEvent(limitReachedEvent);
             
             return false;
           }, true);
         }
       });
     }
   }
   ```

## Testing

To test this integration:

1. Use browser developer tools to watch network activity for .stl file downloads
2. Check that download events are correctly tracked and counted
3. Verify that free users cannot download more than their limit
4. Confirm that Pro users can download without restrictions

## Troubleshooting

- Look for console errors when download buttons are clicked
- Verify that postMessage events are being correctly sent
- Check that download buttons are properly identified by the tracking code 