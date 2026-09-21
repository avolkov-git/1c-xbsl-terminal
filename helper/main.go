package main

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

type message struct {
	Type  string   `json:"type"`
	Shell string   `json:"shell"`
	Args  []string `json:"args"`
	Cwd   string   `json:"cwd"`
	Data  string   `json:"data"`
	Cols  int      `json:"cols"`
	Rows  int      `json:"rows"`
}
type terminal interface {
	io.ReadWriteCloser
	Resize(int, int) error
	Wait() int
	Pid() int
}

var outputMu sync.Mutex

func emit(value any) {
	outputMu.Lock()
	defer outputMu.Unlock()
	_ = json.NewEncoder(os.Stdout).Encode(value)
}
func dimensions(m message) bool { return m.Cols >= 2 && m.Cols <= 1000 && m.Rows >= 1 && m.Rows <= 500 }
func main()                     { os.Exit(run()) }
func run() int {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 4096), 256*1024)
	if !scanner.Scan() {
		return 1
	}
	var first message
	if json.Unmarshal(scanner.Bytes(), &first) != nil || first.Type != "start" || !filepath.IsAbs(first.Shell) || !filepath.IsAbs(first.Cwd) || !dimensions(first) {
		emit(map[string]any{"type": "error", "message": "Invalid start request"})
		return 1
	}
	p, err := start(first)
	if err != nil {
		emit(map[string]any{"type": "error", "message": fmt.Sprint(err)})
		return 1
	}
	var closeOnce sync.Once
	closeTerminal := func() { closeOnce.Do(func() { _ = p.Close() }) }
	defer closeTerminal()
	emit(map[string]any{"type": "ready", "pid": p.Pid()})
	drained := make(chan struct{})
	go func() {
		defer close(drained)
		buf := make([]byte, 16384)
		for {
			n, e := p.Read(buf)
			if n > 0 {
				emit(map[string]any{"type": "data", "data": base64.StdEncoding.EncodeToString(buf[:n])})
			}
			if e != nil {
				return
			}
		}
	}()
	inputDone := make(chan struct{})
	go func() {
		defer close(inputDone)
		for scanner.Scan() {
			var m message
			if json.Unmarshal(scanner.Bytes(), &m) != nil {
				return
			}
			switch m.Type {
			case "input":
				b, e := base64.StdEncoding.DecodeString(m.Data)
				if e != nil || len(b) > 32768 {
					return
				}
				if _, e = p.Write(b); e != nil {
					return
				}
			case "resize":
				if !dimensions(m) {
					return
				}
				if p.Resize(m.Cols, m.Rows) != nil {
					return
				}
			case "close":
				return
			default:
				return
			}
		}
	}()
	exited := make(chan int, 1)
	go func() { exited <- p.Wait() }()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)
	code := 0
	select {
	case code = <-exited:
	case <-inputDone:
		closeTerminal()
		select {
		case code = <-exited:
		case <-time.After(time.Second):
			code = 130
		}
	case <-signals:
		closeTerminal()
		code = 130
	}
	select {
	case <-drained:
	case <-time.After(150 * time.Millisecond):
		closeTerminal()
	}
	emit(map[string]any{"type": "exit", "code": code})
	return 0
}
