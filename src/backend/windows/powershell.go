package windows

import (
	"bytes"
	"context"
	"os/exec"
	"strings"
	"time"
)

// ExecResult holds the output of a command execution.
type ExecResult struct {
	Code   int
	Stdout string
	Stderr string
}

// ps runs a PowerShell command and returns stdout/stderr/exit code.
func ps(ctx context.Context, command string) (ExecResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "powershell.exe",
		"-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	code := 0
	if exitErr, ok := err.(*exec.ExitError); ok {
		code = exitErr.ExitCode()
		err = nil // non-zero exit is not a Go error
	}

	return ExecResult{
		Code:   code,
		Stdout: stdout.String(),
		Stderr: stderr.String(),
	}, err
}

// runExe executes a binary with args and returns output.
func runExe(ctx context.Context, exe string, args []string, timeoutSec int) (ExecResult, error) {
	if timeoutSec <= 0 {
		timeoutSec = 30
	}
	ctx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSec)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, exe, args...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	code := 0
	if exitErr, ok := err.(*exec.ExitError); ok {
		code = exitErr.ExitCode()
		err = nil
	}

	return ExecResult{
		Code:   code,
		Stdout: stdout.String(),
		Stderr: stderr.String(),
	}, err
}

// escPS escapes a string for embedding in a PowerShell single-quoted string.
func escPS(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}
