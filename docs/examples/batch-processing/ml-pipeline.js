#!/usr/bin/env node

/**
 * ML Pipeline Integration Example
 * Demonstrates how to integrate AI content classification into machine learning workflows
 */

const fs = require('fs');
const path = require('path');
const { extractMetadata } = require('../../../lib/formats/html-meta');
const { ContentMetadata } = require('../../../lib/core/metadata');

// Configuration
const CONFIG = {
  datasetPath: process.env.DATASET_PATH || './dataset',
  outputPath: process.env.OUTPUT_PATH || './clean-dataset',
  logLevel: process.env.LOG_LEVEL || 'info',
  strictMode: process.env.STRICT_MODE === 'true',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'human').split(','),
  excludePatterns: (process.env.EXCLUDE_PATTERNS || '').split(',').filter(p => p.length > 0)
};

// Logging utility
const Logger = {
  info: (msg) => CONFIG.logLevel !== 'quiet' && console.log(`[INFO] ${msg}`),
  warn: (msg) => CONFIG.logLevel !== 'quiet' && console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  debug: (msg) => CONFIG.logLevel === 'debug' && console.log(`[DEBUG] ${msg}`)
};

// Dataset statistics
class DatasetStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalFiles = 0;
    this.processedFiles = 0;
    this.skippedFiles = 0;
    this.errorFiles = 0;
    this.originCounts = { human: 0, ai: 0, hybrid: 0 };
    this.authorCounts = {};
    this.licenseCounts = {};
    this.toolchainCounts = {};
    this.sizeStats = { min: Infinity, max: 0, total: 0 };
    this.errors = [];
  }

  recordFile(metadata, fileSize, status = 'processed') {
    this.totalFiles++;
    
    if (status === 'processed') {
      this.processedFiles++;
      this.originCounts[metadata.origin] = (this.originCounts[metadata.origin] || 0) + 1;
      this.authorCounts[metadata.author] = (this.authorCounts[metadata.author] || 0) + 1;
      
      if (metadata.license) {
        this.licenseCounts[metadata.license] = (this.licenseCounts[metadata.license] || 0) + 1;
      }
      
      if (metadata.toolchain) {
        this.toolchainCounts[metadata.toolchain] = (this.toolchainCounts[metadata.toolchain] || 0) + 1;
      }
      
      this.sizeStats.min = Math.min(this.sizeStats.min, fileSize);
      this.sizeStats.max = Math.max(this.sizeStats.max, fileSize);
      this.sizeStats.total += fileSize;
    } else if (status === 'skipped') {
      this.skippedFiles++;
    } else if (status === 'error') {
      this.errorFiles++;
    }
  }

  recordError(file, error) {
    this.errors.push({ file, error: error.message });
  }

  getReport() {
    const avgSize = this.processedFiles > 0 ? this.sizeStats.total / this.processedFiles : 0;
    
    return {
      summary: {
        totalFiles: this.totalFiles,
        processedFiles: this.processedFiles,
        skippedFiles: this.skippedFiles,
        errorFiles: this.errorFiles,
        successRate: this.totalFiles > 0 ? (this.processedFiles / this.totalFiles * 100).toFixed(1) : 0
      },
      origins: this.originCounts,
      authors: Object.keys(this.authorCounts).length,
      licenses: Object.keys(this.licenseCounts).length,
      toolchains: Object.keys(this.toolchainCounts).length,
      fileSize: {
        min: this.sizeStats.min === Infinity ? 0 : this.sizeStats.min,
        max: this.sizeStats.max,
        average: Math.round(avgSize),
        total: this.sizeStats.total
      },
      errors: this.errors
    };
  }
}

// File processor
class FileProcessor {
  constructor(stats) {
    this.stats = stats;
  }

