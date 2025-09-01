package main

import (
	"log"
	"net/http"
)

func main(){
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request){
		w.WriteHeader(200); w.Write([]byte("ok"))
	})
	addr := ":5757"
	log.Printf("api listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
