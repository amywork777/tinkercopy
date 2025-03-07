# Taiyaki to FISHCAD Integration Guide

This guide explains how to add "Import to FISHCAD" functionality to Taiyaki websites.

## Quick Start

1. **Include the FISHCAD helper script**:

```html
<script src="https://fishcad.com/fishcad-import.js"></script>
```

2. **Add an "Import to FISHCAD" button**:

```html
<button onclick="window.FishCAD.importSTLFromUrl('cube.stl', 'https://example.com/models/cube.stl')">
  Import to FISHCAD
</button>
```

That's it! When a user clicks the button, they'll be redirected to FISHCAD with your model.

## Integration Methods

FISHCAD supports multiple integration methods:

### Method 1: Direct URL Import (Recommended)

This is the simplest and most user-friendly approach. It sends the URL of your STL file to FISHCAD, which downloads and imports it directly:

```javascript
window.FishCAD.importSTLFromUrl('model.stl', 'https://yourdomain.com/model.stl');
```

This method works well when:
- Your STL files are publicly accessible
- You have CORS configured to allow FISHCAD to download your files

### Method 2: Base64 Data Import

If you already have the STL data loaded in memory (for example, if you're generating STLs on the client-side):

```javascript
window.FishCAD.importSTLFromData('model.stl', base64EncodedSTLData);
```

### Method 3: Download + File Selection

This method downloads the file to the user's computer first, then asks them to select it in FISHCAD:

```javascript
window.FishCAD.importSTLWithDownload('model.stl', 'https://yourdomain.com/model.stl');
```

Use this when direct URL import doesn't work due to CORS restrictions.

## Advanced Integration

For all methods, you can provide additional options:

```javascript
window.FishCAD.importSTLFromUrl('model.stl', 'https://yourdomain.com/model.stl', {
  openInNewTab: true,  // Open FISHCAD in a new tab
  fishcadUrl: 'https://dev.fishcad.com',  // For testing with a different environment
  metadata: {
    name: 'My Amazing Model',
    description: 'Created on Taiyaki',
    author: 'Taiyaki User',
    license: 'CC-BY-4.0'
  }
});
```

## Implementation Examples

### Adding a FISHCAD button to model cards:

```html
<div class="model-card">
  <h3>Cute Fish</h3>
  <img src="fish-preview.jpg" alt="Fish Model Preview">
  
  <div class="model-actions">
    <button class="download-btn">Download STL</button>
    <button class="fishcad-btn" onclick="window.FishCAD.importSTLFromUrl('fish.stl', 'https://taiyaki.ai/models/fish.stl')">
      Edit in FISHCAD
    </button>
  </div>
</div>
```

### Dynamic model generation:

```javascript
function generateModel() {
  // Your code to generate an STL model
  const stlData = generateSTL();
  
  // Convert to base64
  const base64Data = btoa(stlData);
  
  // Send to FISHCAD
  window.FishCAD.importSTLFromData('generated-model.stl', base64Data, {
    metadata: {
      name: 'Generated Model',
      description: 'Procedurally generated on Taiyaki'
    }
  });
}
```

## Styling Your FISHCAD Button

We recommend styling your FISHCAD button to be easily recognizable but integrated with your site's design:

```css
.fishcad-btn {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.fishcad-btn:hover {
  background-color: #2563eb;
}

.fishcad-btn::before {
  content: "";
  display: inline-block;
  width: 16px;
  height: 16px;
  background-image: url('path/to/fishcad-icon.png');
  background-size: contain;
  background-repeat: no-repeat;
}
```

## Testing Your Integration

1. Include the FISHCAD script in your page
2. Add an "Import to FISHCAD" button
3. Click the button and confirm it redirects to FISHCAD
4. Verify the model imports correctly

## Support

For technical support or questions about integrating with FISHCAD, please contact:
- support@fishcad.com
- Or ping us in the #fishcad Slack channel 