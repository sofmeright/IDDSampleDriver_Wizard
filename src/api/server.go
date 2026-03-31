package api

import (
	"fmt"
	"log"
	"net/http"

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
	mux := http.NewServeMux()
	s.registerRoutes(mux)

	log.Printf("DisplayWizard API listening on %s", s.addr)
	return http.ListenAndServe(s.addr, mux)
}

// Handler returns the HTTP handler for embedding (e.g., testing).
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	s.registerRoutes(mux)
	return mux
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