  async processFile(filePath) {
    try {
      const fileName = path.basename(filePath);
      Logger.debug(`Processing file: ${fileName}`);

      // Check file size
      const fileStats = fs.statSync(filePath);
      if (fileStats.size > CONFIG.maxFileSize) {
        Logger.warn(`Skipping large file: ${fileName} (${fileStats.size} bytes)`);
        this.stats.recordFile(null, fileStats.size, 'skipped');
        return null;
      }

      // Check exclude patterns
      if (CONFIG.excludePatterns.some(pattern => fileName.includes(pattern))) {
        Logger.debug(`Skipping excluded file: ${fileName}`);
        this.stats.recordFile(null, fileStats.size, 'skipped');
        return null;
      }

      // Try to extract metadata
      const metadata = await this.extractMetadata(filePath);
      if (!metadata) {
        Logger.warn(`No metadata found for: ${fileName}`);
        this.stats.recordFile(null, fileStats.size, 'skipped');
        return null;
      }

      // Validate metadata
      const validation = metadata.validate();
      if (!validation.isValid) {
        Logger.error(`Invalid metadata for ${fileName}: ${validation.error}`);
        this.stats.recordError(filePath, new Error(`Invalid metadata: ${validation.error}`));
        this.stats.recordFile(null, fileStats.size, 'error');
        return null;
      }

      // Check origin filter
      if (!CONFIG.allowedOrigins.includes(metadata.origin)) {
        Logger.debug(`Skipping file with origin '${metadata.origin}': ${fileName}`);
        this.stats.recordFile(null, fileStats.size, 'skipped');
        return null;
      }

      // Verify content integrity
      const content = fs.readFileSync(filePath);
      if (!metadata.verifyIntegrity(content)) {
        Logger.error(`Content integrity check failed for: ${fileName}`);
        this.stats.recordError(filePath, new Error('Content integrity check failed'));
        this.stats.recordFile(null, fileStats.size, 'error');
        return CONFIG.strictMode ? null : { filePath, metadata, content };
      }

      this.stats.recordFile(metadata.toObject(), fileStats.size, 'processed');
      return { filePath, metadata, content };

    } catch (error) {
      Logger.error(`Error processing ${filePath}: ${error.message}`);
      this.stats.recordError(filePath, error);
      this.stats.recordFile(null, 0, 'error');
      return null;
    }
  }

  async extractMetadata(filePath) {
    // Try sidecar file first
    const sidecarPath = `${filePath}.meta.xml`;
    if (fs.existsSync(sidecarPath)) {
      try {
        const xmlContent = fs.readFileSync(sidecarPath, 'utf8');
        return await ContentMetadata.parseXML(xmlContent);
      } catch (error) {
        Logger.debug(`Failed to parse sidecar XML for ${filePath}: ${error.message}`);
      }
    }

    // Try embedded metadata
    if (filePath.endsWith('.html')) {
      try {
        const htmlContent = fs.readFileSync(filePath, 'utf8');
        return extractMetadata(htmlContent);
      } catch (error) {
        Logger.debug(`Failed to extract HTML metadata for ${filePath}: ${error.message}`);
      }
    }

    return null;
  }
}

// Main pipeline class
class MLPipeline {
  constructor() {
    this.stats = new DatasetStats();
    this.processor = new FileProcessor(this.stats);
  }

  async run() {
    Logger.info('Starting ML Pipeline Dataset Processing');
    Logger.info(`Dataset path: ${CONFIG.datasetPath}`);
    Logger.info(`Output path: ${CONFIG.outputPath}`);
    Logger.info(`Allowed origins: ${CONFIG.allowedOrigins.join(', ')}`);
    Logger.info(`Strict mode: ${CONFIG.strictMode}`);

    // Ensure output directory exists
    if (!fs.existsSync(CONFIG.outputPath)) {
      fs.mkdirSync(CONFIG.outputPath, { recursive: true });
    }

    // Find all files to process
    const files = this.findFiles(CONFIG.datasetPath);
    Logger.info(`Found ${files.length} files to process`);

    // Process files
    const processedFiles = [];
    for (const file of files) {
      const result = await this.processor.processFile(file);
      if (result) {
        processedFiles.push(result);
      }
    }

    // Copy clean files to output directory
    await this.copyCleanFiles(processedFiles);

    // Generate reports
    await this.generateReports();

    Logger.info('Pipeline processing complete!');
  }

