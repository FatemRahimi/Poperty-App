#!/bin/bash

# ==========================================
# Development Environment Fix Script
# ==========================================
# This script fixes common issues you encounter:
# 1. Port conflicts (5050, 3000, etc.)
# 2. PostgreSQL connection issues
# 3. Node.js processes not stopping properly
# ==========================================

echo "🔧 Starting Development Environment Fix..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to kill processes on specific ports
kill_port_processes() {
    local port=$1
    echo -e "${BLUE}Checking port $port...${NC}"
    
    # Find processes using the port
    PIDS=$(lsof -ti :$port)
    
    if [ -n "$PIDS" ]; then
        echo -e "${YELLOW}Found processes using port $port: $PIDS${NC}"
        echo "Killing processes..."
        echo "$PIDS" | xargs kill -9 2>/dev/null
        sleep 2
        
        # Verify they're gone
        REMAINING=$(lsof -ti :$port)
        if [ -z "$REMAINING" ]; then
            echo -e "${GREEN}✅ Port $port is now free${NC}"
        else
            echo -e "${RED}❌ Some processes still running on port $port${NC}"
        fi
    else
        echo -e "${GREEN}✅ Port $port is already free${NC}"
    fi
    echo ""
}

# Function to fix PostgreSQL issues
fix_postgresql() {
    echo -e "${BLUE}Fixing PostgreSQL issues...${NC}"
    
    # Stop any running PostgreSQL services
    echo "Stopping PostgreSQL services..."
    brew services stop postgresql@14 2>/dev/null
    brew services stop postgresql@15 2>/dev/null
    
    # Remove lock files
    echo "Removing PostgreSQL lock files..."
    rm -f /usr/local/var/postgresql@14/postmaster.pid 2>/dev/null
    rm -f /opt/homebrew/var/postgresql@14/postmaster.pid 2>/dev/null
    
    # Find and kill any PostgreSQL processes
    POSTGRES_PIDS=$(ps aux | grep postgres | grep -v grep | awk '{print $2}')
    if [ -n "$POSTGRES_PIDS" ]; then
        echo "Killing orphaned PostgreSQL processes..."
        echo "$POSTGRES_PIDS" | xargs kill -9 2>/dev/null
        sleep 2
    fi
    
    # Start PostgreSQL
    echo "Starting PostgreSQL..."
    brew services start postgresql@14
    sleep 3
    
    # Test connection
    echo "Testing PostgreSQL connection..."
    if psql -h localhost -p 5432 -U $(whoami) -d postgres -c "SELECT 1;" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL is running and accessible${NC}"
    else
        echo -e "${YELLOW}⚠️  PostgreSQL might need manual attention${NC}"
        echo "You may need to run: createdb $(whoami)"
    fi
    echo ""
}

# Function to clean up Node.js processes
cleanup_node_processes() {
    echo -e "${BLUE}Cleaning up Node.js processes...${NC}"
    
    # Find all node processes related to this project
    NODE_PIDS=$(ps aux | grep node | grep -E "(server|client|property)" | grep -v grep | awk '{print $2}')
    
    if [ -n "$NODE_PIDS" ]; then
        echo -e "${YELLOW}Found Node.js processes: $NODE_PIDS${NC}"
        echo "Killing Node.js processes..."
        echo "$NODE_PIDS" | xargs kill -9 2>/dev/null
        sleep 2
        echo -e "${GREEN}✅ Node.js processes cleaned up${NC}"
    else
        echo -e "${GREEN}✅ No Node.js processes to clean up${NC}"
    fi
    echo ""
}

# Main execution
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}🔧 Development Environment Troubleshooter${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# Step 1: Clean up Node.js processes
cleanup_node_processes

# Step 2: Free up common ports
echo -e "${BLUE}Freeing up common development ports...${NC}"
kill_port_processes 3000  # React frontend
kill_port_processes 5050  # Express backend
kill_port_processes 8080  # Alternative dev server
kill_port_processes 3001  # Alternative React port

# Step 3: Fix PostgreSQL
fix_postgresql

# Step 4: Additional cleanup
echo -e "${BLUE}Additional cleanup...${NC}"
# Clear npm cache if needed
echo "Clearing npm cache..."
npm cache clean --force >/dev/null 2>&1

echo -e "${GREEN}✅ Cleanup complete!${NC}"
echo ""

# Step 5: Try to start services
echo -e "${BLUE}Attempting to start development servers...${NC}"
echo ""

echo -e "${YELLOW}To start your development environment:${NC}"
echo "1. Backend: cd server && npm start"
echo "2. Frontend: cd client && npm start"
echo ""

# Optional: Auto-start if requested
read -p "Would you like to auto-start the backend server now? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Starting backend server...${NC}"
    cd server && npm start &
    SERVER_PID=$!
    echo "Backend server started with PID: $SERVER_PID"
    echo "To stop it later: kill $SERVER_PID"
    echo ""
    
    echo -e "${YELLOW}Remember to start the frontend with: cd client && npm start${NC}"
fi

echo -e "${GREEN}🎉 Environment fix complete!${NC}" 