package core

// DesiredState represents the operator's declared intent.
// Consumers (CLI, API, UI) construct this. Engine diffs against CurrentState.
// nil fields mean "don't touch" — only non-nil fields trigger operations.
type DesiredState struct {
	Driver   *DriverSpec    // nil = don't touch driver
	Displays []DisplaySpec  // desired display configuration
	Config   *DisplayConfig // nil = don't touch config
}

// DriverSpec declares the desired driver state.
type DriverSpec struct {
	Installed bool           // true = ensure installed, false = ensure removed
	Package   *DriverPackage // source for installation (nil if removing)
}

// DisplaySpec declares the desired state of a single display.
type DisplaySpec struct {
	MonitorCount int
	Resolutions  []Resolution
}
