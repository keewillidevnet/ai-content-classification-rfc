/**
 * Express.js Middleware Integration Example
 * Demonstrates how to integrate AI content classification into Express applications
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { 
  metadataHeaders, 
  parseMetadataHeaders, 
  validateContentIntegrity,
  createFilter,
  generateHeaders 
} = require('../../../lib/formats/http-headers');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// ===========================================
// EXAMPLE 1: Basic Auto-Tagging
// ===========================================

// Apply metadata headers to all responses
app.use(metadataHeaders({
  origin: 'human',
  author: 'Content Team',
  license: 'MIT',
  autoGenerate: true
}));

// ===========================================
// EXAMPLE 2: Selective Tagging with Filters
// ===========================================

// Create custom filter for API routes only
const apiFilter = createFilter({
  routes: [/^\/api\//, /^\/content\//],
  contentTypes: ['application/json', 'text/html'],
  minSize: 100, // Only tag responses > 100 bytes
  custom: (req, res, body) => {
    // Don't tag health checks or static assets
    return !req.path.includes('/health') && 
           !req.path.includes('/static/') &&
           !req.path.includes('/favicon');
  }
});

// Apply selective tagging to API routes
app.use('/api', metadataHeaders({
  origin: 'ai',
  author: 'API Server',
  license: 'MIT',
  filter: apiFilter
}));

// ===========================================
// EXAMPLE 3: Parse Incoming Metadata
// ===========================================

// Parse metadata from incoming requests
app.use(parseMetadataHeaders({
  attachTo: 'contentMetadata' // Attach to req.contentMetadata
}));

// ===========================================
// EXAMPLE 4: Content Integrity Validation
// ===========================================

// Validate content integrity for uploads
app.use('/api/upload', validateContentIntegrity({
  onValidationFail: (req, res) => {
    res.status(400).json({
      error: 'Content integrity validation failed',
      message: 'The uploaded content does not match the provided metadata checksum',
      timestamp: new Date().toISOString()
    });
  },
  skipValidation: (req, res) => {
    // Skip validation for certain routes
    return req.path.includes('/health') || req.method === 'GET';
  }
}));

// ===========================================
// ROUTES: Demonstrate Different Use Cases
// ===========================================

// Basic human-generated content
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the AI Content Classification API',
    documentation: '/api/docs',
    examples: '/api/examples',
    timestamp: new Date().toISOString()
  });
});

// AI-generated content with manual metadata
app.get('/api/ai-content', (req, res) => {
  // Set metadata manually for AI content
  res.setContentOrigin('ai', 'GPT-4 API', {
    license: 'API-Generated',
    toolchain: 'OpenAI GPT-4',
    model_identifier: 'gpt-4-0613'
  });

  res.json({
    content: 'This is an example of AI-generated content response.',
    generatedBy: 'GPT-4',
    confidence: 0.95,
    prompt: 'Generate example API response content',
    timestamp: new Date().toISOString()
  });
});

// Hybrid content example
app.get('/api/hybrid-content', (req, res) => {
  res.setContentOrigin('hybrid', 'Content Team + AI Assistant', {
    license: 'CC-BY-4.0',
    toolchain: 'Human curation + GPT-4',
    model_identifier: 'gpt-4-0613'
  });

  res.json({
    article: {
      title: 'AI in Modern Web Development',
      summary: 'Human-written analysis of AI tools in web development',
      content: 'This article was written by our content team with AI assistance for research and editing.',
      aiAssistance: [
        'Research compilation',
        'Grammar checking',
        'Citation formatting'
      ],
      humanContribution: [
        'Original analysis',
        'Industry insights',
        'Final editing'
      ]
    },
    metadata: {
      humanAuthor: 'Sarah Johnson',
      aiTools: ['GPT-4', 'Grammarly'],
      reviewProcess: 'Human-reviewed and approved'
    }
  });
});

// Content upload with metadata
app.post('/api/upload', (req, res) => {
  const { content, metadata } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  // Generate metadata headers for the uploaded content
  const headers = generateHeaders(content, {
    origin: metadata?.origin || 'human',
    author: metadata?.author || 'Anonymous',
    license: metadata?.license || 'Unknown'
  });

  res.json({
    message: 'Content uploaded successfully',
    contentSize: content.length,
    generatedHeaders: headers,
    uploadedAt: new Date().toISOString(),
    receivedMetadata: req.contentMetadata ? req.contentMetadata.toObject() : null
  });
});

// Metadata inspection endpoint
app.get('/api/inspect', (req, res) => {
  const incomingHeaders = {};
  
  // Extract all X-Content-* headers
  Object.keys(req.headers).forEach(key => {
    if (key.startsWith('x-content-')) {
      incomingHeaders[key] = req.headers[key];
    }
  });

  res.json({
    message: 'Metadata inspection endpoint',
    incomingHeaders: incomingHeaders,
    parsedMetadata: req.contentMetadata ? req.contentMetadata.toObject() : null,
    requestInfo: {
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type')
    },
    examples: {
      curlCommand: `curl -H "X-Content-Origin: human" -H "X-Content-Author: Test User" ${req.protocol}://${req.get('host')}/api/inspect`,
      expectedResponse: 'Headers would be parsed and displayed here'
    }
  });
});

// Batch content processing
app.post('/api/batch', (req, res) => {
  const { files, defaultMetadata } = req.body;
  
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: 'Files array is required' });
  }

  const results = files.map((file, index) => {
    try {
      const metadata = {
        origin: file.metadata?.origin || defaultMetadata?.origin || 'human',
        author: file.metadata?.author || defaultMetadata?.author || 'Batch Processor',
        license: file.metadata?.license || defaultMetadata?.license || 'Unknown'
      };

      const headers = generateHeaders(file.content, metadata);

      return {
        id: index,
        filename: file.filename,
        status: 'processed',
        metadata: metadata,
        headers: headers,
        contentSize: file.content.length
      };
    } catch (error) {
      return {
        id: index,
        filename: file.filename,
        status: 'error',
        error: error.message
      };
    }
  });

  const summary = {
    totalFiles: files.length,
    processed: results.filter(r => r.status === 'processed').length,
    errors: results.filter(r => r.status === 'error').length
  };

  res.json({
    message: 'Batch processing complete',
    summary: summary,
    results: results,
    processedAt: new Date().toISOString()
  });
});

// API documentation
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'AI Content Classification API',
    version: '1.0.0',
    description: 'RFC-compliant API for content classification and metadata management',
    endpoints: {
      'GET /': 'Basic welcome message with human-generated metadata',
      'GET /api/ai-content': 'AI-generated content with proper metadata',
      'GET /api/hybrid-content': 'Hybrid content example',
      'POST /api/upload': 'Upload content with metadata validation',
      'GET /api/inspect': 'Inspect incoming metadata headers',
      'POST /api/batch': 'Batch process multiple files',
      'GET /api/docs': 'This documentation'
    },
    metadata: {
      headers: {
        'X-Content-Origin': 'Content origin: human, ai, or hybrid',
        'X-Content-Author': 'Content author or system identifier',
        'X-Content-Timestamp': 'ISO 8601 creation timestamp',
        'X-Content-Checksum': 'SHA-256 content checksum',
        'X-Content-License': 'Content license (optional)',
        'X-Content-Toolchain': 'Tools used for creation (optional)',
        'X-Content-Model': 'AI model identifier (optional)',
        'X-Content-Metadata': 'Compact metadata format'
      }
    },
    examples: {
      curlRequests: [
        'curl -H "X-Content-Origin: human" -H "X-Content-Author: Test User" http://localhost:3000/api/inspect',
        'curl -X POST -H "Content-Type: application/json" -d \'{"content": "test", "metadata": {"origin": "human"}}\' http://localhost:3000/api/upload'
      ]
    }
  });
});

// Health check (no metadata applied)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Express error:', error);
  
  // Set error metadata
  res.setContentOrigin('human', 'Error Handler', {
    license: 'System-Generated'
  });

  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong with the request',
    requestId: req.headers['x-request-id'] || 'unknown',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `The requested resource ${req.path} was not found`,
    availableEndpoints: [
      '/',
      '/api/ai-content',
      '/api/hybrid-content',
      '/api/upload',
      '/api/inspect',
      '/api/batch',
      '/api/docs',
      '/health'
    ],
    timestamp: new Date().toISOString()
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Express Middleware Demo Server`);
    console.log(`📡 Server running on http://localhost:${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
    console.log(`🔍 Metadata Inspector: http://localhost:${PORT}/api/inspect`);
    console.log(`💚 Health Check: http://localhost:${PORT}/health`);
    console.log('');
    console.log('🧪 Test Commands:');
    console.log(`  curl http://localhost:${PORT}/api/docs`);
    console.log(`  curl -H "X-Content-Origin: human" http://localhost:${PORT}/api/inspect`);
    console.log(`  curl -X POST -H "Content-Type: application/json" -d '{"content": "test"}' http://localhost:${PORT}/api/upload`);
  });
}

module.exports = app;
