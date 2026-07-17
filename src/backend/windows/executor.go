package windows

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/PrPlanIT/DisplayWizard/src/core"
)

// Backend implements the Backend interface for Windows.
// Uses pnputil, nefconw, PowerShell/CIM for driver and display management.
// Handles UAC elevation internally — consumers never see it.
type Backend struct{}

// New creates a Windows backend.
func New() *Backend {
	return &Backend{}
}

// Discover returns the current system state.
func (b *Backend) Discover(ctx context.Context) (*core.CurrentState, error) {
	driver, err := discoverDriverState(ctx)
	if err != nil {
		return nil, fmt.Errorf("driver discovery: %w", err)
	}

	gpus, err := discoverGPUs(ctx)
	if err != nil {
		return nil, fmt.Errorf("GPU discovery: %w", err)
	}

	cfg, err := LoadConfigXML()
	if err != nil {
		return nil, fmt.Errorf("config discovery: %w", err)
	}

	backups, err := discoverBackups()
	if err != nil {
		return nil, fmt.Errorf("backup discovery: %w", err)
	}

	return &core.CurrentState{
		Driver:  driver,
		GPUs:    gpus,
		Config:  cfg,
		Backups: backups,
	}, nil
}

// Execute runs a single planned operation.
// Handles elevation internally — returns an error result if privileges are insufficient.
func (b *Backend) Execute(ctx context.Context, op core.Operation) core.Result {
	switch op.Type {
	case core.OpEnsureDriverInstalled:
		return b.ensureDriverInstalled(ctx, op)
	case core.OpEnsureDriverAbsent:
		return b.ensureDriverAbsent(ctx, op)
	case core.OpEnsureDriverReloaded:
		return b.ensureDriverReloaded(ctx, op)
	case core.OpEnsureConfigApplied:
		return b.ensureConfigApplied(ctx, op)
	case core.OpEnsureBackupCreated:
		return b.ensureBackupCreated(ctx, op)
	case core.OpEnsureBackupRestored:
		return b.ensureBackupRestored(ctx, op)
	default:
		return core.Result{
			OperationID: op.ID,
			Type:        op.Type,
			Success:     false,
			Error:       fmt.Errorf("unknown operation type: %s", op.Type),
		}
	}
}

// requireAdmin gates a privileged operation on elevation.
//
//   - Already elevated: returns nil so the caller performs the real work inline.
//   - Not elevated: relaunches this operation in an elevated child process via
//     UAC (Elevate) and returns a *core.Result reflecting that child's outcome,
//     short-circuiting the inline work in this unprivileged process.
//
// The elevated child runs `dwiz __elevated-op <type>`, where requireAdmin sees
// an elevated token and returns nil — so the real work executes there, once.
func (b *Backend) requireAdmin(ctx context.Context, op core.Operation) *core.Result {
	elevated, err := IsElevated()
	if err != nil {
		return &core.Result{OperationID: op.ID, Type: op.Type, Error: fmt.Errorf("elevation check: %w", err)}
	}
	if elevated {
		return nil
	}

	if err := Elevate(ctx, "__elevated-op", string(op.Type)); err != nil {
		if errors.Is(err, ErrElevationDeclined) {
			return &core.Result{OperationID: op.ID, Type: op.Type, Success: false, Error: fmt.Errorf("administrator elevation was declined")}
		}
		return &core.Result{OperationID: op.ID, Type: op.Type, Success: false, Error: fmt.Errorf("elevated operation failed: %w", err)}
	}
	return &core.Result{OperationID: op.ID, Type: op.Type, Success: true, Message: fmt.Sprintf("%s completed (elevated)", op.Type)}
}

