# AI-Investor

## Geocoding Existing Properties (Developer Tool)

If you ever need to ensure all properties in the database have latitude and longitude (for radius-based search), use the provided script:

### What it does
- Finds all properties missing latitude/longitude.
- Geocodes their address using the same logic as the backend.
- Updates the database with the coordinates.

### When to use
- After importing properties in bulk (e.g., CSV import).
- After fixing/correcting address data for existing properties.
- As a one-time fix for legacy data.

### How to run
From the project root, run:

```bash
node server/scripts/geocode_missing_properties.js
```

The script will log which properties were updated or could not be geocoded.

**Note:** New and updated properties are geocoded automatically by the backend; this script is only for fixing existing data.
