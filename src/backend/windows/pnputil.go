package windows

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// pnputilPath resolves the path to pnputil.exe.
func pnputilPath() string {
	sysRoot := os.Getenv("SystemRoot")
	if sysRoot == "" {
		sysRoot = `C:\Windows`
	}
	system32 := filepath.Join(sysRoot, "System32", "pnputil.exe")
	if _, err := os.Stat(system32); err == nil {
		return system32
	}
	sysnative := filepath.Join(sysRoot, "Sysnative", "pnputil.exe")
	if _, err := os.Stat(sysnative); err == nil {
		return sysnative
	}
	return "pnputil.exe"
}

// pnputilAttempt tries multiple arg sets for a pnputil operation.
// Returns true if any attempt succeeds (exit code 0).
func pnputilAttempt(ctx context.Context, argSets [][]string, timeoutSec int) (bool, error) {
	pnp := pnputilPath()
	for _, args := range argSets {
		r, err := runExe(ctx, pnp, args, timeoutSec)
		if err != nil {
			return false, err
		}
		if r.Code == 0 {
			return true, nil
		}
	}
	return false, nil
}

// pnputilAddDriver adds a driver INF to the driver store.
func pnputilAddDriver(ctx context.Context, infPath string) error {
	ok, err := pnputilAttempt(ctx, [][]string{
		{"/add-driver", infPath, "/install"},
	}, 60)
	if err != nil {
		return fmt.Errorf("pnputil add-driver: %w", err)
	}
	if !ok {
		return fmt.Errorf("pnputil add-driver failed for %s", infPath)
	}
	return nil
}

// pnputilUpdateDriver binds a driver to matching devices.
func pnputilUpdateDriver(ctx context.Context, infPath string) error {
	_, err := pnputilAttempt(ctx, [][]string{
		{"/update-driver", infPath, "/install"},
	}, 60)
	return err
}

// pnputilScanDevices triggers a device enumeration scan.
func pnputilScanDevices(ctx context.Context) error {
	_, err := pnputilAttempt(ctx, [][]string{
		{"/scan-devices"},
	}, 30)
	return err
}

// pnputilRemoveDevice removes a device instance by PnP instance ID.
func pnputilRemoveDevice(ctx context.Context, instanceID string) error {
	_, err := pnputilAttempt(ctx, [][]string{
		{"/remove-device", "/instanceid", instanceID},
		{"/remove-device", instanceID},
	}, 20)
	return err
}

// pnputilRestartDevice restarts a device instance.
func pnputilRestartDevice(ctx context.Context, instanceID string) error {
	_, err := pnputilAttempt(ctx, [][]string{
		{"/restart-device", "/instanceid", instanceID},
		{"/restart-device", instanceID},
	}, 20)
	return err
}

// pnputilEnableDevice enables a disabled device.
func pnputilEnableDevice(ctx context.Context, instanceID string) error {
	_, err := pnputilAttempt(ctx, [][]string{
		{"/enable-device", "/instanceid", instanceID},
		{"/enable-device", instanceID},
	}, 30)
	return err
}

// pnputilDisableDevice disables a device.
func pnputilDisableDevice(ctx context.Context, instanceID string) error {
	_, err := pnputilAttempt(ctx, [][]string{
		{"/disable-device", "/instanceid", instanceID},
		{"/disable-device", instanceID},
	}, 30)
	return err
}

// pnputilDeleteDriver removes a driver package from the store.
func pnputilDeleteDriver(ctx context.Context, publishedName string) error {
	ok, err := pnputilAttempt(ctx, [][]string{
		{"/delete-driver", publishedName, "/uninstall", "/force"},
	}, 60)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("pnputil delete-driver failed for %s", publishedName)
	}
	return nil
}

var publishedInfRe = regexp.MustCompile(`Published Name:\s*(oem\d+\.inf)`)

// pnputilFindPublishedInf finds the published OEM name for MttVDD.inf.
func pnputilFindPublishedInf(ctx context.Context) (string, error) {
	pnp := pnputilPath()
	r, err := runExe(ctx, pnp, []string{"/enum-drivers"}, 30)
	if err != nil {
		return "", err
	}

	text := r.Stdout + "\n" + r.Stderr
	blocks := strings.Split(text, "\n\n")
	for _, block := range blocks {
		if strings.Contains(strings.ToLower(block), "mttvdd.inf") {
			if m := publishedInfRe.FindStringSubmatch(block); len(m) > 1 {
				return m[1], nil
			}
		}
	}
	return "", nil
}
