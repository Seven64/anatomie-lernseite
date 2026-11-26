#!/bin/bash
# Development startup script for Anatomie Lernseite

set -e

echo "🚀 Starting Anatomie Lernseite development server..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if models directory exists
if [ ! -d "public/models" ]; then
    echo "⚠️  Models directory not found. Run data pipeline first:"
    echo "   npm run data:export"
    echo ""
    echo "   Or manually place GLB files in public/models/<system>/"
fi

# Start dev server
echo "🌐 Starting Vite dev server on http://localhost:5173"
npm run dev