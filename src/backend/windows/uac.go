//go:build windows

package windows

import (
	"context"
	"errors"
	"fmt"
	"os"
	"runtime"
	"strings"
	"syscall"
	"unsafe"
)

// ErrElevationDeclined is returned by Elevate when the user dismisses the UAC
// consent prompt (ShellExecuteEx fails with ERROR_CANCELLED). It is distinct
// from a non-zero exit of the elevated process, which means the operation ran
// but failed.
var ErrElevationDeclined = errors.New("administrator elevation was declined")

// Native Win32 entry points. Loaded lazily so importing this package never
// touches these DLLs unless elevation is actually exercised.
var (
	modadvapi32 = syscall.NewLazyDLL("advapi32.dll")
	modkernel32 = syscall.NewLazyDLL("kernel32.dll")
	modshell32  = syscall.NewLazyDLL("shell32.dll")

	procOpenProcessToken    = modadvapi32.NewProc("OpenProcessToken")
	procGetTokenInformation = modadvapi32.NewProc("GetTokenInformation")

	procGetCurrentProcess  = modkernel32.NewProc("GetCurrentProcess")
	procCloseHandle        = modkernel32.NewProc("CloseHandle")
	procWaitForSingleObj   = modkernel32.NewProc("WaitForSingleObject")
	procGetExitCodeProcess = modkernel32.NewProc("GetExitCodeProcess")

	procShellExecuteExW = modshell32.NewProc("ShellExecuteExW")
)

const (
	_TOKEN_QUERY      = 0x0008
	_TokenElevation   = 20 // TOKEN_INFORMATION_CLASS
	_SEE_MASK_NOCLOSE = 0x00000040
	_SW_HIDE          = 0
	_WAIT_OBJECT_0    = 0x00000000
	_WAIT_TIMEOUT     = 0x00000102
	_WAIT_FAILED      = 0xFFFFFFFF
	_ERROR_CANCELLED  = 1223
)

// tokenElevation mirrors TOKEN_ELEVATION: a single BOOL (nonzero = elevated).
type tokenElevation struct {
	TokenIsElevated uint32
}

// shellExecuteInfoW mirrors SHELLEXECUTEINFOW. Field order and padding match
// the Win32 struct exactly on amd64; cbSize is set from unsafe.Sizeof so the
// kernel sees the correct length. String fields are typed *uint16 so the GC
// keeps the UTF-16 buffers alive for the duration of the call.
type shellExecuteInfoW struct {
	cbSize       uint32
	fMask        uint32
	hwnd         uintptr
	lpVerb       *uint16
	lpFile       *uint16
	lpParameters *uint16
	lpDirectory  *uint16
	nShow        int32
	hInstApp     uintptr
	lpIDList     uintptr
	lpClass      *uint16
	hkeyClass    uintptr
	dwHotKey     uint32
	hIcon        uintptr
	hProcess     uintptr
}

// IsElevated reports whether the current process token is elevated, using a
// native token query (no PowerShell). It opens the current process token and
// reads TokenElevation.
func IsElevated() (bool, error) {
	curProc, _, _ := procGetCurrentProcess.Call()

	var token syscall.Handle
	ret, _, callErr := procOpenProcessToken.Call(
		curProc,
		_TOKEN_QUERY,
		uintptr(unsafe.Pointer(&token)),
	)
	if ret == 0 {
		return false, fmt.Errorf("OpenProcessToken: %w", callErr)
	}
	defer procCloseHandle.Call(uintptr(token))

	var elevation tokenElevation
	var retLen uint32
	ret, _, callErr = procGetTokenInformation.Call(
		uintptr(token),
		uintptr(_TokenElevation),
		uintptr(unsafe.Pointer(&elevation)),
		unsafe.Sizeof(elevation),
		uintptr(unsafe.Pointer(&retLen)),
	)
	if ret == 0 {
		return false, fmt.Errorf("GetTokenInformation(TokenElevation): %w", callErr)
	}

	return elevation.TokenIsElevated != 0, nil
}

