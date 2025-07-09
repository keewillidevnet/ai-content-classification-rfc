#!/usr/bin/env node

/**
 * AI Content Classification RFC - ML Pipeline Integration
 * =====================================================
 * 
 * This script demonstrates how to integrate AI content classification
 * into machine learning pipelines. It provides utilities for dataset
 * preparation, model training data filtering, and automated classification.
 *
 * Features:
 * - Dataset filtering based on content origin
 * - Automated data quality checks
 * - Model training data preparation
 * - Batch processing for large datasets
 * - Integration with popular ML frameworks
 * - Metrics and reporting for pipeline monitoring
 * 
 * Requirements:
 * - Node.js 14+
 * - npm packages: fs, path, crypto, xml2js, csv-parser, commander
 * 
 * Usage:
 *   node ml-pipeline.js [command] [options]
 *
 * Author: AI Content Classification RFC Working Group
 * License: MIT
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { program } = require('commander');
const xml2js = require('xml2js');
const csv = require('csv-parser');
const { Transform } = require('stream');

// Configuration
const CONFIG = {
  RFC_VERSION: 'draft-williams-ai-content-tagging-00',
  SUPPORTED_ORIGINS: ['human', 'ai', 'hybrid'],
  BATCH_SIZE: 1000,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  QUALITY_THRESHOLDS: {
    min_content_length: 50,
    max_content_length: 1000000,
    min_human_ratio: 0.3,
    max_ai_ratio: 0.7
  }
};

// Utility functions
const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  debug: (msg) => {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`);
    }
  }
};

/**
 * Content Classification Pipeline
 */
