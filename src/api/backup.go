package api

import (
	"encoding/json"
	"net/http"

	"github.com/PrPlanIT/DisplayWizard/src/core"
)

func (s *Server) handleBackupList(w http.ResponseWriter, r *http.Request) {
	state, err := s.engine.Status(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state.Backups)
}

type backupRequest struct {
	Name string `json:"name"`
}

func (s *Server) handleBackupCreate(w http.ResponseWriter, r *http.Request) {
	var req backupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	desired := core.DesiredState{
		Backup: &core.BackupSpec{Create: req.Name},
	}

	results, err := s.engine.Reconcile(r.Context(), desired)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (s *Server) handleBackupRestore(w http.ResponseWriter, r *http.Request) {
	var req backupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	desired := core.DesiredState{
		Backup: &core.BackupSpec{Restore: req.Name},
	}

	results, err := s.engine.Reconcile(r.Context(), desired)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
