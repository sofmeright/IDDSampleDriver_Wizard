package core

// DriverState represents the observed state of the display driver.
type DriverState struct {
	Installed bool
	Running   bool
	HWID      string // hardware ID from INF
	Version   string
}

// DriverPackage identifies a driver source for installation.
type DriverPackage struct {
	INFPath string // path to the .inf file
	HWID    string // hardware ID to bind
}
