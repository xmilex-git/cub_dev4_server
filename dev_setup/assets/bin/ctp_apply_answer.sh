#!/bin/bash

# Usage: ./ctp_apply_answer.sh <NEW_ANSWER_DIR>
# This script recursively searches for *.answer files in NEW_ANSWER_DIR/sql
# and replaces the corresponding files in ~/cubrid-testcases/sql

if [ -z "$1" ]; then
    echo "Usage: $0 <NEW_ANSWER_DIR>"
    exit 1
fi

NEW_ANSWER_DIR=$1
TARGET_DIR=~/cubrid-testcases/sql

# Check if source directory exists
if [ ! -d "$NEW_ANSWER_DIR/sql" ]; then
    echo "Error: $NEW_ANSWER_DIR/sql does not exist"
    exit 1
fi

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: $TARGET_DIR does not exist"
    exit 1
fi

echo "Searching for *.result files in $NEW_ANSWER_DIR/sql..."
echo "Target directory: $TARGET_DIR"
echo ""

# Counter for replaced files
count=0

# Find all .result files recursively and process them
find "$NEW_ANSWER_DIR/sql" -type f -name "*.result" | while read -r answer_file; do
    # Get relative path from NEW_ANSWER_DIR/sql
    relative_path="${answer_file#$NEW_ANSWER_DIR/sql/}"
    
    # Extract directory and filename
    dir_path=$(dirname "$relative_path")
    file_name=$(basename "$relative_path")
    
    # Change extension from .result to .answer
    answer_file_name="${file_name%.result}.answer"
    
    # Construct target path with 'answers' subdirectory
    # e.g., _13_issues/20_2h/23665.result -> _13_issues/20_2h/answers/23665.answer
    target_relative_path="$dir_path/answers/$answer_file_name"
    target_file="$TARGET_DIR/$target_relative_path"
    
    # Check if target file exists and remove it
    if [ -f "$target_file" ]; then
        echo "Removing: $target_file"
        rm -f "$target_file"
    fi
    
    # Create target directory if it doesn't exist
    target_dir=$(dirname "$target_file")
    mkdir -p "$target_dir"
    
    # Copy the new answer file
    echo "Copying: $answer_file -> $target_file"
    cp "$answer_file" "$target_file"
    
    # Set file permission to 644
    chmod 644 "$target_file"
    
    ((count++))
    echo ""
done

echo "Done! Total files replaced: $count"