class ContentClassificationPipeline {
  constructor(options = {}) {
    this.options = {
      ...CONFIG,
      ...options
    };
    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      validFiles: 0,
      invalidFiles: 0,
      humanFiles: 0,
      aiFiles: 0,
      hybridFiles: 0,
      errors: []
    };
  }

  /**
   * Parse XML sidecar file to extract metadata
   */
  async parseSidecarFile(sidecarPath) {
    try {
      const xmlContent = await fs.readFile(sidecarPath, 'utf8');
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlContent);
      
      const metadata = result.content_metadata || {};
      
      // Validate required fields
      const requiredFields = ['origin', 'author', 'timestamp', 'content_hash', 'rfc_version'];
      for (const field of requiredFields) {
        if (!metadata[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
      
      return metadata;
    } catch (error) {
      throw new Error(`Failed to parse sidecar file ${sidecarPath}: ${error.message}`);
    }
  }

  /**
   * Verify content integrity using SHA-256 hash
   */
  async verifyContentIntegrity(contentPath, expectedHash) {
    try {
      const content = await fs.readFile(contentPath, 'utf8');
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');
      return actualHash === expectedHash;
    } catch (error) {
      logger.error(`Failed to verify integrity for ${contentPath}: ${error.message}`);
      return false;
    }
  }

  /**
   * Load and validate a single content file with its metadata
   */
  async loadContentFile(contentPath) {
    const sidecarPath = `${contentPath}.meta.xml`;
    
    try {
      // Check if sidecar file exists
      await fs.access(sidecarPath);
      
      // Parse metadata
      const metadata = await this.parseSidecarFile(sidecarPath);
      
      // Verify integrity
      const isValid = await this.verifyContentIntegrity(contentPath, metadata.content_hash);
      if (!isValid) {
        throw new Error('Content integrity verification failed');
      }
      
      // Load content
      const content = await fs.readFile(contentPath, 'utf8');
      
      return {
        path: contentPath,
        content,
        metadata,
        size: content.length,
        valid: true
      };
    } catch (error) {
      logger.debug(`Failed to load ${contentPath}: ${error.message}`);
      return {
        path: contentPath,
        content: null,
        metadata: null,
        size: 0,
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Filter dataset based on content origin
   */
  async filterDataset(inputDir, outputDir, filterOptions = {}) {
    const {
      origins = ['human'],
      minContentLength = this.options.QUALITY_THRESHOLDS.min_content_length,
      maxContentLength = this.options.QUALITY_THRESHOLDS.max_content_length,
      requireIntegrity = true
    } = filterOptions;

    logger.info(`Filtering dataset from ${inputDir} to ${outputDir}`);
    logger.info(`Filter criteria: origins=${origins.join(',')}, minLength=${minContentLength}, maxLength=${maxContentLength}`);

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Find all content files
    const contentFiles = await this.findContentFiles(inputDir);
    this.stats.totalFiles = contentFiles.length;

    logger.info(`Found ${contentFiles.length} content files`);

    const filteredFiles = [];
    const batchSize = this.options.BATCH_SIZE;

    for (let i = 0; i < contentFiles.length; i += batchSize) {
      const batch = contentFiles.slice(i, i + batchSize);
      
      logger.info(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(contentFiles.length / batchSize)}`);
      
      const batchPromises = batch.map(async (filePath) => {
        const fileData = await this.loadContentFile(filePath);
        this.stats.processedFiles++;
        
        if (!fileData.valid) {
          this.stats.invalidFiles++;
          this.stats.errors.push(`${filePath}: ${fileData.error}`);
          return null;
        }

        // Apply filters
        const { metadata, content, size } = fileData;
        
        // Check origin filter
        if (!origins.includes(metadata.origin)) {
          return null;
        }
        
        // Check content length
        if (size < minContentLength || size > maxContentLength) {
          return null;
        }
        
        // Update statistics
        this.stats.validFiles++;
        switch (metadata.origin) {
          case 'human':
            this.stats.humanFiles++;
            break;
          case 'ai':
            this.stats.aiFiles++;
            break;
          case 'hybrid':
            this.stats.hybridFiles++;
            break;
        }
        
        return fileData;
      });

      const batchResults = await Promise.all(batchPromises);
      const validResults = batchResults.filter(result => result !== null);
      
      // Copy filtered files to output directory
      for (const result of validResults) {
        const relativePath = path.relative(inputDir, result.path);
        const outputPath = path.join(outputDir, relativePath);
        const outputSidecarPath = `${outputPath}.meta.xml`;
        
        // Ensure output subdirectory exists
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        
        // Copy content file
        await fs.copyFile(result.path, outputPath);
        
        // Copy sidecar file
        await fs.copyFile(`${result.path}.meta.xml`, outputSidecarPath);
        
        filteredFiles.push({
          originalPath: result.path,
          outputPath: outputPath,
          metadata: result.metadata,
          size: result.size
        });
      }
    }

    logger.info(`Filtering completed: ${filteredFiles.length} files passed filters`);
    return filteredFiles;
  }

  /**
   * Generate training dataset splits
   */
  async generateTrainingSplits(filteredFiles, splitRatios = { train: 0.8, validation: 0.1, test: 0.1 }) {
    logger.info('Generating training dataset splits');
    
    // Shuffle files
    const shuffled = [...filteredFiles].sort(() => Math.random() - 0.5);
    
    const totalFiles = shuffled.length;
    const trainSize = Math.floor(totalFiles * splitRatios.train);
    const validationSize = Math.floor(totalFiles * splitRatios.validation);
    
    const splits = {
      train: shuffled.slice(0, trainSize),
      validation: shuffled.slice(trainSize, trainSize + validationSize),
      test: shuffled.slice(trainSize + validationSize)
    };
    
    logger.info(`Dataset splits: train=${splits.train.length}, validation=${splits.validation.length}, test=${splits.test.length}`);
    
    return splits;
  }

  /**
   * Export dataset to various ML framework formats
   */
  async exportToFormat(dataset, outputPath, format = 'csv') {
    logger.info(`Exporting dataset to ${format} format: ${outputPath}`);
    
    switch (format.toLowerCase()) {
      case 'csv':
        await this.exportToCSV(dataset, outputPath);
        break;
      case 'json':
        await this.exportToJSON(dataset, outputPath);
        break;
      case 'jsonl':
        await this.exportToJSONL(dataset, outputPath);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Export to CSV format
   */
  async exportToCSV(dataset, outputPath) {
    const csvHeader = 'path,content,origin,author,timestamp,content_hash,size\n';
    let csvContent = csvHeader;
    
    for (const item of dataset) {
      const content = await fs.readFile(item.outputPath, 'utf8');
      const escapedContent = content.replace(/"/g, '""'); // Escape quotes
      
      csvContent += `"${item.outputPath}","${escapedContent}","${item.metadata.origin}","${item.metadata.author}","${item.metadata.timestamp}","${item.metadata.content_hash}",${item.size}\n`;
    }
    
    await fs.writeFile(outputPath, csvContent);
  }

  /**
   * Export to JSON format
   */
  async exportToJSON(dataset, outputPath) {
    const jsonData = [];
    
    for (const item of dataset) {
      const content = await fs.readFile(item.outputPath, 'utf8');
      
      jsonData.push({
        path: item.outputPath,
        content: content,
        metadata: item.metadata,
        size: item.size
      });
    }
    
    await fs.writeFile(outputPath, JSON.stringify(jsonData, null, 2));
  }

  /**
   * Export to JSONL format
   */
  async exportToJSONL(dataset, outputPath) {
    let jsonlContent = '';
    
    for (const item of dataset) {
      const content = await fs.readFile(item.outputPath, 'utf8');
      
      const jsonLine = JSON.stringify({
        path: item.outputPath,
        content: content,
        metadata: item.metadata,
        size: item.size
      });
      
      jsonlContent += jsonLine + '\n';
    }
    
    await fs.writeFile(outputPath, jsonlContent);
  }

  /**
   * Generate dataset quality report
   */
  generateQualityReport() {
    const report = {
      summary: {
        totalFiles: this.stats.totalFiles,
        processedFiles: this.stats.processedFiles,
        validFiles: this.stats.validFiles,
        invalidFiles: this.stats.invalidFiles,
        successRate: this.stats.totalFiles > 0 ? (this.stats.validFiles / this.stats.totalFiles) * 100 : 0
      },
      distribution: {
        humanFiles: this.stats.humanFiles,
        aiFiles: this.stats.aiFiles,
        hybridFiles: this.stats.hybridFiles
      },
      ratios: {
        humanRatio: this.stats.validFiles > 0 ? this.stats.humanFiles / this.stats.validFiles : 0,
        aiRatio: this.stats.validFiles > 0 ? this.stats.aiFiles / this.stats.validFiles : 0,
        hybridRatio: this.stats.validFiles > 0 ? this.stats.hybridFiles / this.stats.validFiles : 0
      },
      qualityChecks: {
        minHumanRatio: this.stats.validFiles > 0 ? this.stats.humanFiles / this.stats.validFiles >= this.options.QUALITY_THRESHOLDS.min_human_ratio : false,
        maxAiRatio: this.stats.validFiles > 0 ? this.stats.aiFiles / this.stats.validFiles <= this.options.QUALITY_THRESHOLDS.max_ai_ratio : true
      },
      errors: this.stats.errors
    };
    
    return report;
  }

  /**
   * Find all content files in a directory
   */
  async findContentFiles(dir) {
    const files = [];
    
    async function walk(currentPath) {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && !entry.name.endsWith('.meta.xml')) {
          files.push(fullPath);
        }
      }
    }
    
    await walk(dir);
    return files;
  }
}

/**
 * Command-line interface
 */

// Filter command
program
  .command('filter')
  .description('Filter dataset based on content origin and quality criteria')
  .requiredOption('-i, --input <dir>', 'Input dataset directory')
  .requiredOption('-o, --output <dir>', 'Output directory for filtered dataset')
  .option('-r, --origins <origins>', 'Comma-separated list of origins to include', 'human')
  .option('--min-length <number>', 'Minimum content length', parseInt, CONFIG.QUALITY_THRESHOLDS.min_content_length)
  .option('--max-length <number>', 'Maximum content length', parseInt, CONFIG.QUALITY_THRESHOLDS.max_content_length)
  .option('--batch-size <number>', 'Batch processing size', parseInt, CONFIG.BATCH_SIZE)
  .action(async (options) => {
    try {
      const pipeline = new ContentClassificationPipeline({ BATCH_SIZE: options.batchSize });
      const origins = options.origins.split(',').map(o => o.trim());
      
      const filteredFiles = await pipeline.filterDataset(options.input, options.output, {
        origins,
        minContentLength: options.minLength,
        maxContentLength: options.maxLength
      });
      
      logger.info(`Filter completed: ${filteredFiles.length} files passed filters`);
      
      // Generate quality report
      const report = pipeline.generateQualityReport();
      console.log('\n=== Quality Report ===');
      console.log(JSON.stringify(report, null, 2));
      
    } catch (error) {
      logger.error(`Filter operation failed: ${error.message}`);
      process.exit(1);
    }
  });

// Split command
program
  .command('split')
  .description('Generate training dataset splits')
  .requiredOption('-i, --input <dir>', 'Input filtered dataset directory')
  .requiredOption('-o, --output <dir>', 'Output directory for splits')
  .option('--train-ratio <number>', 'Training set ratio', parseFloat, 0.8)
  .option('--validation-ratio <number>', 'Validation set ratio', parseFloat, 0.1)
  .option('--test-ratio <number>', 'Test set ratio', parseFloat, 0.1)
  .action(async (options) => {
    try {
      const pipeline = new ContentClassificationPipeline();
      
      // Load filtered files
      const contentFiles = await pipeline.findContentFiles(options.input);
      const filteredFiles = [];
      
      for (const filePath of contentFiles) {
        const fileData = await pipeline.loadContentFile(filePath);
        if (fileData.valid) {
          filteredFiles.push({
            originalPath: filePath,
            outputPath: filePath,
            metadata: fileData.metadata,
            size: fileData.size
          });
        }
      }
      
      // Generate splits
      const splits = await pipeline.generateTrainingSplits(filteredFiles, {
        train: options.trainRatio,
        validation: options.validationRatio,
        test: options.testRatio
      });
      
      // Create output directories and copy files
      for (const [splitName, splitFiles] of Object.entries(splits)) {
        const splitDir = path.join(options.output, splitName);
        await fs.mkdir(splitDir, { recursive: true });
        
        for (const fileInfo of splitFiles) {
          const fileName = path.basename(fileInfo.outputPath);
          const outputPath = path.join(splitDir, fileName);
          const outputSidecarPath = `${outputPath}.meta.xml`;
          
          await fs.copyFile(fileInfo.outputPath, outputPath);
          await fs.copyFile(`${fileInfo.outputPath}.meta.xml`, outputSidecarPath);
        }
        
        logger.info(`Created ${splitName} split with ${splitFiles.length} files`);
      }
      
    } catch (error) {
      logger.error(`Split operation failed: ${error.message}`);
      process.exit(1);
    }
  });

// Export command
program
  .command('export')
  .description('Export dataset to ML framework format')
  .requiredOption('-i, --input <dir>', 'Input dataset directory')
  .requiredOption('-o, --output <file>', 'Output file path')
  .option('-f, --format <format>', 'Export format (csv, json, jsonl)', 'csv')
  .action(async (options) => {
    try {
      const pipeline = new ContentClassificationPipeline();
      
      // Load dataset
      const contentFiles = await pipeline.findContentFiles(options.input);
      const dataset = [];
      
      for (const filePath of contentFiles) {
        const fileData = await pipeline.loadContentFile(filePath);
        if (fileData.valid) {
          dataset.push({
            originalPath: filePath,
            outputPath: filePath,
            metadata: fileData.metadata,
            size: fileData.size
          });
        }
      }
      
      // Export to specified format
      await pipeline.exportToFormat(dataset, options.output, options.format);
      
      logger.info(`Export completed: ${dataset.length} files exported to ${options.output}`);
      
    } catch (error) {
      logger.error(`Export operation failed: ${error.message}`);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate dataset quality and integrity')
  .requiredOption('-i, --input <dir>', 'Input dataset directory')
  .option('-r, --report <file>', 'Save quality report to file')
  .action(async (options) => {
    try {
      const pipeline = new ContentClassificationPipeline();
      
      // Load and validate all files
      const contentFiles = await pipeline.findContentFiles(options.input);
      
      for (const filePath of contentFiles) {
        const fileData = await pipeline.loadContentFile(filePath);
        pipeline.stats.processedFiles++;
        
        if (fileData.valid) {
          pipeline.stats.validFiles++;
          switch (fileData.metadata.origin) {
            case 'human':
              pipeline.stats.humanFiles++;
              break;
            case 'ai':
              pipeline.stats.aiFiles++;
              break;
            case 'hybrid':
              pipeline.stats.hybridFiles++;
              break;
          }
        } else {
          pipeline.stats.invalidFiles++;
          pipeline.stats.errors.push(`${filePath}: ${fileData.error}`);
        }
      }
      
      pipeline.stats.totalFiles = contentFiles.length;
      
      // Generate quality report
      const report = pipeline.generateQualityReport();
      
      console.log('\n=== Dataset Validation Report ===');
      console.log(JSON.stringify(report, null, 2));
      
      // Save report if requested
      if (options.report) {
        await fs.writeFile(options.report, JSON.stringify(report, null, 2));
        logger.info(`Quality report saved to ${options.report}`);
      }
      
      // Exit with error code if validation failed
      if (report.summary.invalidFiles > 0) {
        process.exit(1);
      }
      
    } catch (error) {
      logger.error(`Validation operation failed: ${error.message}`);
      process.exit(1);
    }
  });

// Stats command
program
  .command('stats')
  .description('Generate dataset statistics')
  .requiredOption('-i, --input <dir>', 'Input dataset directory')
  .action(async (options) => {
    try {
      const pipeline = new ContentClassificationPipeline();
      
      // Load all files and generate statistics
      const contentFiles = await pipeline.findContentFiles(options.input);
      const stats = {
        totalFiles: contentFiles.length,
        validFiles: 0,
        invalidFiles: 0,
        origins: { human: 0, ai: 0, hybrid: 0 },
        contentLengths: [],
        authors: {},
        creationTools: {},
        avgContentLength: 0,
        medianContentLength: 0
      };
      
      for (const filePath of contentFiles) {
        const fileData = await pipeline.loadContentFile(filePath);
        
        if (fileData.valid) {
          stats.validFiles++;
          stats.origins[fileData.metadata.origin]++;
          stats.contentLengths.push(fileData.size);
          
          // Track authors
          const author = fileData.metadata.author || 'unknown';
          stats.authors[author] = (stats.authors[author] || 0) + 1;
          
          // Track creation tools
          if (fileData.metadata.creation_tool) {
            const tool = fileData.metadata.creation_tool;
            stats.creationTools[tool] = (stats.creationTools[tool] || 0) + 1;
          }
        } else {
          stats.invalidFiles++;
        }
      }
      
      // Calculate content length statistics
      if (stats.contentLengths.length > 0) {
        stats.avgContentLength = stats.contentLengths.reduce((a, b) => a + b, 0) / stats.contentLengths.length;
        const sorted = stats.contentLengths.sort((a, b) => a - b);
        stats.medianContentLength = sorted[Math.floor(sorted.length / 2)];
      }
      
      console.log('\n=== Dataset Statistics ===');
      console.log(JSON.stringify(stats, null, 2));
      
    } catch (error) {
      logger.error(`Stats operation failed: ${error.message}`);
      process.exit(1);
    }
  });

// Configure program
program
  .name('ml-pipeline')
  .description('AI Content Classification ML Pipeline Tools')
  .version('1.0.0');

// Parse arguments
program.parse();

// Example usage in code
if (require.main === module) {
  // This section runs when the script is executed directly
  // but not when it's required as a module
  
  // Example: Create a pipeline instance and use it programmatically
  const exampleUsage = async () => {
    const pipeline = new ContentClassificationPipeline();
    
    // Example: Filter dataset to only include human-authored content
    // const filteredFiles = await pipeline.filterDataset(
    //   './input-dataset',
    //   './filtered-dataset',
    //   { origins: ['human'], minContentLength: 100 }
    // );
    
    // Example: Generate training splits
    // const splits = await pipeline.generateTrainingSplits(filteredFiles);
    
    // Example: Export to CSV format
    // await pipeline.exportToFormat(filteredFiles, './dataset.csv', 'csv');
    
    // Example: Generate quality report
    // const report = pipeline.generateQualityReport();
    // console.log('Quality Report:', JSON.stringify(report, null, 2));
  };
  
  // Uncomment to run example
  // exampleUsage().catch(console.error);
}

module.exports = { ContentClassificationPipeline };