func (b *Backend) ensureDriverInstalled(ctx context.Context, op core.Operation) core.Result {
	fail := func(err error) core.Result {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: err}
	}

	if r := b.requireAdmin(ctx, op); r != nil {
		return *r
	}

	// 1. Ensure driver files are staged
	if _, err := os.Stat(driverINF); os.IsNotExist(err) {
		if err := ensureDriverHome(ctx); err != nil {
			return fail(fmt.Errorf("staging driver files: %w", err))
		}
	}

	// 2. Set registry overrides
	ensureRegistryOverrides(ctx)

	// 3. Parse INF metadata
	meta, _ := ParseINF(driverINF)
	hwid := canonHWID(meta.HWID)

	// 4. Add INF to driver store
	if err := pnputilAddDriver(ctx, driverINF); err != nil {
		return fail(err)
	}

	// 5. Create device node if needed
	ids, _ := discoverInstanceIDs(ctx)
	if len(ids) == 0 {
		if err := nefconCreateDeviceNode(ctx, hwid, meta.ClassName, meta.ClassGuid); err != nil {
			// Non-fatal — try to continue
			_ = err
		}
		pnputilScanDevices(ctx)

		// Wait for device to appear
		for i := 0; i < 20; i++ {
			time.Sleep(500 * time.Millisecond)
			ids, _ = discoverInstanceIDs(ctx)
			if len(ids) > 0 {
				break
			}
		}
	}

	// 6. Bind driver to device
	pnputilUpdateDriver(ctx, driverINF)
	nefconInstallDriver(ctx, driverINF)

	// 7. Scan and wait for binding
	pnputilScanDevices(ctx)
	time.Sleep(800 * time.Millisecond)

	// Wait for device to be detected
	for i := 0; i < 20; i++ {
		state, _ := discoverDriverState(ctx)
		if state.Installed {
			return core.Result{OperationID: op.ID, Type: op.Type, Success: true, Message: "driver installed and bound"}
		}
		time.Sleep(600 * time.Millisecond)
	}

	return core.Result{OperationID: op.ID, Type: op.Type, Success: true, Message: "driver install completed (binding may be pending)"}
}

func (b *Backend) ensureDriverAbsent(ctx context.Context, op core.Operation) core.Result {
	fail := func(err error) core.Result {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: err}
	}

	if r := b.requireAdmin(ctx, op); r != nil {
		return *r
	}

	// Remove device instances
	ids, _ := discoverInstanceIDs(ctx)
	for _, id := range ids {
		pnputilRemoveDevice(ctx, id)
	}

	// Remove driver from store
	published, err := pnputilFindPublishedInf(ctx)
	if err != nil {
		return fail(err)
	}
	if published != "" {
		if err := pnputilDeleteDriver(ctx, published); err != nil {
			return fail(err)
		}
	}

	return core.Result{OperationID: op.ID, Type: op.Type, Success: true, Message: "driver removed"}
}

func (b *Backend) ensureDriverReloaded(ctx context.Context, op core.Operation) core.Result {
	if r := b.requireAdmin(ctx, op); r != nil {
		return *r
	}

	ids, _ := discoverInstanceIDs(ctx)
	if len(ids) == 0 {
		return core.Result{OperationID: op.ID, Type: op.Type, Success: false, Error: fmt.Errorf("no device instances found to restart")}
	}

	for _, id := range ids {
		pnputilRestartDevice(ctx, id)
	}

	return core.Result{OperationID: op.ID, Type: op.Type, Success: true, Message: fmt.Sprintf("restarted %d device(s)", len(ids))}
}

func (b *Backend) ensureConfigApplied(ctx context.Context, op core.Operation) core.Result {
	cfg, ok := op.Payload.(*core.DisplayConfig)
	if !ok {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: fmt.Errorf("payload is not *DisplayConfig")}
	}

	if err := SaveConfigXML(cfg); err != nil {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: err}
	}

	return core.Result{OperationID: op.ID, Type: op.Type, Success: true, Message: "config applied"}
}

