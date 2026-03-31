package engine

import (
	"context"

	"github.com/PrPlanIT/DisplayWizard/src/backend"
	"github.com/PrPlanIT/DisplayWizard/src/core"
)

// Engine is the reconciliation brain.
// Owns ALL decision-making: discovery normalization, planning, validation.
// Consumers (CLI, API, UI) interact only with Engine — never with Backend directly.
type Engine struct {
	backend backend.Backend
}

// New creates an Engine with the given backend.
func New(b backend.Backend) *Engine {
	return &Engine{backend: b}
}

// Status returns the current system state without changing anything.
func (e *Engine) Status(ctx context.Context) (*core.CurrentState, error) {
	return e.backend.Discover(ctx)
}

// Reconcile diffs current state against desired, plans operations, executes them.
func (e *Engine) Reconcile(ctx context.Context, desired core.DesiredState) ([]core.Result, error) {
	current, err := e.backend.Discover(ctx)
	if err != nil {
		return nil, err
	}

	plan := Plan(current, &desired)

	var results []core.Result
	for _, op := range plan.Operations {
		result := e.backend.Execute(ctx, op)
		results = append(results, result)
		if !result.Success {
			break // stop on first failure
		}
	}

	return results, nil
}

// Plan diffs current vs desired state and produces ordered operations.
func Plan(current *core.CurrentState, desired *core.DesiredState) core.Plan {
	var ops []core.Operation

	// Driver reconciliation
	if desired.Driver != nil {
		if desired.Driver.Installed && !current.Driver.Installed {
			ops = append(ops, core.Operation{
				Type:   core.OpEnsureDriverInstalled,
				Payload: desired.Driver.Package,
				Reason: "driver not installed, desired installed",
			})
		} else if !desired.Driver.Installed && current.Driver.Installed {
			ops = append(ops, core.Operation{
				Type:   core.OpEnsureDriverAbsent,
				Reason: "driver installed, desired absent",
			})
		}
	}

	// Config reconciliation
	if desired.Config != nil {
		ops = append(ops, core.Operation{
			Type:    core.OpEnsureConfigApplied,
			Payload: desired.Config,
			Reason:  "config change requested",
		})
	}

	return core.Plan{Operations: ops}
}
