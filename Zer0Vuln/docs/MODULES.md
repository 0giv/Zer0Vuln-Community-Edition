# Modules Overview

This document summarizes the purpose of each module in the repository and the output files they generate. All module outputs are stored inside the `results/` directory.

## ai_log_checker
* **Location:** `modules/ai_log_checker/ai_log_checker.py`
* **Description:** Reads existing log files (`siem_events.log`, `portscan_result.csv`, `critical_files.csv`, `ai_log_checker_results.csv`) and sends their contents to the **Ollama API** (Local AI). The response is shortened and written to `ai_log_checker_results.csv`.

## alert
* **Location:** `modules/alert/alert.py`
* **Description:** Loads a large set of security rules and scans `siem_events.log` for matches. Matched events are written to `events_alert.csv` with severity levels.

## check_permissions
* **Location:** `modules/check_permissions/check_permissions.py`
* **Description:** Searches common directories (Linux or Windows) for backup or configuration files that are not owned by `root` (or the system account on Windows). Results are saved to `critical_files.csv`.

## log_extractor
* **Location:** `modules/log_extractor/log_extractor.py`
* **Description:** Follows system log files or Windows Event Logs, filters lines containing suspicious keywords, and writes matching events to `siem_events.log` in JSON format.

## find_vulns
* **info_collector:** Collects installed packages using the system package manager or `wmic` on Windows and writes them to `installed_packages.csv`.
* **find_vuln:** Uses the OSV API to check packages listed in `installed_packages.csv` for known vulnerabilities and writes results to `vulnerabilities_report.csv`.

## portscanner
* **Location:** `modules/portscanner/portscanner.py`
* **Description:** Performs a basic TCP port scan on `127.0.0.1`, grabs service banners, and outputs details to `portscan_result.csv`.

## resource_checker
* **Location:** `modules/resource_checker/resource_checker.py`
* **Description:** Periodically records CPU, memory, and disk statistics to `resource_log.json`. The accompanying `disks.py` module writes a summary of disk usage to `disk.csv`.

## results directory
The `results/` folder contains all CSV and log files produced by the modules. These files are periodically sent to a server by `main.py`.
