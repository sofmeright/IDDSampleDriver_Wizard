package core

// OperationType identifies what an operation ensures.
// All operations are idempotent — safe to retry.
type OperationType string

const (
	OpEnsureDriverInstalled OperationType = "ensure_driver_installed"
	OpEnsureDriverAbsent    OperationType = "ensure_driver_absent"
	OpEnsureDriverReloaded  OperationType = "ensure_driver_reloaded"
	OpEnsureConfigApplied   OperationType = "ensure_config_applied"
	OpEnsureBackupCreated   OperationType = "ensure_backup_created"
	OpEnsureBackupRestored  OperationType = "ensure_backup_restored"
)

// Operation is a single planned unit of work.
// Created by the engine planner, executed by the backend.
type Operation struct {
	ID      string        // correlation ID for tracking/logging/progress
	Type    OperationType
	Payload any           // type-specific data (DriverPackage, DisplayConfig, etc.)
	Reason  string        // why this operation was planned
}

// Plan is an ordered set of operations to reconcile current → desired state.
type Plan struct {
	Operations []Operation
	Warnings   []string // non-blocking issues detected during planning
}

// Result is the outcome of executing a single operation.
type Result struct {
	OperationID string
	Type        OperationType
	Success     bool
	Message     string
	Error       error
}
