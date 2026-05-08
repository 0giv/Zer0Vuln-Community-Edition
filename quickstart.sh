#!/bin/bash

# ===================================================================================
# Zer0Vuln Quick Start - Linux
# This script sets up the environment and starts the Zer0Vuln services.
# ===================================================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}[*] Zer0Vuln Quick Start - Linux${NC}"
echo -e "${YELLOW}[*] Current Dir: $(pwd)${NC}"

# Check for root privileges
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[!] Error: Please run as root (sudo ./quickstart.sh)${NC}"
  exit 1
fi

# Check for Docker
echo -e "${YELLOW}INFO: Checking Docker installation...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}INFO: Docker not found. Installing...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
else
    echo -e "${GREEN}SUCCESS: Docker is already installed.${NC}"
fi

# Check for Docker Compose
if ! docker compose version &> /dev/null; then
    echo -e "${RED}ERROR: Docker Compose not found. Please install docker-compose-plugin.${NC}"
    exit 1
fi

# Start Docker Compose
echo -e "${YELLOW}INFO: Starting containers...${NC}"
if [ -f "docker-compose.yaml" ] || [ -f "docker-compose.yml" ]; then
    docker compose up -d
    echo -e "${GREEN}SUCCESS: Zer0Vuln services started in detached mode.${NC}"
else
    echo -e "${RED}ERROR: docker-compose.yaml not found!${NC}"
    exit 1
fi

# Install Python dependencies for the local agent (optional)
echo -e "${YELLOW}INFO: Installing Python dependencies...${NC}"
if [ -f "requirements.txt" ]; then
    pip3 install -r requirements.txt --quiet
    echo -e "${GREEN}SUCCESS: Dependencies installed.${NC}"
else
    echo -e "${YELLOW}WARNING: requirements.txt not found.${NC}"
fi

echo -e "\n${GREEN}=====================================================${NC}"
echo -e "${GREEN} Zer0Vuln is now running!${NC}"
echo -e "${GREEN} Management Hub: http://localhost:5173${NC}"
echo -e "${GREEN}=====================================================${NC}"
