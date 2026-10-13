#!/usr/bin/env python3
"""Observe one owned test command; measurements never change its acceptance gates."""
import argparse
import datetime
import json
import math
import os
from pathlib import Path
import platform
import signal
import subprocess
import tempfile
import time

PERIOD_SECONDS = 1
MAX_RECORDS = 4096
MAX_RUNTIME_SECONDS = 3600
TERMINATION_GRACE_SECONDS = 10
KILL_GRACE_SECONDS = 5
CPU_FIELDS = ("user", "nice", "system", "idle", "iowait", "irq", "softirq", "steal")
CPU_STAT_FIELDS = ("usage_usec", "user_usec", "system_usec", "nr_periods", "nr_throttled", "throttled_usec", "nr_bursts", "burst_usec")
MEMORY_EVENT_FIELDS = ("low", "high", "max", "oom", "oom_kill", "oom_group_kill")


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def finite_number(value):
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise ValueError("Invalid resource number")
    return number


class Sampler:
    def __init__(self):
        self.previous_cpu = None
        self.previous_swap = None
        self.read_errors = {}
        self.cgroup_root = Path("/sys/fs/cgroup")
        try:
            for line in Path("/proc/self/cgroup").read_text().splitlines():
                hierarchy, controllers, location = line.split(":", 2)
                if hierarchy == "0" and not controllers:
                    relative = Path(location.lstrip("/"))
                    if ".." not in relative.parts:
                        self.cgroup_root /= relative
                    else:
                        self.cgroup_root = None
                    break
        except (OSError, ValueError):
            pass

    def observe(self, category, callback):
        try:
            return callback()
        except (OSError, ValueError, IndexError, KeyError):
            self.read_errors[category] = self.read_errors.get(category, 0) + 1
            return None

    def cpu(self):
        values = Path("/proc/stat").read_text().splitlines()[0].split()
        if values[0] != "cpu":
            raise ValueError("Missing aggregate CPU")
        ticks = dict(zip(CPU_FIELDS, (int(v) for v in values[1:9])))
        utilization = None
        if self.previous_cpu is not None:
            delta = {key: max(0, ticks[key] - self.previous_cpu[key]) for key in CPU_FIELDS}
            total = sum(delta.values())
            if total:
                utilization = {
                    "busy_percent": 100 * (total - delta["idle"] - delta["iowait"]) / total,
                    "idle_percent": 100 * delta["idle"] / total,
                    "iowait_percent": 100 * delta["iowait"] / total,
                    "steal_percent": 100 * delta["steal"] / total,
                }
        self.previous_cpu = ticks
        return {"ticks": ticks, "utilization": utilization}

    @staticmethod
    def load():
        fields = Path("/proc/loadavg").read_text().split()
        runnable, total = fields[3].split("/")
        return {"one": finite_number(fields[0]), "five": finite_number(fields[1]), "fifteen": finite_number(fields[2]), "runnable": int(runnable), "total": int(total)}

    @staticmethod
    def memory():
        entries = {line.split(":", 1)[0]: int(line.split()[1]) for line in Path("/proc/meminfo").read_text().splitlines()}
        return {"total": entries["MemTotal"], "available": entries["MemAvailable"], "swap_total": entries["SwapTotal"], "swap_free": entries["SwapFree"]}

    def swap(self):
        entries = {fields[0]: int(fields[1]) for line in Path("/proc/vmstat").read_text().splitlines() if (fields := line.split()) and fields[0] in ("pswpin", "pswpout")}
        current = {"in": entries["pswpin"], "out": entries["pswpout"]}
        previous = self.previous_swap
        self.previous_swap = current
        return {**current, "in_delta": None if previous is None else max(0, current["in"] - previous["in"]), "out_delta": None if previous is None else max(0, current["out"] - previous["out"])}

    @staticmethod
    def pressure(kind):
        result = {}
        for line in Path("/proc/pressure", kind).read_text().splitlines():
            fields = line.split()
            if fields[0] not in ("some", "full"):
                continue
            numbers = dict(field.split("=", 1) for field in fields[1:])
            result[fields[0]] = {"avg10": finite_number(numbers["avg10"]), "avg60": finite_number(numbers["avg60"]), "avg300": finite_number(numbers["avg300"]), "total": int(numbers["total"])}
        return result

    @staticmethod
    def key_numbers(path, names):
        return {key: int(value) for line in path.read_text().splitlines() for key, value in [line.split()] if key in names}

    @staticmethod
    def limit(path):
        text = path.read_text().strip()
        return {"unlimited": text == "max", "value": None if text == "max" else int(text)}

    def cgroup(self):
        root = self.cgroup_root
        if root is None:
            return {"version": 2, "supported": False, "cpu": None, "memory": None}
        if not (root / "cgroup.controllers").exists():
            # Do not label a guessed legacy mount as the test process's cgroup.
            return {"version": 1, "supported": False, "cpu": None, "memory": None}

        def cpu():
            quota, period = (root / "cpu.max").read_text().split()
            return {"quota_us": None if quota == "max" else int(quota), "unlimited": quota == "max", "period_us": int(period), "stats": self.key_numbers(root / "cpu.stat", CPU_STAT_FIELDS)}

        def memory():
            result = {"current_bytes": int((root / "memory.current").read_text()), "max_bytes": self.limit(root / "memory.max"), "events": self.key_numbers(root / "memory.events", MEMORY_EVENT_FIELDS), "swap_current_bytes": None, "swap_max_bytes": None}
            if (root / "memory.swap.current").exists():
                result["swap_current_bytes"] = int((root / "memory.swap.current").read_text())
            if (root / "memory.swap.max").exists():
                result["swap_max_bytes"] = self.limit(root / "memory.swap.max")
            return result

        return {"version": 2, "supported": True, "cpu": self.observe("cgroup_cpu", cpu), "memory": self.observe("cgroup_memory", memory)}

    def sample(self, started_ns):
        now_ns = time.monotonic_ns()
        return {"monotonic_ns": now_ns, "elapsed_ns": now_ns - started_ns, "utc": utc_now(), "cpu": self.observe("cpu", self.cpu), "load": self.observe("load", self.load), "memory_kib": self.observe("memory", self.memory), "swap_pages": self.observe("swap", self.swap), "pressure": {kind: self.observe("pressure_" + kind, lambda kind=kind: self.pressure(kind)) for kind in ("cpu", "memory", "io")}, "cgroup": self.observe("cgroup", self.cgroup)}


