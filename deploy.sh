#!/bin/bash

# ===================================================================================
# Professional Systemd Service Deployment Script for Debian/Ubuntu
# Updated: ensures app, server, certs (with contents) and init.sql are deployed
# Both app and server systemd services run with -l "<LICENSE_KEY>" and Environment set.
# All these files MUST be present in the same directory where you run this script.
# ===================================================================================

# --- Color Definitions for Output ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# --- Variable Initialization ---
LICENSE_KEY=""
DEPLOY_PATH=$(pwd) # Get the absolute path of the current directory
SCRIPT_DIR="$DEPLOY_PATH"

# --- Usage Function ---
usage() {
  echo "Usage: $0 -l <license_key>"
  echo "  -l <license_key>   : [Required] The license key for the './server' and './app' applications."
  echo "  -h                 : Display this help message."
  exit 1
}

# --- Step 0: Determine Public IP ---
echo -e "${YELLOW}INFO: Detecting public IP...${NC}"
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com)
if [ -z "$PUBLIC_IP" ]; then
    echo -e "${RED}ERROR: Unable to determine public IP. Aborting.${NC}"
    exit 1
fi
echo -e "${GREEN}SUCCESS: Public IP detected as ${PUBLIC_IP}${NC}\n"


# --- Step 1: Parse Command-Line Arguments ---
while getopts "l:h" opt; do
  case ${opt} in
    l )
      LICENSE_KEY=$OPTARG
      ;;
    h )
      usage
      ;;
    \? )
      usage
      ;;
  esac
done

if [ -z "${LICENSE_KEY}" ]; then
    echo -e "${RED}ERROR: License key is mandatory.${NC}"
    usage
fi

# --- Step 2: Check for Root Privileges ---
echo -e "${YELLOW}INFO: Checking for root privileges...${NC}"
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}ERROR: This script must be run as root. Please use 'sudo'.${NC}"
  exit 1
fi
if [ -z "$SUDO_USER" ]; then
    echo -e "${RED}ERROR: \$SUDO_USER not set. Please run with 'sudo', not as root user directly.${NC}"
    exit 1
fi
echo -e "${GREEN}SUCCESS: Root privileges check passed.${NC}\n"

# --- Step 2.5: Ensure required deployment artifacts exist in the current directory ---
REQUIRED_FILES=("app" "server" "certs" "init.sql")
MISSING=()
for f in "${REQUIRED_FILES[@]}"; do
    if [ "$f" = "certs" ]; then
        if [ ! -d "${SCRIPT_DIR}/certs" ]; then
            MISSING+=("certs/")
        fi
    else
        if [ ! -e "${SCRIPT_DIR}/$f" ]; then
            MISSING+=("$f")
        fi
    fi
done

