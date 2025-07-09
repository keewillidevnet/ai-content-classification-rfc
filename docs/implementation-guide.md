# Implementation Guide

**AI Content Classification and Tagging System**

This guide provides practical instructions for implementing the AI Content Classification and Tagging System as specified in `draft-williams-ai-content-tagging-00.txt`.

## 🎯 Overview

The AI Content Classification and Tagging System provides a standardized way to tag digital content with metadata that specifies whether content was human-generated, AI-generated, or hybrid. This implementation guide covers the core components and integration patterns.

## 📋 Core Metadata Schema

### Required Fields

```json
{
  "version": "1.0",
  "origin": "human|ai|hybrid",
  "author": "Content creator identifier",
  "creation_timestamp": "ISO 8601 timestamp",
  "checksum": "SHA-256 hash of content"
}
```

### Optional Fields

```json
{
  "license": "Content license (e.g., MIT, CC-BY-4.0)",
  "toolchain": "Tools used for content creation",
  "model_identifier": "Specific AI model used (for AI/hybrid content)"
}
```

## 🔧 Implementation Approaches

### 1. Sidecar Files (Recommended)

**Best for:** File-based systems, archives, datasets

**Format:** XML sidecar files with `.meta.xml` extension

**Example:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <version>1.0</version>
  <origin>human</origin>
  <author>Jane Doe</author>
  <creation_timestamp>2025-07-09T12:00:00Z</creation_timestamp>
  <checksum>a1b2c3d4e5f6...</checksum>
  <license>MIT</license>
</metadata>
```

**Implementation:**
```bash
# Tag content with sidecar
tag-content -i document.txt --origin human --author "Jane Doe"
# Creates: document.txt.meta.xml

# Validate content
validate-content -i document.txt --verify
```

### 2. HTTP Headers

**Best for:** Web applications, APIs, real-time content

**Format:** `X-Content-*` headers in HTTP responses

**Example:**
```http
X-Content-Origin: human
X-Content-Author: Jane Doe
X-Content-Timestamp: 2025-07-09T12:00:00Z
X-Content-Checksum: a1b2c3d4e5f6...
X-Content-License: MIT
X-Content-Metadata: version=1.0;origin=human;author=Jane%20Doe;...
```

**Implementation:**
```javascript
const { metadataHeaders } = require('ai-content-tagging-tools');

// Express.js middleware
app.use(metadataHeaders({
  origin: 'human',
  author: 'Web Server',
  license: 'MIT'
}));

// Manual header setting
res.setContentOrigin('ai', 'GPT-4', {
  toolchain: 'OpenAI API',
  model_identifier: 'gpt-4'
});
```

### 3. HTML Meta Tags

**Best for:** Web pages, HTML documents, static sites

**Format:** `<meta>` tags in HTML head section

**Example:**
```html
<head>
  <title>My Article</title>
  <meta name="X-Content-Version" content="1.0">
  <meta name="X-Content-Origin" content="human">
  <meta name="X-Content-Author" content="Jane Doe">
  <meta name="X-Content-Timestamp" content="2025-07-09T12:00:00Z">
  <meta name="X-Content-Checksum" content="a1b2c3d4e5f6...">
  <meta name="X-Content-License" content="MIT">
</head>
```

**Implementation:**
```bash
# Inject meta tags
html-meta-tool inject -i page.html --origin human --author "Jane Doe"

# Extract meta tags
html-meta-tool extract -i page.html --verbose

# Batch process
html-meta-tool batch -d ./website --origin human --author "Web Team"
```

## 🛠️ Language-Specific Implementations

### JavaScript/Node.js

**Installation:**
```bash
npm install ai-content-tagging-tools
```

**Basic Usage:**
```javascript
const { ContentMetadata } = require('ai-content-tagging-tools');

// Generate metadata
const content = "This is sample content";
const metadata = ContentMetadata.generateForContent(content, {
  origin: 'human',
  author: 'Jane Doe',
  license: 'MIT'
});

// Validate metadata
const validation = metadata.validate();
console.log('Valid:', validation.isValid);

// Export formats
console.log('XML:', metadata.toXML());
console.log('HTTP Header:', metadata.toHTTPHeader());
console.log('HTML Meta:', metadata.toHTMLMeta());
```

### Python (Future Implementation)

```python
# Planned implementation
from ai_content_tagging import ContentMetadata

metadata = ContentMetadata.generate_for_content(
    content="This is sample content",
    origin="human",
    author="Jane Doe",
    license="MIT"
)

print("Valid:", metadata.validate())
print("XML:", metadata.to_xml())
```

## 🔍 Validation and Verification

### Content Integrity Verification

```javascript
// Verify content hasn't been modified
const content = fs.readFileSync('document.txt');
const isValid = metadata.verifyIntegrity(content);

if (isValid) {
  console.log('✅ Content integrity verified');
} else {
  console.log('❌ Content has been modified');
}
```

### Schema Validation

```javascript
// Validate metadata schema
const validation = metadata.validate();

