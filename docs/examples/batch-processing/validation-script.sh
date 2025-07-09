#!/bin/bash

# Batch Validation Script
# Validates all tagged files in a dataset directory

set -e  # Exit on any error

# Configuration
DATASET_DIR="${1:-./dataset}"
STRICT_MODE="${2:-false}"
OUTPUT_FORMAT="${3:-summary}"
VERBOSE="${4:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_FILES=0
VALID_FILES=0
INVALID_FILES=0
MISSING_METADATA=0

# Function to log messages
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Function to validate a single file
validate_file() {
    local file="$1"
    local filename=$(basename "$file")
    
    ((TOTAL_FILES++))
    
    if [ "$VERBOSE" = "true" ]; then
        info "Validating $file"
    fi
    
    # Check if metadata file exists
    local metadata_file="${file}.meta.xml"
    if [ ! -f "$metadata_file" ]; then
        if [ "$OUTPUT_FORMAT" = "detailed" ]; then
            error "Missing metadata: $file"
        fi
        ((MISSING_METADATA++))
        return 1
    fi
    
    # Validate using the CLI tool
    local validation_output
    if command -v validate-content &> /dev/null; then
        validation_output=$(validate-content -i "$file" --verify 2>&1)
    else
        # Fallback to node command
        validation_output=$(node cli/validate-content.js -i "$file" --verify 2>&1)
    fi
    
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        if [ "$VERBOSE" = "true" ]; then
            log "✅ Valid: $filename"
        fi
        ((VALID_FILES++))
        
        if [ "$OUTPUT_FORMAT" = "detailed" ]; then
            # Extract key info from validation output
            local origin=$(echo "$validation_output" | grep -o "Origin: [A-Z]*" | cut -d' ' -f2)
            local author=$(echo "$validation_output" | grep -o "Author: [^$]*" | cut -d' ' -f2-)
            echo "✅ $filename - Origin: $origin, Author: $author"
        fi
        return 0
    else
        if [ "$OUTPUT_FORMAT" = "detailed" ]; then
            error "Invalid: $filename"
            if [ "$VERBOSE" = "true" ]; then
                echo "$validation_output" | grep -E "(Error|Issues Found)" | head -3
            fi
        fi
        ((INVALID_FILES++))
        return 1
    fi
}

# Function to generate detailed report
generate_report() {
    local report_file="validation-report-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "Dataset Validation Report"
        echo "========================"
        echo "Generated: $(date)"
        echo "Dataset: $DATASET_DIR"
        echo "Strict Mode: $STRICT_MODE"
        echo ""
        echo "Summary:"
        echo "  Total Files: $TOTAL_FILES"
        echo "  Valid Files: $VALID_FILES"
        echo "  Invalid Files: $INVALID_FILES"
        echo "  Missing Metadata: $MISSING_METADATA"
        echo "  Success Rate: $(( VALID_FILES * 100 / TOTAL_FILES ))%"
        echo ""
        
        if [ $INVALID_FILES -gt 0 ]; then
            echo "Invalid Files Details:"
            echo "====================="
            # Re-run validation for invalid files to get details
            local files=$(find "$DATASET_DIR" -type f \( -name "*.txt" -o -name "*.md" -o -name "*.html" \) | grep -v ".meta.xml")
            while IFS= read -r file; do
                if [ -n "$file" ]; then
                    local validation_output
                    if command -v validate-content &> /dev/null; then
                        validation_output=$(validate-content -i "$file" --verify 2>&1)
                    else
                        validation_output=$(node cli/validate-content.js -i "$file" --verify 2>&1)
                    fi
                    
                    if [ $? -ne 0 ]; then
                        echo "File: $file"
                        echo "$validation_output" | grep -E "(Error|Issues Found)" | head -3
                        echo ""
                    fi
                fi
            done <<< "$files"
        fi
    } > "$report_file"
    
    log "Detailed report saved: $report_file"
}