if [ ${#MISSING[@]} -ne 0 ]; then
    echo -e "${RED}ERROR: The following required item(s) are missing in ${SCRIPT_DIR}: ${MISSING[*]}${NC}"
    echo -e "${YELLOW}Make sure 'app', 'server', the 'certs/' directory (with its contents) and 'init.sql' are present in the same folder where you run this script.${NC}"
    exit 1
fi

echo -e "${GREEN}SUCCESS: Required deployment artifacts found in ${SCRIPT_DIR}.${NC}\n"

# --- OPTIONAL: Normalize permissions for files we will run ---
chmod +x "${SCRIPT_DIR}/app" || true
chmod +x "${SCRIPT_DIR}/server" || true

# --- Step 3: Install nginx if not installed ---
echo -e "${YELLOW}INFO: Checking nginx installation status...${NC}"
if dpkg -l | grep -q " nginx "; then
    echo -e "${GREEN}SUCCESS: nginx is already installed. Skipping installation.${NC}\n"
else
    echo -e "${YELLOW}INFO: nginx not found. Installing...${NC}"
    apt-get update -y && apt-get install nginx -y
    if [ $? -ne 0 ]; then
        echo -e "${RED}ERROR: Failed to install nginx. Aborting.${NC}"
        exit 1
    fi
    echo -e "${GREEN}SUCCESS: nginx has been installed.${NC}\n"
fi


# --- Step 4: Deploy Website Files ---
SOURCE_DIR="./dist"
DEST_DIR="/var/www/html"

echo -e "${YELLOW}INFO: Checking for source directory at '${SOURCE_DIR}'...${NC}"
if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${RED}ERROR: Source directory '${SOURCE_DIR}' not found. Aborting.${NC}"
    exit 1
fi
echo -e "${YELLOW}INFO: Deploying files from '${SOURCE_DIR}' to '${DEST_DIR}'...${NC}"
cp -r ${SOURCE_DIR}/* ${DEST_DIR}/
chown -R www-data:www-data ${DEST_DIR}
chmod -R 755 ${DEST_DIR}
echo -e "${GREEN}SUCCESS: Files deployed and permissions set.${NC}\n"
echo -e "${YELLOW}INFO: Searching for frontend JS bundles to replace 'localhost'...${NC}"
JS_BUNDLE_DIR="${DEST_DIR}/assets"
if [ -d "$JS_BUNDLE_DIR" ]; then
    JS_BUNDLE_FILE=$(find $JS_BUNDLE_DIR -type f -name "index-*.js" | head -n 1)
    if [ -f "$JS_BUNDLE_FILE" ]; then
        echo -e "${YELLOW}INFO: Found JS bundle: $JS_BUNDLE_FILE${NC}"
        sed -i "s/localhost/${PUBLIC_IP}/g" "$JS_BUNDLE_FILE"
        echo -e "${GREEN}SUCCESS: Replaced 'localhost' with '${PUBLIC_IP}' in $JS_BUNDLE_FILE${NC}"
    else
        echo -e "${RED}ERROR: index-*.js not found in ${JS_BUNDLE_DIR}.${NC}"
    fi
else
    echo -e "${RED}ERROR: JS asset directory '${JS_BUNDLE_DIR}' not found.${NC}"
fi


# --- Step 4.5: Configure NGINX for SPA Routing ---
NGINX_SITE="/etc/nginx/sites-available/zer0vuln"
echo -e "${YELLOW}INFO: Creating nginx configuration for SPA routing...${NC}"

cat <<EOF > $NGINX_SITE
server {
    listen 80;
    server_name _;

    root /var/www/html;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|otf|json)\$ {
        try_files \$uri =404;
        access_log off;
        log_not_found off;
    }
}
EOF

ln -sf $NGINX_SITE /etc/nginx/sites-enabled/zer0vuln
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
systemctl restart nginx




# --- Step 4.75: Copy certs/ and init.sql into deployment directory explicitly ---
echo -e "${YELLOW}INFO: Ensuring certs/ and init.sql are in deployment directory...${NC}"
if [ -d "${SCRIPT_DIR}/certs" ]; then
    rm -rf "${DEPLOY_PATH}/certs" || true
    cp -r "${SCRIPT_DIR}/certs" "${DEPLOY_PATH}/"
    echo -e "${GREEN}SUCCESS: certs/ copied to ${DEPLOY_PATH}/certs${NC}"
else
    echo -e "${RED}ERROR: certs/ missing in ${SCRIPT_DIR}. Aborting.${NC}"
    exit 1
fi

if [ -f "${SCRIPT_DIR}/init.sql" ]; then
    cp "${SCRIPT_DIR}/init.sql" "${DEPLOY_PATH}/init.sql"
    echo -e "${GREEN}SUCCESS: init.sql copied to ${DEPLOY_PATH}/init.sql${NC}"
else
    echo -e "${RED}ERROR: init.sql missing in ${SCRIPT_DIR}. Aborting.${NC}"
    exit 1
fi

# Normalize ownership so services running as $SUDO_USER can read them
chown -R $SUDO_USER:$SUDO_USER "${DEPLOY_PATH}/certs" || true
chown $SUDO_USER:$SUDO_USER "${DEPLOY_PATH}/init.sql" || true


# --- Step 5: Create and Manage Systemd Services ---
echo -e "${YELLOW}INFO: Managing application services via systemd...${NC}"

# --- Create and start api.service (app) ---
SERVICE_FILE_API="/etc/systemd/system/api.service"
APP_PATH_API="${DEPLOY_PATH}/app"

if [ ! -f "$APP_PATH_API" ]; then
    echo -e "${RED}ERROR: Application file '${APP_PATH_API}' not found. Skipping service creation.${NC}"
else
    echo -e "${YELLOW}INFO: Creating systemd service file for API (app) with -l ...${NC}"
    chmod +x "$APP_PATH_API"

    cat <<EOF > $SERVICE_FILE_API
[Unit]
Description=API Service for My Application (app)
After=network.target

[Service]
User=$SUDO_USER
Group=$SUDO_USER
WorkingDirectory=$DEPLOY_PATH
Environment=LICENSE_KEY="${LICENSE_KEY}"
ExecStart=${APP_PATH_API} -l "${LICENSE_KEY}"
Restart=on-failure
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    echo -e "${YELLOW}INFO: Reloading systemd, enabling and restarting api.service...${NC}"
    systemctl daemon-reload
    systemctl enable api.service
    systemctl restart api.service

    if systemctl is-active --quiet api.service; then
        echo -e "${GREEN}SUCCESS: api.service is active and running.${NC}"
    else
        echo -e "${RED}ERROR: api.service failed to start. Use 'sudo journalctl -u api.service' to check logs.${NC}"
    fi
fi
echo ""

# --- Create and start server.service ---
SERVICE_FILE_SERVER="/etc/systemd/system/server.service"
APP_PATH_SERVER="${DEPLOY_PATH}/server"

if [ ! -f "$APP_PATH_SERVER" ]; then
    echo -e "${RED}ERROR: Application file '${APP_PATH_SERVER}' not found. Skipping service creation.${NC}"
else
    echo -e "${YELLOW}INFO: Creating systemd service file for Server with -l ...${NC}"
    chmod +x "$APP_PATH_SERVER"

    cat <<EOF > $SERVICE_FILE_SERVER
[Unit]
Description=Main Server Service for My Application (server)
After=network.target

[Service]
User=$SUDO_USER
Group=$SUDO_USER
WorkingDirectory=$DEPLOY_PATH
Environment=LICENSE_KEY="${LICENSE_KEY}"
ExecStart=${APP_PATH_SERVER} -l "${LICENSE_KEY}"
Restart=on-failure
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    echo -e "${YELLOW}INFO: Reloading systemd, enabling and restarting server.service...${NC}"
    systemctl daemon-reload
    systemctl enable server.service
    systemctl restart server.service

    if systemctl is-active --quiet server.service; then
        echo -e "${GREEN}SUCCESS: server.service is active and running.${NC}"
    else
        echo -e "${RED}ERROR: server.service failed to start. Use 'sudo journalctl -u server.service' to check logs.${NC}"
    fi
fi
echo ""

# --- Step 6: Install Docker if not present ---
echo -e "${YELLOW}INFO: Checking Docker installation status...${NC}"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}SUCCESS: Docker is already installed. Skipping installation.${NC}\n"
else
    echo -e "${YELLOW}INFO: Docker not found. Installing via official script...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    if [ $? -ne 0 ]; then
        echo -e "${RED}ERROR: Failed to download Docker installation script. Aborting Docker setup.${NC}"
    else
        sh get-docker.sh
        if [ $? -ne 0 ]; then
            echo -e "${RED}ERROR: Docker installation failed.${NC}"
        else
            echo -e "${GREEN}SUCCESS: Docker has been installed.${NC}\n"
        fi
        rm get-docker.sh
    fi
fi

# --- Step 7: Run Docker Compose ---
echo -e "${YELLOW}INFO: Checking for docker-compose.yaml...${NC}"
if [ -f "docker-compose.yaml" ]; then
    echo -e "${YELLOW}INFO: 'docker-compose.yaml' found. Starting containers...${NC}"
    docker compose up -d
    if [ $? -ne 0 ]; then
        echo -e "${RED}ERROR: 'docker compose up -d' failed. Please check your docker-compose.yaml file and Docker status.${NC}"
    else
        echo -e "${GREEN}SUCCESS: Docker Compose services started in detached mode.${NC}"
    fi
else
    echo -e "${YELLOW}INFO: 'docker-compose.yaml' not found. Skipping this step.${NC}"
fi


echo -e "\n${GREEN}=====================================================${NC}"
echo -e "${GREEN} All deployment tasks are complete!${NC}"
echo -e "${GREEN}=====================================================${NC}"

exit 0