def write_report(path, report):
    descriptor, temporary = tempfile.mkstemp(prefix=".test-host-capacity-", suffix=".json", dir=path.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w") as output:
            json.dump(report, output, allow_nan=False, separators=(",", ":"))
            output.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    options = parser.parse_args()
    command = options.command[1:] if options.command[:1] == ["--"] else options.command
    if not command:
        parser.error("An owned command is required")
    os.umask(0o077)
    path = options.output.absolute()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    # Every attempt gets its own report; never replace a previous attempt.
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0), 0o600)
    os.close(descriptor)
    started_ns = time.monotonic_ns()
    sampler = Sampler()
    report = {"schema_version": 1, "clock_relationship": "same_host_sequential_monotonic_and_utc_only", "host": {"os": "linux" if platform.system() == "Linux" else "other", "architecture": platform.machine() if platform.machine() in ("x86_64", "aarch64") else "other", "logical_cpu_count": os.cpu_count(), "affinity_cpu_count": len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else None, "clock_ticks_per_second": os.sysconf("SC_CLK_TCK"), "page_size_bytes": os.sysconf("SC_PAGE_SIZE")}, "measurement": {"started_utc": utc_now(), "ended_utc": None, "started_monotonic_ns": started_ns, "ended_monotonic_ns": None, "period_seconds": PERIOD_SECONDS, "max_records": MAX_RECORDS, "max_runtime_seconds": MAX_RUNTIME_SECONDS, "sample_count": 0, "dropped_records": 0, "child_returncode": None, "forwarded_signal": None, "timed_out": False, "complete": False, "read_errors": sampler.read_errors}, "samples": []}
    signals_received = []
    previous_handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
    for sig in previous_handlers:
        signal.signal(sig, lambda number, _frame: signals_received.append(number))
    child = None
    termination_at = None
    kill_at = None
    next_sample = time.monotonic()
    next_checkpoint = next_sample + 30
    result = 1
    def signal_owned(number):
        # The unreaped Popen child owns this newly created process group.
        # A concurrent exit is normal and must preserve its actual status.
        try:
            os.killpg(child.pid, number)
        except ProcessLookupError:
            pass
    try:
        write_report(path, report)
        child = subprocess.Popen(command, start_new_session=True)
        while True:
            now = time.monotonic()
            if now >= next_sample:
                sample = sampler.sample(started_ns)
                if len(report["samples"]) < MAX_RECORDS:
                    report["samples"].append(sample)
                else:
                    report["measurement"]["dropped_records"] += 1
                # Never perform a burst of catch-up reads after scheduling delay.
                next_sample = time.monotonic() + PERIOD_SECONDS
            returncode = child.poll()
            if returncode is not None:
                report["measurement"]["child_returncode"] = returncode
                result = returncode if returncode >= 0 else 128 - returncode
                break
            timed_out = (time.monotonic_ns() - started_ns) / 1e9 >= MAX_RUNTIME_SECONDS
            if termination_at is None and (signals_received or timed_out):
                forwarded = signals_received[0] if signals_received else signal.SIGTERM
                report["measurement"]["forwarded_signal"] = int(forwarded)
                report["measurement"]["timed_out"] = timed_out
                signal_owned(forwarded)
                termination_at = now
            if termination_at is not None and kill_at is None and now - termination_at >= TERMINATION_GRACE_SECONDS:
                signal_owned(signal.SIGKILL)
                kill_at = now
            if kill_at is not None and now - kill_at >= KILL_GRACE_SECONDS:
                # A noninterruptible child must not hang the monitor forever.
                result = 124 if timed_out else 128 + int(report["measurement"]["forwarded_signal"])
                break
            if now >= next_checkpoint:
                report["measurement"]["sample_count"] = len(report["samples"])
                write_report(path, report)
                next_checkpoint = now + 30
            time.sleep(min(0.1, max(0, next_sample - time.monotonic())))
        if report["measurement"]["timed_out"]:
            result = 124
        report["measurement"]["complete"] = True
    except (OSError, ValueError):
        # Fixed category only; do not expose argv, path, environment or raw errors.
        print("Capacity monitor failed: metadata_or_owned_child_failure", flush=True)
        original_returncode = None if child is None else child.poll()
        if child is not None and original_returncode is None:
            try:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=KILL_GRACE_SECONDS)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                pass
        result = (original_returncode if original_returncode >= 0 else 128 - original_returncode) if original_returncode not in (None, 0) else 1
    finally:
        report["measurement"].update({"ended_utc": utc_now(), "ended_monotonic_ns": time.monotonic_ns(), "sample_count": len(report["samples"])})
        try:
            try:
                write_report(path, report)
            except (OSError, ValueError):
                print("Capacity monitor failed: metadata_write_failed", flush=True)
                # Keep an already observed command failure or signal intact.
                if result == 0:
                    result = 1
        finally:
            for sig, previous in previous_handlers.items():
                signal.signal(sig, previous)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
