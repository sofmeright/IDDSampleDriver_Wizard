package api

import (
	"encoding/json"
	"net/http"
)

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	state, err := s.engine.Status(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

func (s *Server) handleGPUs(w http.ResponseWriter, r *http.Request) {
	state, err := s.engine.Status(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state.GPUs)
}