# Function to check ML dataset quality
check_ml_quality() {
    log "Checking ML dataset quality requirements..."
    
    local human_files=$(find "$DATASET_DIR" -name "*.meta.xml" -exec grep -l "<origin>human</origin>" {} \; | wc -l)
    local ai_files=$(find "$DATASET_DIR" -name "*.meta.xml" -exec grep -l "<origin>ai</origin>" {} \; | wc -l)
    local hybrid_files=$(find "$DATASET_DIR" -name "*.meta.xml" -exec grep -l "<origin>hybrid</origin>" {} \; | wc -l)
    
    echo ""
    echo "📊 Dataset Composition:"
    echo "  Human content: $human_files files ($(( human_files * 100 / TOTAL_FILES ))%)"
    echo "  AI content: $ai_files files ($(( ai_files * 100 / TOTAL_FILES ))%)"
    echo "  Hybrid content: $hybrid_files files ($(( hybrid_files * 100 / TOTAL_FILES ))%)"
    
    # ML recommendations
    if [ $ai_files -gt $(( TOTAL_FILES / 2 )) ]; then
        warn "Dataset contains >50% AI content - may affect model quality"
    fi
    
    if [ $human_files -gt $(( TOTAL_FILES * 3 / 4 )) ]; then
        info "Dataset is primarily human content - good for training"
    fi
}

# Main execution
main() {
    log "Starting batch validation process"
    log "Dataset directory: $DATASET_DIR"
    log "Strict mode: $STRICT_MODE"
    log "Output format: $OUTPUT_FORMAT"
    
    # Check if dataset directory exists
    if [ ! -d "$DATASET_DIR" ]; then
        error "Dataset directory does not exist: $DATASET_DIR"
        exit 1
    fi
    
    # Find all content files
    local files=$(find "$DATASET_DIR" -type f \( -name "*.txt" -o -name "*.md" -o -name "*.html" \) | grep -v ".meta.xml")
    local file_count=$(echo "$files" | wc -l)
    
    if [ -z "$files" ]; then
        warn "No files found to validate in $DATASET_DIR"
        exit 0
    fi
    
    log "Found $file_count files to validate"
    
    # Validate each file
    while IFS= read -r file; do
        if [ -n "$file" ]; then
            validate_file "$file"
        fi
    done <<< "$files"
    
    # Generate summary
    echo ""
    log "Validation Summary:"
    echo "  📁 Total Files: $TOTAL_FILES"
    echo "  ✅ Valid Files: $VALID_FILES"
    echo "  ❌ Invalid Files: $INVALID_FILES"
    echo "  ⚠️  Missing Metadata: $MISSING_METADATA"
    echo "  📊 Success Rate: $(( VALID_FILES * 100 / TOTAL_FILES ))%"
    
    # Check ML dataset quality
    check_ml_quality
    
    # Generate detailed report if requested
    if [ "$OUTPUT_FORMAT" = "report" ]; then
        generate_report
    fi
    
    # Exit with appropriate code
    if [ "$STRICT_MODE" = "true" ] && [ $INVALID_FILES -gt 0 ]; then
        error "Validation failed in strict mode"
        exit 1
    else
        log "Validation complete!"
        exit 0
    fi
}

# Usage information
usage() {
    cat << EOF
Usage: $0 [DATASET_DIR] [STRICT_MODE] [OUTPUT_FORMAT] [VERBOSE]

Arguments:
    DATASET_DIR     Directory containing files to validate (default: ./dataset)
    STRICT_MODE     Exit with error if any files are invalid (default: false)
    OUTPUT_FORMAT   Output format: summary, detailed, report (default: summary)
    VERBOSE         Enable verbose output (default: false)

Examples:
    $0                                      # Validate ./dataset with defaults
    $0 ./training-data true                 # Strict mode validation
    $0 ./corpus false detailed true        # Detailed output with verbose logging
    $0 ./dataset false report              # Generate detailed report file

Output formats:
    summary   - Show only final statistics
    detailed  - Show per-file validation results
    report    - Generate detailed report file
EOF
}

# Parse command line arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
    exit 0
fi

# Run main function
main "$@"