// Elevate relaunches THIS executable with the given arguments under a fresh
// elevated token via ShellExecuteEx + the "runas" verb, waits for it to exit,
// and maps the outcome:
//
//   - nil               → elevated process exited 0 (success)
//   - ErrElevationDeclined → user dismissed the UAC prompt (ERROR_CANCELLED)
//   - other error       → launch failed, or the process exited non-zero
//
// The child window is hidden (SW_HIDE); the parent blocks until it completes,
// honoring cancellation of ctx.
func Elevate(ctx context.Context, args ...string) error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve executable path: %w", err)
	}

	verbPtr, err := syscall.UTF16PtrFromString("runas")
	if err != nil {
		return fmt.Errorf("encode verb: %w", err)
	}
	exePtr, err := syscall.UTF16PtrFromString(exe)
	if err != nil {
		return fmt.Errorf("encode executable path: %w", err)
	}

	var paramPtr *uint16
	if cmdline := buildCommandLine(args); cmdline != "" {
		paramPtr, err = syscall.UTF16PtrFromString(cmdline)
		if err != nil {
			return fmt.Errorf("encode arguments: %w", err)
		}
	}

	sei := shellExecuteInfoW{
		fMask:        _SEE_MASK_NOCLOSE,
		lpVerb:       verbPtr,
		lpFile:       exePtr,
		lpParameters: paramPtr,
		nShow:        _SW_HIDE,
	}
	sei.cbSize = uint32(unsafe.Sizeof(sei))

	ret, _, callErr := procShellExecuteExW.Call(uintptr(unsafe.Pointer(&sei)))
	runtime.KeepAlive(sei)
	if ret == 0 {
		if en, ok := callErr.(syscall.Errno); ok && en == _ERROR_CANCELLED {
			return ErrElevationDeclined
		}
		return fmt.Errorf("ShellExecuteEx(runas): %w", callErr)
	}
	if sei.hProcess == 0 {
		return errors.New("ShellExecuteEx returned no process handle")
	}
	defer procCloseHandle.Call(sei.hProcess)

	// Block until the elevated process exits, polling so ctx cancellation is
	// observed even when the operation has no deadline.
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		waitRet, _, waitErr := procWaitForSingleObj.Call(sei.hProcess, 250)
		switch uint32(waitRet) {
		case _WAIT_OBJECT_0:
			// process exited — fall through to exit-code read
		case _WAIT_TIMEOUT:
			continue
		case _WAIT_FAILED:
			return fmt.Errorf("WaitForSingleObject: %w", waitErr)
		default:
			return fmt.Errorf("WaitForSingleObject returned unexpected 0x%x", waitRet)
		}
		break
	}

	var code uint32
	ret, _, callErr = procGetExitCodeProcess.Call(sei.hProcess, uintptr(unsafe.Pointer(&code)))
	if ret == 0 {
		return fmt.Errorf("GetExitCodeProcess: %w", callErr)
	}
	if code != 0 {
		return fmt.Errorf("elevated operation exited with code %d", code)
	}
	return nil
}

// buildCommandLine joins args into a single command-line string using the
// Windows CommandLineToArgvW quoting rules, so arguments survive the round-trip
// through ShellExecuteEx → the elevated process's argv.
func buildCommandLine(args []string) string {
	parts := make([]string, len(args))
	for i, a := range args {
		parts[i] = quoteArg(a)
	}
	return strings.Join(parts, " ")
}

// quoteArg quotes a single argument per the CommandLineToArgvW convention:
// wrap in double quotes when it contains whitespace, a quote, or is empty, and
// escape backslashes that precede a quote (or the closing quote).
func quoteArg(s string) string {
	if s != "" && !strings.ContainsAny(s, " \t\n\v\"") {
		return s
	}

	var b strings.Builder
	b.WriteByte('"')
	backslashes := 0
	for _, r := range s {
		switch r {
		case '\\':
			backslashes++
		case '"':
			// Escape all pending backslashes, then the quote.
			b.WriteString(strings.Repeat(`\`, backslashes*2+1))
			backslashes = 0
			b.WriteByte('"')
		default:
			if backslashes > 0 {
				b.WriteString(strings.Repeat(`\`, backslashes))
				backslashes = 0
			}
			b.WriteRune(r)
		}
	}
	// Double any trailing backslashes so they don't escape the closing quote.
	b.WriteString(strings.Repeat(`\`, backslashes*2))
	b.WriteByte('"')
	return b.String()
}