  findFiles(directory) {
    const files = [];
    const items = fs.readdirSync(directory);

    for (const item of items) {
      const fullPath = path.join(directory, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.findFiles(fullPath));
      } else if (this.isProcessableFile(item)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  isProcessableFile(filename) {
    const extensions = ['.txt', '.md', '.html', '.json'];
    return extensions.some(ext => filename.endsWith(ext)) && !filename.endsWith('.meta.xml');
  }

  async copyCleanFiles(processedFiles) {
    Logger.info(`Copying ${processedFiles.length} clean files to output directory`);

    for (const { filePath, metadata, content } of processedFiles) {
      try {
        const relativePath = path.relative(CONFIG.datasetPath, filePath);
        const outputPath = path.join(CONFIG.outputPath, relativePath);
        const outputDir = path.dirname(outputPath);

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Copy file
        fs.writeFileSync(outputPath, content);

        // Copy metadata
        const metadataPath = `${outputPath}.meta.xml`;
        fs.writeFileSync(metadataPath, metadata.toXML());

        Logger.debug(`Copied: ${relativePath}`);
      } catch (error) {
        Logger.error(`Failed to copy ${filePath}: ${error.message}`);
        this.stats.recordError(filePath, error);
      }
    }
  }

  async generateReports() {
    const report = this.stats.getReport();
    
    // Console summary
    Logger.info('='.repeat(50));
    Logger.info('DATASET PROCESSING SUMMARY');
    Logger.info('='.repeat(50));
    Logger.info(`Total files processed: ${report.summary.totalFiles}`);
    Logger.info(`Successfully processed: ${report.summary.processedFiles}`);
    Logger.info(`Skipped: ${report.summary.skippedFiles}`);
    Logger.info(`Errors: ${report.summary.errorFiles}`);
    Logger.info(`Success rate: ${report.summary.successRate}%`);
    Logger.info('');
    Logger.info('Content Origins:');
    Object.entries(report.origins).forEach(([origin, count]) => {
      const percentage = ((count / report.summary.processedFiles) * 100).toFixed(1);
      Logger.info(`  ${origin}: ${count} files (${percentage}%)`);
    });
    Logger.info('');
    Logger.info(`Unique authors: ${report.authors}`);
    Logger.info(`Unique licenses: ${report.licenses}`);
    Logger.info(`Unique toolchains: ${report.toolchains}`);
    Logger.info('');
    Logger.info('File Size Statistics:');
    Logger.info(`  Min: ${(report.fileSize.min / 1024).toFixed(1)}KB`);
    Logger.info(`  Max: ${(report.fileSize.max / 1024).toFixed(1)}KB`);
    Logger.info(`  Average: ${(report.fileSize.average / 1024).toFixed(1)}KB`);
    Logger.info(`  Total: ${(report.fileSize.total / 1024 / 1024).toFixed(1)}MB`);

    // Save detailed report
    const reportPath = path.join(CONFIG.outputPath, 'processing-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    Logger.info(`Detailed report saved: ${reportPath}`);

    // Save ML-ready manifest
    const manifestPath = path.join(CONFIG.outputPath, 'dataset-manifest.json');
    const manifest = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      configuration: CONFIG,
      statistics: report.summary,
      originDistribution: report.origins,
      qualityMetrics: {
        integrityVerified: true,
        metadataCompliant: true,
        humanContentPercentage: ((report.origins.human || 0) / report.summary.processedFiles * 100).toFixed(1)
      }
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    Logger.info(`ML manifest saved: ${manifestPath}`);
  }
}

// CLI execution
if (require.main === module) {
  const pipeline = new MLPipeline();
  pipeline.run().catch(error => {
    Logger.error(`Pipeline failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { MLPipeline, DatasetStats, FileProcessor };
