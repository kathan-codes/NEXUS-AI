"""Real-time system telemetry using native Win32 APIs via ctypes."""

from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import os
import platform
import shutil
import socket
import sys
import time
from collections import deque
from typing import Any


class _MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength", wt.DWORD),
        ("dwMemoryLoad", wt.DWORD),
        ("ullTotalPhys", ctypes.c_uint64),
        ("ullAvailPhys", ctypes.c_uint64),
        ("ullTotalPageFile", ctypes.c_uint64),
        ("ullAvailPageFile", ctypes.c_uint64),
        ("ullTotalVirtual", ctypes.c_uint64),
        ("ullAvailVirtual", ctypes.c_uint64),
        ("ullAvailExtendedVirtual", ctypes.c_uint64),
    ]


class _FILETIME(ctypes.Structure):
    _fields_ = [("dwLowDateTime", wt.DWORD), ("dwHighDateTime", wt.DWORD)]


def _ft_to_int(ft: _FILETIME) -> int:
    return (ft.dwHighDateTime << 32) | ft.dwLowDateTime


class TelemetryCollector:
    """Collects live OS, CPU, RAM, and disk metrics without mocked values."""

    def __init__(self, history_size: int = 60) -> None:
        self._last_cpu_times: tuple[int, int, int] | None = None
        self._history: deque[dict[str, Any]] = deque(maxlen=history_size)
        self._start_time = time.time()
        # Prime initial CPU counter so the first snapshot can compute delta
        if os.name == "nt":
            self._last_cpu_times = self._read_win_cpu_times()

    @staticmethod
    def _read_win_cpu_times() -> tuple[int, int, int]:
        idle, kernel, user = _FILETIME(), _FILETIME(), _FILETIME()
        ok = ctypes.windll.kernel32.GetSystemTimes(
            ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)
        )
        if not ok:
            return (0, 0, 0)
        return _ft_to_int(idle), _ft_to_int(kernel), _ft_to_int(user)

    def _cpu_percent(self) -> float:
        if os.name != "nt":
            return 0.0
        current = self._read_win_cpu_times()
        prev = self._last_cpu_times
        self._last_cpu_times = current
        if prev is None:
            return 0.0
        di = current[0] - prev[0]
        dk = current[1] - prev[1]
        du = current[2] - prev[2]
        total = dk + du
        if total <= 0:
            return 0.0
        busy = max(0, total - di)
        return round(min(100.0, (busy * 100.0) / total), 1)

    @staticmethod
    def _memory_info() -> dict[str, Any]:
        if os.name != "nt":
            return {"percent": 0.0, "total_gb": 0.0, "used_gb": 0.0, "available_gb": 0.0}
        mem = _MEMORYSTATUSEX()
        mem.dwLength = ctypes.sizeof(mem)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem))
        total_gb = mem.ullTotalPhys / (1024**3)
        avail_gb = mem.ullAvailPhys / (1024**3)
        used_gb = max(0.0, total_gb - avail_gb)
        return {
            "percent": float(mem.dwMemoryLoad),
            "total_gb": round(total_gb, 2),
            "used_gb": round(used_gb, 2),
            "available_gb": round(avail_gb, 2),
        }

    @staticmethod
    def _uptime_seconds() -> int:
        if os.name == "nt":
            ms = ctypes.windll.kernel32.GetTickCount64()
            return int(ms // 1000)
        return 0

    def snapshot(self) -> dict[str, Any]:
        cpu_pct = self._cpu_percent()
        mem = self._memory_info()
        drive = os.path.splitdrive(os.getcwd())[0] or "C:"
        disk = shutil.disk_usage(drive + "\\")
        disk_total_gb = round(disk.total / (1024**3), 1)
        disk_used_gb = round(disk.used / (1024**3), 1)
        disk_pct = round((disk.used * 100.0) / disk.total, 1) if disk.total else 0.0

        now_ts = time.time()
        point = {
            "timestamp": now_ts,
            "cpu_percent": cpu_pct,
            "ram_percent": mem["percent"],
        }
        self._history.append(point)

        return {
            "timestamp": now_ts,
            "cpu_percent": cpu_pct,
            "cpu_cores_logical": os.cpu_count() or 1,
            "memory": mem,
            "disk": {
                "drive": drive,
                "percent": disk_pct,
                "used_gb": disk_used_gb,
                "total_gb": disk_total_gb,
            },
            "system": {
                "hostname": socket.gethostname(),
                "os": f"{platform.system()} {platform.release()}",
                "os_version": platform.version(),
                "architecture": platform.machine(),
                "processor": platform.processor() or "x86_64",
                "python_version": platform.python_version(),
                "uptime_seconds": self._uptime_seconds(),
                "backend_uptime_seconds": int(now_ts - self._start_time),
                "executable": sys.executable,
            },
            "history": list(self._history),
        }
