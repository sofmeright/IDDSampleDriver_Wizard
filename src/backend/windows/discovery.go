package windows

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/PrPlanIT/DisplayWizard/src/core"
)

// discoverDriverState queries the driver state via CIM.
func discoverDriverState(ctx context.Context) (core.DriverState, error) {
	meta, _ := ParseINF(driverINF)

	hwidUpper := strings.ToUpper(canonHWID(meta.HWID))
	script := fmt.Sprintf(`
		try {
			$devs = Get-CimInstance Win32_PnPEntity -ErrorAction Stop |
				Where-Object { $_.PNPDeviceID -and $_.PNPDeviceID.ToUpper().StartsWith('%s') } |
				Select-Object PNPDeviceID, ConfigManagerErrorCode
		} catch { $devs = @() }

		if (-not $devs -or $devs.Count -eq 0) { 'not-detected' }
		elseif ($devs | Where-Object { $_.ConfigManagerErrorCode -eq 22 }) { 'stopped' }
		else { 'running' }
	`, escPS(hwidUpper))

	r, err := ps(ctx, script)
	if err != nil {
		return core.DriverState{}, fmt.Errorf("driver state query: %w", err)
	}

	raw := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(r.Stdout, "\"", ""), "'", ""))

	state := core.DriverState{HWID: meta.HWID}
	switch raw {
	case "running":
		state.Installed = true
		state.Running = true
	case "stopped":
		state.Installed = true
		state.Running = false
	default:
		// not-detected — check if INF exists in driver store
		if _, err := os.Stat(driverINF); err == nil {
			state.Installed = true // files present but device not bound
		}
	}

	return state, nil
}

// discoverGPUs lists non-virtual GPUs via CIM.
func discoverGPUs(ctx context.Context) ([]core.GPU, error) {
	r, err := ps(ctx, `Get-CimInstance -ClassName Win32_VideoController | Select-Object Name, DeviceID, AdapterCompatibility | ConvertTo-Json -Compress`)
	if err != nil {
		return nil, fmt.Errorf("GPU query: %w", err)
	}

	type cimGPU struct {
		Name                 string `json:"Name"`
		DeviceID             string `json:"DeviceID"`
		AdapterCompatibility string `json:"AdapterCompatibility"`
	}

	var raw []cimGPU
	stdout := strings.TrimSpace(r.Stdout)
	if stdout == "" {
		return nil, nil
	}
	// PowerShell returns a single object (not array) when there's only one result
	if strings.HasPrefix(stdout, "{") {
		var single cimGPU
		if err := json.Unmarshal([]byte(stdout), &single); err == nil {
			raw = []cimGPU{single}
		}
	} else {
		json.Unmarshal([]byte(stdout), &raw)
	}

	banned := []string{"iddsampledriver", "microsoft remote display adapter",
		"parsec virtual display adapter", "virtual display with hdr"}

	var gpus []core.GPU
	for _, g := range raw {
		skip := false
		for _, b := range banned {
			if strings.Contains(strings.ToLower(g.Name), b) {
				skip = true
				break
			}
		}
		if skip {
			continue
		}
		gpus = append(gpus, core.GPU{
			Name:     g.Name,
			DeviceID: g.DeviceID,
			Vendor:   g.AdapterCompatibility,
		})
	}

	return gpus, nil
}

// discoverInstanceIDs returns PnP instance IDs for the VDD device.
func discoverInstanceIDs(ctx context.Context) ([]string, error) {
	meta, _ := ParseINF(driverINF)
	hwidUpper := strings.ToUpper(canonHWID(meta.HWID))

	script := fmt.Sprintf(`
		$ids = @()
		try {
			$ids = Get-CimInstance Win32_PnPEntity -ErrorAction Stop |
				Where-Object { $_.PNPDeviceID -and $_.PNPDeviceID.ToUpper().StartsWith('%s') } |
				Select-Object -ExpandProperty PNPDeviceID
		} catch { }
		$ids | Select-Object -Unique | ConvertTo-Json -Compress
	`, escPS(hwidUpper))

	r, err := ps(ctx, script)
	if err != nil {
		return nil, err
	}

	stdout := strings.TrimSpace(r.Stdout)
	if stdout == "" || stdout == "null" {
		return nil, nil
	}

	var ids []string
	if strings.HasPrefix(stdout, "[") {
		json.Unmarshal([]byte(stdout), &ids)
	} else {
		var single string
		if json.Unmarshal([]byte(stdout), &single) == nil && single != "" {
			ids = []string{single}
		}
	}

	return ids, nil
}

// discoverBackups lists available configuration backups.
func discoverBackups() ([]core.Backup, error) {
	dir, err := BackupDir()
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	seen := map[string]bool{}
	var backups []core.Backup
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		// Format: vdd_settings.xml.<name>.backup
		name := e.Name()
		parts := strings.SplitN(name, ".", 4)
		if len(parts) >= 4 && parts[len(parts)-1] == "backup" {
			bname := parts[len(parts)-2]
			if !seen[bname] {
				seen[bname] = true
				backups = append(backups, core.Backup{
					Name: bname,
					Path: filepath.Join(dir, name),
				})
			}
		}
	}

	return backups, nil
}
