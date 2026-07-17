//go:build !windows

package windows

import (
	"context"
	"errors"
)

// This file provides non-Windows stubs so the package compiles for every GOOS
// (`go build ./...`). The dwiz binary only ships for windows/amd64; on any other
// platform elevation is unsupported and these return errors rather than acting.

// ErrElevationDeclined mirrors the Windows sentinel so callers can reference it
// in cross-platform code.
var ErrElevationDeclined = errors.New("administrator elevation was declined")

// IsElevated is unsupported off Windows.
func IsElevated() (bool, error) {
	return false, errors.New("elevation detection is only supported on Windows")
}

// Elevate is unsupported off Windows.
func Elevate(ctx context.Context, args ...string) error {
	return errors.New("UAC elevation is only supported on Windows")
}
