//go:build linux || darwin

package main

import (
	"github.com/creack/pty"
	"os"
	"os/exec"
	"syscall"
	"time"
)

type unixTerminal struct {
	file *os.File
	cmd  *exec.Cmd
}

func start(m message) (terminal, error) {
	c := exec.Command(m.Shell, m.Args...)
	c.Dir = m.Cwd
	c.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	f, e := pty.StartWithSize(c, &pty.Winsize{Cols: uint16(m.Cols), Rows: uint16(m.Rows)})
	if e != nil {
		return nil, e
	}
	return &unixTerminal{f, c}, nil
}
func (p *unixTerminal) Read(b []byte) (int, error)  { return p.file.Read(b) }
func (p *unixTerminal) Write(b []byte) (int, error) { return p.file.Write(b) }
func (p *unixTerminal) Resize(cols, rows int) error {
	return pty.Setsize(p.file, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
}
func (p *unixTerminal) Pid() int { return p.cmd.Process.Pid }
func (p *unixTerminal) Wait() int {
	if e := p.cmd.Wait(); e != nil {
		if x, ok := e.(*exec.ExitError); ok {
			return x.ExitCode()
		}
		return 1
	}
	return 0
}
func (p *unixTerminal) Close() error {
	// HUP lets Bash notify its jobs; closing the master also releases the terminal.
	_ = p.cmd.Process.Signal(syscall.SIGHUP)
	e := p.file.Close()
	go func() { time.Sleep(300 * time.Millisecond); _ = p.cmd.Process.Kill() }()
	return e
}