if (validation.isValid) {
  console.log('✅ Schema valid');
} else {
  console.log('❌ Schema error:', validation.error);
}
```

## 🚀 Integration Patterns

### ML Pipeline Integration

```javascript
// Filter AI content from training data
const { extractMetadata } = require('ai-content-tagging-tools');

async function filterDataset(files) {
  const humanContent = [];
  
  for (const file of files) {
    const metadata = await extractMetadata(file);
    if (metadata && metadata.origin === 'human') {
      humanContent.push(file);
    }
  }
  
  return humanContent;
}
```

### Web Framework Integration

```javascript
// Express.js automatic tagging
app.use(metadataHeaders({
  origin: 'human',
  author: 'Content Team',
  filter: createFilter({
    routes: [/^\/api\//, /^\/content\//],
    contentTypes: ['application/json', 'text/html']
  })
}));
```

### Batch Processing

```bash
# Process entire directories
find ./dataset -name "*.txt" | while read file; do
  tag-content -i "$file" --origin human --author "Dataset Team"
done

# Validate all tagged files
find ./dataset -name "*.txt" | while read file; do
  validate-content -i "$file" --verify
done
```

## 📊 Performance Considerations

### Optimization Guidelines

1. **Sidecar Files:** Minimal performance impact, scales well
2. **HTTP Headers:** ~1-2KB overhead per response
3. **HTML Meta Tags:** ~500B overhead per page
4. **Checksum Generation:** ~1ms per MB of content

### Caching Strategies

```javascript
// Cache metadata generation
const metadataCache = new Map();

function getCachedMetadata(content) {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  
  if (metadataCache.has(hash)) {
    return metadataCache.get(hash);
  }
  
  const metadata = ContentMetadata.generateForContent(content, options);
  metadataCache.set(hash, metadata);
  return metadata;
}
```

## 🔒 Security Considerations

### Digital Signatures (Planned)

```javascript
// Future implementation
const signedMetadata = metadata.sign(privateKey);
const isValid = signedMetadata.verify(publicKey);
```

### Trust Verification

```javascript
// Verify against known trusted sources
const trustedAuthors = ['jane.doe@company.com', 'trusted-ai-system'];

function isTrustedSource(metadata) {
  return trustedAuthors.includes(metadata.author);
}
```

## 🧪 Testing and Validation

### Unit Tests

```javascript
// Test metadata generation
describe('ContentMetadata', () => {
  it('should generate valid metadata', () => {
    const content = 'test content';
    const metadata = ContentMetadata.generateForContent(content, {
      origin: 'human',
      author: 'Test User'
    });
    
    expect(metadata.validate().isValid).toBe(true);
    expect(metadata.origin).toBe('human');
  });
});
```

### Integration Tests

```bash
# Test CLI tools
npm test

# Test web interface
npm run demo
curl -I http://localhost:3000/

# Test middleware
npm run demo-middleware
curl -H "X-Content-Origin: human" http://localhost:3001/inspect
```

## 📋 Compliance Checklist

### RFC Compliance

- [ ] All required metadata fields present
- [ ] Valid ISO 8601 timestamps
- [ ] Proper SHA-256 checksums
- [ ] Correct origin values (`human`, `ai`, `hybrid`)
- [ ] Valid XML/JSON schema

### Production Readiness

- [ ] Error handling implemented
- [ ] Performance optimized
- [ ] Security considerations addressed
- [ ] Logging and monitoring configured
- [ ] Documentation complete

## 🆘 Troubleshooting

### Common Issues

**Invalid metadata schema:**
```javascript
// Check for missing required fields
const validation = metadata.validate();
if (!validation.isValid) {
  console.error('Validation error:', validation.error);
}
```

**Checksum verification failures:**
```javascript
// Content may have been modified
if (!metadata.verifyIntegrity(content)) {
  console.warn('Content integrity check failed');
}
```

**XML parsing errors:**
```javascript
// Ensure proper XML formatting
try {
  const metadata = await ContentMetadata.parseXML(xmlContent);
} catch (error) {
  console.error('XML parsing failed:', error.message);
}
```

## 📚 Additional Resources

- **RFC Specification:** [`draft-williams-ai-content-tagging-00.txt`](../draft-williams-ai-content-tagging-00.txt)
- **Reference Implementation:** [ai-content-tagging-tools](https://github.com/keewillidevnet/ai-content-tagging-tools)
- **Examples:** [Implementation Examples](examples/)
- **Schemas:** [XML/JSON Schemas](schemas/)

## 🤝 Support

For implementation questions or issues:
- **GitHub Issues:** [ai-content-classification-rfc/issues](https://github.com/keewillidevnet/ai-content-classification-rfc/issues)
- **Email:** keenanwilliams@gmail.com
- **Documentation:** This guide and RFC specification

---

*This implementation guide is maintained alongside the RFC specification and reference implementation.*
