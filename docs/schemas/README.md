# AI Content Classification RFC - Schemas

This directory contains schema definitions for validating AI content classification metadata according to RFC standards.

## Schema Files

### XML Schema (XSD)
- **File**: `content-metadata.xsd`
- **Purpose**: Validates XML sidecar files (`.meta.xml`)
- **Format**: W3C XML Schema Definition
- **Namespace**: `http://example.com/ai-content-classification`

### JSON Schema
- **File**: `content-metadata.schema.json`
- **Purpose**: Validates JSON metadata objects
- **Format**: JSON Schema Draft 2020-12
- **Schema ID**: `https://example.com/ai-content-classification/content-metadata.schema.json`

## Required Fields

Both schemas enforce the same set of required fields as defined in the RFC:

- **origin**: Content classification (`human`, `ai`, or `hybrid`)
- **author**: Content author or creator identification
- **timestamp**: Creation timestamp in ISO 8601 format (UTC)
- **content_hash**: SHA-256 hash for integrity verification
- **hash_algorithm**: Hash algorithm used (currently only `sha256`)
- **rfc_version**: RFC specification version (e.g., `draft-williams-ai-content-tagging-00`)

## Optional Fields

Additional metadata fields supported by both schemas:

- **creation_tool**: Tool or system used to create content
- **license**: License or usage terms
- **description**: Human-readable description
- **keywords**: Comma-separated tags
- **content_length**: Content size in bytes/characters
- **content_type**: MIME type
- **language**: ISO 639-1 language code
- **parent_hash**: Hash of source content (for derived works)
- **derivation_method**: How content was derived from source
- **confidence_score**: Classification confidence (0.0-1.0)
- **review_status**: Human review status
- **custom_metadata**: Extension point for custom fields

## Validation Examples

### XML Validation

Using `xmllint` with the XSD schema:

```bash
# Validate a sidecar file
xmllint --schema content-metadata.xsd example.txt.meta.xml --noout

# Example output for valid file:
# example.txt.meta.xml validates

# Example output for invalid file:
# example.txt.meta.xml:5: element origin: Schemas validity error : 
# Element 'origin': [facet 'enumeration'] The value 'robot' is not an element of the set {'human', 'ai', 'hybrid'}.
```

### JSON Validation

Using Node.js with Ajv validator:

```javascript
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');

// Load schema
const schema = JSON.parse(fs.readFileSync('content-metadata.schema.json'));

// Create validator
const ajv = new Ajv();
addFormats(ajv);
const validate = ajv.compile(schema);

// Validate metadata object
const metadata = {
  "origin": "human",
  "author": "Dr. Jane Smith",
  "timestamp": "2025-07-09T15:30:00Z",
  "content_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "hash_algorithm": "sha256",
  "rfc_version": "draft-williams-ai-content-tagging-00"
};

const valid = validate(metadata);
if (!valid) {
  console.log('Validation errors:', validate.errors);
} else {
  console.log('Metadata is valid!');
}
```

Using Python with jsonschema:

```python
import json
import jsonschema

# Load schema
with open('content-metadata.schema.json', 'r') as f:
    schema = json.load(f)

# Load metadata to validate
metadata = {
    "origin": "ai",
    "author": "GPT-4",
    "timestamp": "2025-07-09T14:22:33Z",
    "content_hash": "a1b2c3d4e5f67890123456789012345678901234567890abcdef1234567890ab",
    "hash_algorithm": "sha256",
    "rfc_version": "draft-williams-ai-content-tagging-00"
}

try:
    jsonschema.validate(metadata, schema)
    print("Metadata is valid!")
except jsonschema.ValidationError as e:
    print(f"Validation error: {e.message}")
```

## Common Validation Errors

### Invalid Origin Value
```
Error: Value 'robot' is not valid for origin field
Valid values: 'human', 'ai', 'hybrid'
```

### Invalid Hash Format
```
Error: content_hash must be exactly 64 hexadecimal characters
Example valid hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

### Invalid Timestamp Format
```
Error: timestamp must be in ISO 8601 format with UTC timezone
Valid format: 2025-07-09T15:30:00Z
Invalid examples: 2025-07-09 15:30:00, 2025/07/09T15:30:00Z
```

### Missing Required Fields
```
Error: Missing required field 'author'
All required fields: origin, author, timestamp, content_hash, hash_algorithm, rfc_version
```

## Integration Guidelines

### For XML Implementations
1. Include the XSD schema in your validation pipeline
2. Reference the namespace: `http://example.com/ai-content-classification`
3. Set schema version attribute to `1.0`
4. Use proper XML encoding (UTF-8)

### For JSON Implementations  
1. Reference the schema ID in your JSON metadata
2. Use the `$schema` field to indicate compliance
3. Validate before storing or transmitting metadata
4. Handle validation errors gracefully

## Schema Evolution

When the RFC specification evolves:

1. **Backward Compatibility**: New versions should be backward compatible when possible
2. **Version Tracking**: Update the `rfc_version` field for new specifications
3. **Migration**: Provide migration tools for existing metadata
4. **Documentation**: Update examples and validation tools

## Tools and Libraries

### XML Validation Tools
- **xmllint**: Command-line XML validator (libxml2)
- **Saxon**: XSLT and XQuery processor with validation
- **Apache Xerces**: Java XML processing library

### JSON Validation Libraries
- **JavaScript**: Ajv, joi, tv4
- **Python**: jsonschema, cerberus
- **Java**: everit-org/json-schema, networknt/json-schema-validator
- **Go**: gojsonschema, qri-io/jsonschema
- **Rust**: jsonschema, valico

## Contributing

To contribute to schema development:

1. Ensure backward compatibility with existing implementations
2. Add comprehensive validation rules for new fields
3. Include examples for all new features
4. Update documentation and validation examples
5. Test schemas with multiple validation tools

## License

These schemas are provided under the MIT License as part of the AI Content Classification RFC.
