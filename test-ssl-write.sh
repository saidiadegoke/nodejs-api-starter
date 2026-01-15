#!/bin/bash
# Test SSL certificate directory write access from Docker container

echo "=== Testing SSL Certificate Write Access ==="
echo ""

SHARED_SSL_DIR="/opt/smartstore/ssl"
CONTAINER_SSL_DIR="/app/ssl"

# 1. Find the API container (handles both standalone and Docker Swarm naming)
echo "1. Finding SmartStore API container..."
API_CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "(smartstore-api|smartstore.*api)" | head -1)

if [ -z "$API_CONTAINER" ]; then
    echo "   ✗ SmartStore API container not found"
    echo "   Available containers:"
    docker ps --format "{{.Names}}" | sed 's/^/     /'
    echo ""
    echo "   Please start the container first or specify container name manually"
    exit 1
fi

echo "   ✓ Found container: $API_CONTAINER"
echo ""

# 2. Check if host directory exists
echo "2. Checking host SSL directory..."
if [ ! -d "$SHARED_SSL_DIR" ]; then
    echo "   ⚠ Host directory does not exist: $SHARED_SSL_DIR"
    echo "   Run: sudo ./setup-shared-ssl-directory.sh"
    echo ""
fi

if [ -d "$SHARED_SSL_DIR" ]; then
    echo "   ✓ Host directory exists: $SHARED_SSL_DIR"
    ls -ld "$SHARED_SSL_DIR" | sed 's/^/     /'
fi
echo ""

# 3. Check if mount is working
echo "3. Checking Docker volume mount..."
MOUNT_INFO=$(docker inspect "$API_CONTAINER" --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Type}}){{"\n"}}{{end}}' | grep -E "(ssl|/app/ssl)" || echo "")
if [ -n "$MOUNT_INFO" ]; then
    echo "   ✓ Volume mount(s) found:"
    echo "$MOUNT_INFO" | sed 's/^/     /'
    if echo "$MOUNT_INFO" | grep -q "$SHARED_SSL_DIR.*$CONTAINER_SSL_DIR"; then
        echo "   ✓ Correct bind mount: $SHARED_SSL_DIR -> $CONTAINER_SSL_DIR"
    else
        echo "   ⚠ Expected bind mount not found: $SHARED_SSL_DIR -> $CONTAINER_SSL_DIR"
        echo "   Check docker-compose.yml has: - /opt/smartstore/ssl:/app/ssl"
    fi
else
    echo "   ⚠ No SSL volume mount found in container"
    echo "   Check docker-compose.yml has: - /opt/smartstore/ssl:/app/ssl"
fi
echo ""

# 4. Test write from container
echo "4. Testing write access from container..."
TEST_FILE="test-ssl-write-$(date +%s).txt"
TEST_PATH="$CONTAINER_SSL_DIR/certs/$TEST_FILE"

echo "   Attempting to write test file: $TEST_PATH"
if docker exec "$API_CONTAINER" sh -c "mkdir -p $CONTAINER_SSL_DIR/certs && echo 'test' > $TEST_PATH 2>&1"; then
    echo "   ✓ Write successful from container"
    
    # Check if file exists on host
    HOST_TEST_FILE="$SHARED_SSL_DIR/certs/$TEST_FILE"
    if [ -f "$HOST_TEST_FILE" ]; then
        echo "   ✓ File accessible on host: $HOST_TEST_FILE"
        rm -f "$HOST_TEST_FILE"
        echo "   ✓ Test file cleaned up"
    else
        echo "   ⚠ File not found on host (mount may not be working)"
    fi
else
    echo "   ✗ Write failed - check container logs and permissions"
    docker exec "$API_CONTAINER" sh -c "ls -la $CONTAINER_SSL_DIR 2>&1" || echo "   Directory may not exist in container"
fi
echo ""

# 5. Check environment variables
echo "5. Checking environment variables in container..."
CERT_PATH=$(docker exec "$API_CONTAINER" sh -c "echo \$CLOUDFLARE_ORIGIN_CERT_PATH" 2>/dev/null)
KEY_PATH=$(docker exec "$API_CONTAINER" sh -c "echo \$CLOUDFLARE_ORIGIN_KEY_PATH" 2>/dev/null)

echo "   CLOUDFLARE_ORIGIN_CERT_PATH: ${CERT_PATH:-NOT SET}"
echo "   CLOUDFLARE_ORIGIN_KEY_PATH: ${KEY_PATH:-NOT SET}"
if [ -z "$CERT_PATH" ] || [ -z "$KEY_PATH" ]; then
    echo "   ⚠ Environment variables not set - defaults will be used"
fi
echo ""

# 6. Check actual directory structure
echo "6. Checking directory structure..."
echo "   In container:"
docker exec "$API_CONTAINER" sh -c "ls -la $CONTAINER_SSL_DIR 2>/dev/null || echo '   Directory does not exist'" | sed 's/^/     /'
echo "   On host:"
ls -la "$SHARED_SSL_DIR" 2>/dev/null | sed 's/^/     /' || echo "   Directory does not exist on host"
echo ""

echo "=== Test Complete ==="
echo ""
echo "Container: $API_CONTAINER"
echo ""
echo "If writes are failing:"
echo "1. Ensure /opt/smartstore/ssl exists on host (run setup-shared-ssl-directory.sh)"
echo "2. Check docker-compose.yml has bind mount: - /opt/smartstore/ssl:/app/ssl"
echo "3. Verify container user (UID 1001) has write permissions"
echo "4. Check container logs: docker logs $API_CONTAINER | grep CertificateManager"
echo "5. Test upload via UI and check logs: docker logs -f $API_CONTAINER"
echo ""

