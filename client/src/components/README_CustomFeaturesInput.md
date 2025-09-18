# CustomFeaturesInput Component

A reusable React component that allows users to add custom features manually to any form.

## Features

- ✅ Add custom features with text input
- ✅ Remove features individually
- ✅ Prevent duplicate entries
- ✅ Maximum feature limit (configurable)
- ✅ Enter key support for quick adding
- ✅ Responsive design
- ✅ Modern UI with hover effects
- ✅ Form validation

## Usage

### Basic Usage

```jsx
import React, { useState } from 'react';
import CustomFeaturesInput from './components/CustomFeaturesInput';

const MyForm = () => {
  const [customFeatures, setCustomFeatures] = useState([]);

  return (
    <form>
      {/* Other form fields */}
      
      <CustomFeaturesInput
        customFeatures={customFeatures}
        setCustomFeatures={setCustomFeatures}
      />
      
      {/* Other form fields */}
    </form>
  );
};
```

### Advanced Usage with Custom Props

```jsx
<CustomFeaturesInput
  customFeatures={customFeatures}
  setCustomFeatures={setCustomFeatures}
  label="Add Property Features"
  placeholder="Type a unique feature (e.g., Ocean view, Wine cellar)"
  maxFeatures={15}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `customFeatures` | `Array` | `[]` | Array of current custom features |
| `setCustomFeatures` | `Function` | Required | Function to update the features array |
| `label` | `String` | `"Add Custom Features"` | Label text for the input |
| `placeholder` | `String` | `"Type a custom feature..."` | Placeholder text for input field |
| `maxFeatures` | `Number` | `10` | Maximum number of features allowed |

## Integration Examples

### In AddList.js (Property Sales)
```jsx
// Add to state
const [customFeatures, setCustomFeatures] = useState([]);

// Add to form submission
formDataToSend.append('custom_features', JSON.stringify(customFeatures));

// Add to component
<CustomFeaturesInput
  customFeatures={customFeatures}
  setCustomFeatures={setCustomFeatures}
  label="Additional Property Features"
  placeholder="Add unique features (e.g., Smart home system, Wine cellar)"
  maxFeatures={12}
/>
```

### In AddRent.js (Rental Properties)
```jsx
<CustomFeaturesInput
  customFeatures={formData.customFeatures}
  setCustomFeatures={(features) => setFormData({...formData, customFeatures: features})}
  label="Additional Rental Features"
  placeholder="Add rental-specific features (e.g., Pet washing station)"
  maxFeatures={8}
/>
```

### In AddLease.js (Commercial Properties)
```jsx
<CustomFeaturesInput
  customFeatures={formData.customFeatures}
  setCustomFeatures={(features) => setFormData({...formData, customFeatures: features})}
  label="Commercial Features"
  placeholder="Add commercial features (e.g., Loading dock, 24/7 access)"
  maxFeatures={15}
/>
```

## Backend Integration

The component returns an array of strings that can be stored in the database as JSON:

```javascript
// Backend controller
const customFeatures = JSON.parse(req.body.custom_features || '[]');

// Store in database
INSERT INTO properties (..., custom_features) VALUES (..., $customFeatures)
```

## Styling

The component uses its own CSS file (`CustomFeaturesInput.css`) with unique class names to avoid conflicts:

- `.custom-features-input-container`
- `.custom-features-label`
- `.custom-features-input-field`
- `.custom-features-add-btn`
- `.custom-features-list`
- etc.

## Benefits

1. **Reusable** - Can be used in any form
2. **Consistent** - Same UI/UX across all forms
3. **Validated** - Built-in validation and limits
4. **Responsive** - Works on all device sizes
5. **Accessible** - Proper labels and keyboard support 