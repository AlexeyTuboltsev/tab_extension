#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLAUDEZILLA_DIR="${CLAUDEZILLA_DIR:-/home/lexey/claudezilla}"

# Create temp build context that includes both repos
BUILD_CTX=$(mktemp -d)
trap "rm -rf $BUILD_CTX" EXIT

# Copy extension repo (excluding .git and node_modules)
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.claude' "$REPO_DIR/" "$BUILD_CTX/"

# Copy claudezilla
rsync -a --exclude='.git' --exclude='node_modules' "$CLAUDEZILLA_DIR/" "$BUILD_CTX/claudezilla/"

cd "$BUILD_CTX"
docker build -f tests/e2e/Dockerfile -t ctm-e2e .
docker run --rm --security-opt seccomp=unconfined ctm-e2e
