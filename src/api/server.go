package api

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"

	"github.com/PrPlanIT/DisplayWizard/src/engine"
)

// Server is the DisplayWizard HTTP API server.
type Server struct {
	engine *engine.Engine
	addr   string
}

// New creates a new API server.
func New(eng *engine.Engine, addr string) *Server {
	return &Server{engine: eng, addr: addr}
}

// ListenAndServe starts the HTTP server.
func (s *Server) ListenAndServe() error {
	log.Printf("DisplayWizard API listening on %s", s.addr)
	return http.ListenAndServe(s.addr, s.handler())
}

// Handler returns the HTTP handler for embedding (e.g., testing).
func (s *Server) Handler() http.Handler {
	return s.handler()
}

// handler builds the route mux wrapped in the loopback Host guard.
func (s *Server) handler() http.Handler {
	mux := http.NewServeMux()
	s.registerRoutes(mux)
	return guardLoopbackHost(mux)
}

// guardLoopbackHost rejects any request whose Host header is not a loopback
// name. The API is unauthenticated and can install drivers, so this is the
// defense against DNS-rebinding: a browser lured to a malicious page cannot
// drive the local API because its requests carry the attacker's Host, not
// localhost. Legitimate local clients always connect as 127.0.0.1/localhost/[::1].
//
// This pairs with binding loopback-only (see the serve command). Exposing the
// API on a routable address for remote use will require authentication first,
// at which point this guard is relaxed for the authenticated transport.
func guardLoopbackHost(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		host = strings.TrimSuffix(strings.TrimPrefix(host, "["), "]") // strip IPv6 brackets
		switch strings.ToLower(host) {
		case "localhost", "127.0.0.1", "::1":
			next.ServeHTTP(w, r)
		default:
			http.Error(w, "forbidden: non-loopback Host", http.StatusForbidden)
		}
	})
}

func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/status", s.handleStatus)
	mux.HandleFunc("POST /api/reconcile", s.handleReconcile)
	mux.HandleFunc("GET /api/gpus", s.handleGPUs)
	mux.HandleFunc("GET /api/backups", s.handleBackupList)
	mux.HandleFunc("POST /api/backups", s.handleBackupCreate)
	mux.HandleFunc("POST /api/backups/restore", s.handleBackupRestore)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, `{"status":"ok"}`)
}
