package backend

import (
	"context"

	"github.com/PrPlanIT/DisplayWizard/src/core"
)

// Backend is the OS-specific executor interface.
// Two responsibilities only: discover reality + execute operations.
// Never decides WHAT to do — only HOW.
// Handles elevation internally per-operation — consumers never see it.
//
// Implementations: windows, linux (future).
type Backend interface {
	// Discover returns the current system state.
	// Raw OS data normalized into domain types.
	Discover(ctx context.Context) (*core.CurrentState, error)

	// Execute runs a single planned operation.
	// Handles privilege escalation internally per-operation.
	Execute(ctx context.Context, op core.Operation) core.Result
}
