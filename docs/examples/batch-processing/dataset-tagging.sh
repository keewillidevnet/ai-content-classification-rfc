#!/bin/bash

# Dataset Tagging Script
# Tags all files in a dataset directory with appropriate metadata

set -e  # Exit on any error

# Configuration
DATASET_DIR="${1:-./dataset}"
AUTHOR="${2:-Dataset Team}"
LICENSE="${3:-CC-BY-4.0}"
VERBOSE="${4:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Function to determine content origin
determine_origin() {
    local file="$1"
    local filename=$(basename "$file")
    
    # Check for AI indicators in filename
    if [[ "$filename" == *"ai-generated"* ]] || [[ "$filename" == *"gpt"* ]] || [[ "$filename" == *"chatgpt"* ]]; then
        echo "ai"
    elif [[ "$filename" == *"hybrid"* ]] || [[ "$filename" == *"assisted"* ]]; then
        echo "hybrid"
    else
        echo "human"
    fi
}

# Function to tag a single file
tag_file() {
    local file="$1"
    local origin=$(determine_origin "$file")
    
    if [ "$VERBOSE" = "true" ]; then
        log "Tagging $file (origin: $origin)"
    fi
    
    # Tag the file using the CLI tool
    if command -v tag-content &> /dev/null; then
        tag-content -i "$file" --origin "$origin" --author "$AUTHOR" --license "$LICENSE" 2>/dev/null
    else
        # Fallback to node command
        node cli/tag-content.js -i "$file" --origin "$origin" --author "$AUTHOR" --license "$LICENSE" 2>/dev/null
    fi
    
    if [ $? -eq 0 ]; then
        if [ "$VERBOSE" = "true" ]; then
            log "Successfully tagged $file"
        fi
        return 0
    else
        error "Failed to tag $file"
        return 1
    fi
}

# Main execution
main() {
    log "Starting dataset tagging process"
    log "Dataset directory: $DATASET_DIR"
    log "Author: $AUTHOR"
    log "License: $LICENSE"
    
    # Check if dataset directory exists
    if [ ! -d "$DATASET_DIR" ]; then
        error "Dataset directory does not exist: $DATASET_DIR"
        exit 1
    fi
    
    # Find all text files in the dataset
    local files=$(find "$DATASET_DIR" -type f \( -name "*.txt" -o -name "*.md" -o -name "*.html" \) | grep -v ".meta.xml")
    local file_count=$(echo "$files" | wc -l)
    
    if [ -z "$files" ]; then
        warn "No files found to tag in $DATASET_DIR"
        exit 0
    fi
    
    log "Found $file_count files to tag"
    
    # Tag each file
    local success_count=0
    local error_count=0
    
    while IFS= read -r file; do
        if [ -n "$file" ]; then
            if tag_file "$file"; then
                ((success_count++))
            else
                ((error_count++))
            fi
        fi
    done <<< "$files"
    
    # Summary
    log "Tagging complete!"
    log "Successfully tagged: $success_count files"
    
    if [ $error_count -gt 0 ]; then
        warn "Failed to tag: $error_count files"
        exit 1
    else
        log "All files tagged successfully!"
    fi
}

# Usage information
usage() {
    cat << EOF
Usage: $0 [DATASET_DIR] [AUTHOR] [LICENSE] [VERBOSE]

Arguments:
    DATASET_DIR    Directory containing files to tag (default: ./dataset)
    AUTHOR         Content author attribution (default: Dataset Team)
    LICENSE        Content license (default: CC-BY-4.0)
    VERBOSE        Enable verbose output (default: false)

Examples:
    $0                                          # Tag ./dataset with defaults
    $0 ./training-data "ML Team"                # Tag custom directory
    $0 ./corpus "Research Team" "MIT" true     # Full configuration with verbose output

File naming conventions for automatic origin detection:
    *ai-generated*  -> origin: ai
    *gpt*          -> origin: ai
    *chatgpt*      -> origin: ai
    *hybrid*       -> origin: hybrid
    *assisted*     -> origin: hybrid
    (all others)   -> origin: human
EOF
}

# Parse command line arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
    exit 0
fi

# Run main function
main "$@"
