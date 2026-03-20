#!/bin/bash
# Build and run Playwright tests in Docker
set -e

cd "$(dirname "$0")/../.."

echo "Building Playwright test container..."
docker build -f tests/playwright/Dockerfile -t ctm-playwright-tests .

echo "Running tests..."
docker run --rm ctm-playwright-tests
