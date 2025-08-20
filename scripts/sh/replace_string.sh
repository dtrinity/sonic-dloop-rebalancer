#!/bin/bash

# Script to replace string in files (used for Docker build path replacement)

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <old_string> <new_string> <file>"
    exit 1
fi

OLD_STRING="$1"
NEW_STRING="$2"
FILE="$3"

if [ -f "$FILE" ]; then
    sed -i "s|$OLD_STRING|$NEW_STRING|g" "$FILE"
    echo "Replaced '$OLD_STRING' with '$NEW_STRING' in $FILE"
else
    echo "File $FILE does not exist"
fi
