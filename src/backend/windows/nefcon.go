package windows

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// nefconwPath returns the path to nefconw.exe if it exists, or empty string.
func nefconwPath() string {
	// Check alongside the binary first, then in bin/ relative to executable.
	exe, err := os.Executable()
	if err == nil {
		p := filepath.Join(filepath.Dir(exe), "nefconw.exe")
		if _, err := os.Stat(p); err == nil {
			return p
		}
		p = filepath.Join(filepath.Dir(exe), "bin", "nefconw.exe")
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	// Check working directory bin/
	if _, err := os.Stat("bin/nefconw.exe"); err == nil {
		return "bin/nefconw.exe"
	}
	return ""
}

// nefconCreateDeviceNode creates a PnP device node using nefconw.
func nefconCreateDeviceNode(ctx context.Context, hwid, className, classGuid string) error {
	nef := nefconwPath()
	if nef == "" {
		return fmt.Errorf("nefconw.exe not found")
	}

	r, err := runExe(ctx, nef, []string{
		"--create-device-node",
		"--hardware-id", hwid,
		"--class-name", className,
		"--class-guid", classGuid,
	}, 30)
	if err != nil {
		return fmt.Errorf("nefconw create-device-node: %w", err)
	}
	if r.Code != 0 {
		return fmt.Errorf("nefconw create-device-node failed (code %d): %s", r.Code, r.Stderr)
	}
	return nil
}

// nefconInstallDriver binds a driver via nefconw.
func nefconInstallDriver(ctx context.Context, infPath string) error {
	nef := nefconwPath()
	if nef == "" {
		return fmt.Errorf("nefconw.exe not found")
	}

	// --install-driver
	r, err := runExe(ctx, nef, []string{"--install-driver", "--inf-path", infPath}, 30)
	if err != nil {
		return fmt.Errorf("nefconw install-driver: %w", err)
	}
	_ = r // best-effort, some INFs don't support this path

	// --inf-default-install (harmless if redundant)
	r2, err := runExe(ctx, nef, []string{"--inf-default-install", "--inf-path", infPath}, 30)
	if err != nil {
		return fmt.Errorf("nefconw inf-default-install: %w", err)
	}
	_ = r2

	return nil
}
