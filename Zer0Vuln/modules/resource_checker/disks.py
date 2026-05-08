import psutil
import json
from datetime import datetime
from modules.db import insert_record, fetch_where, update_record

def bytes_to_gb(byte_value):
    return round(byte_value / (1024**3), 2)

def send_local_alert(severity, message, metadata=None):
    """Helper to send alert to local events_alert table."""
    try:
        rec = {
            "source": "DiskMonitor",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "severity": severity,
            "message": message,
            "categories": "system"
        }
        if metadata:
            rec["message"] += f" | {json.dumps(metadata)}"
        insert_record("events_alert", rec)
    except Exception as e:
        print(f"[DiskMonitor] Failed to send alert: {e}")

def get_and_save_disk_info():
    try:
        # Get existing disks from DB to compare
        try:
            existing_rows = fetch_where("disk_usage")
        except Exception as e:
            # Almost always means the local disk_usage table hasn't been
            # created yet (db/init.sql hasn't run on this host). Treat as
            # no existing rows so the first scan can populate.
            print(f"[DiskMonitor] fetch_where('disk_usage') failed: {e}", flush=True)
            existing_rows = []
        existing_devices = {r['device'] for r in existing_rows}

        current_devices = set()
        partitions = psutil.disk_partitions()
        ok = 0
        skipped = 0
        for partition in partitions:
            try:
                device = partition.device
                mountpoint = partition.mountpoint
                current_devices.add(device)

                usage = psutil.disk_usage(mountpoint)
                data = {
                    'device': device,
                    'mountpoint': mountpoint,
                    'total_gb': bytes_to_gb(usage.total),
                    'used_gb': bytes_to_gb(usage.used),
                    'free_gb': bytes_to_gb(usage.free),
                    'percent': usage.percent,
                    'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }

                # Check if it's a NEW disk
                if device not in existing_devices and existing_devices:
                    send_local_alert(
                        "CRITICAL",
                        f"New disk entry detected: {device} mounted at {mountpoint}",
                        {"device": device, "mountpoint": mountpoint, "total_gb": data['total_gb']}
                    )

                # Upsert: prefer UPDATE on a matching device, otherwise INSERT.
                # If UPDATE fails (e.g. the row vanished mid-scan), fall back
                # to INSERT so the disk still gets recorded for this cycle.
                match = [r for r in existing_rows if r['device'] == device]
                try:
                    if match:
                        update_record("disk_usage", data, "device = %s", (device,))
                    else:
                        insert_record("disk_usage", data)
                    ok += 1
                except Exception as ue:
                    print(f"[DiskMonitor] upsert failed for {device}: {ue}", flush=True)
                    try:
                        insert_record("disk_usage", data)
                        ok += 1
                    except Exception as ie:
                        print(f"[DiskMonitor] insert fallback failed for {device}: {ie}", flush=True)
                        skipped += 1

            except PermissionError:
                skipped += 1
                continue
            except Exception as e:
                skipped += 1
                print(f"Could not get info for {partition.device}. Error: {e}", flush=True)

        if ok or skipped:
            print(f"[DiskMonitor] cycle: persisted={ok} skipped={skipped} partitions={len(partitions)}", flush=True)

        # Remove disks that are no longer present (optional, but good for cleanup)
        for old_device in existing_devices:
            if old_device not in current_devices:
                # Disk disconnected
                # Optional: Alert of disconnection
                pass

    except Exception as e:
        print(f"An unexpected error occurred in DiskMonitor: {e}", flush=True)

