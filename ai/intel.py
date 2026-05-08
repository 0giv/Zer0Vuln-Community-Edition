import os
import requests
import json
import logging

logger = logging.getLogger("Intel-Utils")

OTX_API_KEY = os.getenv("OTX_API_KEY", "")
VT_API_KEY = os.getenv("VT_API_KEY", "")

def check_ip_otx(ip_address):
    """Check IP reputation using AlienVault OTX"""
    if not OTX_API_KEY:
        return None
    
    url = f"https://otx.alienvault.com/api/v1/indicators/IPv4/{ip_address}/general"
    headers = {"X-OTX-API-KEY": OTX_API_KEY}
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            pulse_count = data.get("pulse_info", {}).get("count", 0)
            if pulse_count > 0:
                return f"OTX: Found in {pulse_count} pulses."
            return "OTX: No threats found."
        return f"OTX Error: {resp.status_code}"
    except Exception as e:
        return f"OTX Exception: {str(e)}"

def check_hash_vt(file_hash):
    """Check File Hash reputation using VirusTotal"""
    if not VT_API_KEY:
        return None
    
    url = f"https://www.virustotal.com/api/v3/files/{file_hash}"
    headers = {"x-apikey": VT_API_KEY}
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            stats = data.get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
            malicious = stats.get("malicious", 0)
            if malicious > 0:
                return f"VirusTotal: {malicious} engine(s) flagged as malicious."
            return "VirusTotal: No engines flagged as malicious."
        elif resp.status_code == 404:
            return "VirusTotal: Hash not found."
        return f"VT Error: {resp.status_code}"
    except Exception as e:
        return f"VT Exception: {str(e)}"

def extract_indicators(text):
    """Extract IPs and common hashes from log text using basic regex"""
    import re
    # Simple IPv4 regex
    ips = re.findall(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', text)
    # Simple SHA256/MD5 regex
    hashes = re.findall(r'\b[a-fA-F0-0]{32,64}\b', text)
    
    # Filter out local/internal IPs if needed
    clean_ips = [ip for ip in set(ips) if not ip.startswith(("127.", "192.168.", "10.", "172.16."))]
    
    return list(clean_ips), list(set(hashes))

def get_threat_intel_summary(text):
    """Scan text for indicators and return a consolidated threat summary"""
    ips, hashes = extract_indicators(text)
    results = []
    
    for ip in ips:
        res = check_ip_otx(ip)
        if res and "No threats" not in res:
            results.append(f"Indicator [{ip}]: {res}")
            
    for h in hashes:
        res = check_hash_vt(h)
        if res and "No engines flagged" not in res and "not found" not in res:
            results.append(f"Indicator [{h}]: {res}")
            
    return "\n".join(results) if results else None