func (b *Backend) ensureBackupCreated(ctx context.Context, op core.Operation) core.Result {
	name, ok := op.Payload.(string)
	if !ok || name == "" {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: fmt.Errorf("backup name required")}
	}

	cfg, err := LoadConfigXML()
	if err != nil {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: err}
	}

	dir, err := BackupDir()
	if err != nil {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: err}
	}

	xml := renderConfigXML(cfg)
	path := filepath.Join(dir, fmt.Sprintf("vdd_settings.xml.%s.backup", name))
	if err := os.WriteFile(path, []byte(xml), 0o644); err != nil {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: err}
	}

	return core.Result{OperationID: op.ID, Type: op.Type, Success: true, Message: fmt.Sprintf("backup %q created", name)}
}

func (b *Backend) ensureBackupRestored(ctx context.Context, op core.Operation) core.Result {
	name, ok := op.Payload.(string)
	if !ok || name == "" {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: fmt.Errorf("backup name required")}
	}

	dir, err := BackupDir()
	if err != nil {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: err}
	}

	path := filepath.Join(dir, fmt.Sprintf("vdd_settings.xml.%s.backup", name))
	data, err := os.ReadFile(path)
	if err != nil {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: fmt.Errorf("backup %q not found: %w", name, err)}
	}

	cfg, err := parseConfigXML(string(data))
	if err != nil {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: err}
	}

	if err := SaveConfigXML(cfg); err != nil {
		return core.Result{OperationID: op.ID, Type: op.Type, Error: err}
	}

	return core.Result{OperationID: op.ID, Type: op.Type, Success: true, Message: fmt.Sprintf("backup %q restored", name)}
}

// ensureDriverHome downloads and stages driver files if missing.
func ensureDriverHome(ctx context.Context) error {
	if _, err := os.Stat(driverINF); err == nil {
		return nil // already staged
	}

	os.MkdirAll(sysDir, 0o755)

	url := "https://github.com/VirtualDrivers/Virtual-Display-Driver/releases/download/25.7.23/VirtualDisplayDriver-x86.Driver.Only.zip"
	home, _ := os.UserHomeDir()
	tmpDir := filepath.Join(home, "AppData", "Local", "DisplayWizard", "VDD_Download")
	zip := strings.ReplaceAll(filepath.Join(tmpDir, "VirtualDisplayDriver.zip"), `\`, `/`)

	script := fmt.Sprintf(`
		$tmpDir = '%s'
		New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
		Invoke-WebRequest -UseBasicParsing -OutFile '%s' -Uri '%s'
		Expand-Archive -LiteralPath '%s' -DestinationPath $tmpDir -Force
		$src = Join-Path $tmpDir 'VirtualDisplayDriver'
		if (Test-Path $src) { Copy-Item "$src\*" -Destination '%s' -Recurse -Force }
		else { Copy-Item "$tmpDir\*" -Destination '%s' -Recurse -Force }
		Remove-Item -Recurse -Force $tmpDir
	`, escPS(tmpDir), escPS(zip), escPS(url), escPS(zip), escPS(sysDir), escPS(sysDir))

	r, err := ps(ctx, script)
	if err != nil {
		return err
	}
	if r.Code != 0 {
		return fmt.Errorf("driver download failed: %s", r.Stderr)
	}

	if _, err := os.Stat(driverINF); err != nil {
		return fmt.Errorf("driver INF not found after staging")
	}
	return nil
}

// ensureRegistryOverrides sets the registry key so the driver finds vdd_settings.xml.
func ensureRegistryOverrides(ctx context.Context) {
	script := fmt.Sprintf(`
		$path = 'HKLM:\SOFTWARE\MikeTheTech\VirtualDisplayDriver'
		if (-not (Test-Path $path)) { New-Item -Path 'HKLM:\SOFTWARE\MikeTheTech' -Name 'VirtualDisplayDriver' -Force | Out-Null }
		New-ItemProperty -Path $path -Name 'VDDPATH' -PropertyType String -Value '%s' -Force | Out-Null
	`, escPS(sysDir))
	ps(ctx, script)
}
