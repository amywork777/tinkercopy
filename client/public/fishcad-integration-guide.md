# FISHCAD Integration Guide

This guide explains how to integrate STL model imports from your website into FISHCAD.

## Simple Integration Method (Recommended)

The simplest way to integrate with FISHCAD is to use our JavaScript helper script, which handles the download and redirect process automatically.

### Step 1: Include the FISHCAD Import Helper Script

Add this script tag to your HTML:

```html
<script src="https://fishcad.com/fishcad-import.js"></script>
```

### Step 2: Add "Import to FISHCAD" Buttons

Add buttons or links that call the `window.FishCAD.importSTL()` function:

```html
<button onclick="window.FishCAD.importSTL('cube.stl', 'https://example.com/models/cube.stl')">
  Import to FISHCAD
</button>
```

The function accepts the following parameters:

- `fileName` (string, required): The name of the STL file (e.g., "cube.stl")
- `fileUrl` (string, required): The URL to download the STL file
- `options` (object, optional):
  - `openInNewTab` (boolean): Whether to open FISHCAD in a new tab (default: false)
  - `fishcadUrl` (string): Override the FISHCAD URL (default: "https://fishcad.com")
  - `metadata` (object): Additional metadata about the model

Example with all options:

```javascript
window.FishCAD.importSTL('cube.stl', 'https://example.com/models/cube.stl', {
  openInNewTab: true,
  fishcadUrl: 'https://dev.fishcad.com',
  metadata: {
    name: 'My Cube',
    description: 'A simple cube model',
    author: 'John Doe',
    license: 'CC-BY-4.0'
  }
});
```

### How It Works

1. When a user clicks "Import to FISHCAD":
   - The script stores the file details in localStorage
   - Initiates the file download
   - Redirects the user to FISHCAD

2. When FISHCAD loads:
   - It checks for pending import data in localStorage
   - If found, it shows a dialog asking the user to select the file they just downloaded
   - When the user selects the file, it's imported into FISHCAD

This approach:
- Doesn't require complex cross-origin messaging
- Works reliably across browsers
- Provides a good user experience

### Checking If FISHCAD Is Available

You can check if FISHCAD integration is available with:

```javascript
if (window.FishCAD && window.FishCAD.isAvailable()) {
  // Show FISHCAD import buttons
} else {
  // Hide FISHCAD import buttons or show alternative
}
```

## Advanced Integration (For Special Cases)

If you need more advanced integration, please refer to our API documentation or contact us.

## Example Implementation

Here's a complete example:

```html
<!DOCTYPE html>
<html>
<head>
  <title>FISHCAD Integration Example</title>
  <script src="https://fishcad.com/fishcad-import.js"></script>
  <style>
    .fishcad-button {
      background-color: #3b82f6;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
    }
    .fishcad-button:hover {
      background-color: #2563eb;
    }
  </style>
</head>
<body>
  <h1>Model Gallery</h1>
  
  <div class="model-card">
    <h2>Simple Cube</h2>
    <img src="cube-preview.jpg" alt="Cube Preview">
    <p>A simple 3D cube model</p>
    <div class="buttons">
      <button class="fishcad-button" onclick="window.FishCAD.importSTL('cube.stl', 'https://example.com/models/cube.stl')">
        Import to FISHCAD
      </button>
      <a href="https://example.com/models/cube.stl" download>Download STL</a>
    </div>
  </div>
  
  <script>
    // Check if FISHCAD is available
    document.addEventListener('DOMContentLoaded', function() {
      if (!window.FishCAD || !window.FishCAD.isAvailable()) {
        // Hide FISHCAD buttons if integration is not available
        const buttons = document.querySelectorAll('.fishcad-button');
        buttons.forEach(button => {
          button.style.display = 'none';
        });
      }
    });
  </script>
</body>
</html>
```

## Support

If you have any questions or need assistance with FISHCAD integration, please contact us at support@fishcad.com. 