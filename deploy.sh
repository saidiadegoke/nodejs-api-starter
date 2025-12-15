#!/bin/bash

# OpinionPulse API Backend Deployment Script
set -e

echo "🚀 Starting OpinionPulse API deployment..."

# Check if .env.production.local exists
if [ ! -f ".env.production.local" ]; then
    echo "❌ Error: .env.production.local file not found!"
    echo "Please copy .env.production to .env.production.local and fill in your values."
    exit 1
fi

# Load environment variables
export $(cat .env.production.local | grep -v '^#' | xargs)

# Ensure package-lock.json exists
if [ ! -f "package-lock.json" ]; then
    echo "📦 Generating package-lock.json..."
    npm install --package-lock-only
fi

echo "📦 Building Docker image..."
if ! docker-compose build --no-cache; then
    echo "❌ Docker build failed. Check the logs above."
    exit 1
fi

echo "🗄️  Running database migrations..."
read -p "Do you want to run database migrations? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker-compose run --rm api npm run migrate
fi

echo "🌱 Running database seeds (optional)..."
read -p "Do you want to run database seeds? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker-compose run --rm api npm run seed
fi

echo "🚀 Starting API service..."
docker-compose up -d

echo "🔍 Checking service health..."
sleep 30

# Check if service is running
if docker-compose ps | grep -q "Up"; then
    echo "✅ API service is running!"
    echo ""
    echo "🌐 Your API should be available at:"
    echo "   - http://localhost:${API_PORT:-5010}"
    echo ""
    echo "🔍 Health check:"
    echo "   - curl http://localhost:${API_PORT:-5010}/health"
    echo ""
    echo "📊 To view logs:"
    echo "   docker-compose logs -f"
    echo ""
    echo "🛑 To stop service:"
    echo "   docker-compose down"
else
    echo "❌ API service failed to start. Check logs:"
    docker-compose logs
    exit 1
fi

echo "🎉 API deployment completed successfully!"