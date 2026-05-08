## How to Deploy


## CONF FILES HAS TO BE UNDER /etc/zerovuln/conf


### You need  docker to deploy

```
docker compose up -d
```


```
pip install -r requirements.txt
```



```
python main.py
```


## Project Structure

### Main Application (main.py)

The application launches multiple threads to run various modules concurrently. Tasks such as log collection, port scanning, and permission checks are scheduled to repeat at specific intervals using the `periodic_wrapped` function. Server address and agent name can be specified via command line arguments. All output files are collected in the `results/` directory.

### Modules (modules/)

* **log\_extractor**: Monitors Linux or Windows logs, detects specified keywords, and writes entries to `siem_events.log`.

* **check\_permissions**: Verifies ownership and permissions of critical files, generating `critical_files.csv`.

* **resource\_checker**: Tracks CPU, memory, and disk usage. Outputs are saved to `resource_log.json` and `disk.csv`.

* **ai_log_checker**: Sends collected log files to the **Ollama API** (Local AI), summarizes critical content, and writes results to `ai_log_checker_results.csv`.

* **find\_vulns / info\_collector and find\_vuln**: Lists installed system packages, queries the OSV API for vulnerabilities, and produces `vulnerabilities_report.csv`.

* **portscanner**: Scans TCP ports 1–65535, performs banner analysis, and outputs `portscan_result.csv`.

* **alert**: Applies security rules to scan logs and writes alerts to `events_alert.csv`.

* **soar**: Automatically blocks IPs and disables suspicious user accounts based on critical alerts. Each action includes an expiration time in the `soar_actions` table. When a block expires, the module unblocks the IP or re-enables the account and records the resolution status, optionally sending an email notification.

### Other Files

* **deploy.sh**: Script to install the agent as a systemd service.

* **requreiments.txt**: Dependency list (note the filename typo; should be `requirements.txt`).

* **results/**: Directory where all module outputs are stored.

## Important Points

### Network Communication

The `file_sender_loop` function periodically sends files from the `results/` directory to the server using a TCP socket. Files listed in `SPECIAL_FILES` are sent more frequently.

### Configuration and Permissions

Some modules adapt behavior based on the operating system (Linux or Windows). Certain operations require elevated privileges or root access (e.g., reading protected logs).

### API Keys and Sensitive Information

The Google API key in `ai_log_checker` is hardcoded, which poses a security risk. It should be loaded through environment variables instead.

### Error and Exception Handling

Modules generally catch and log errors, but additional detailed logging may be needed in some areas. For example, `resource_checker` uses `psutil` but lacks a global import statement.

### Lack of Documentation

The repository lacks comprehensive documentation. The `README.md` currently only contains license information. Installation instructions, usage examples, and module descriptions are needed for new contributors.

## Next Steps

* Review the detailed logic of each module, such as the `follow_file` and `follow_journal` functions in `log_extractor` to understand log processing flow.
* Investigate the data transmission format expected by the server, as the server-side implementation is not included.
* Improve security by extracting hardcoded API keys and correcting the `requreiments.txt` filename.
* Enhance logging configuration and adjust log levels for better observability.
* Set up a test environment or sample scenario to generate logs, examine module outputs, and validate data handling processes.
