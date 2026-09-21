//go:build windows

package main

import (
	"context"
	"github.com/UserExistsError/conpty"
	"golang.org/x/sys/windows"
	"os"
	"strings"
	"syscall"
	"unsafe"
)

type winTerminal struct {
	p   *conpty.ConPty
	job windows.Handle
}

func start(m message) (terminal, error) {
	// Put the helper and descendants in a job; helper death closes the last job
	// handle, terminating Bash/children even when the Node extension host disappears.
	job, e := windows.CreateJobObject(nil, nil)
	if e != nil {
		return nil, e
	}
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, e = windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); e != nil {
		windows.CloseHandle(job)
		return nil, e
	}
	if e = windows.AssignProcessToJobObject(job, windows.CurrentProcess()); e != nil {
		windows.CloseHandle(job)
		return nil, e
	}
	args := []string{syscall.EscapeArg(m.Shell)}
	for _, a := range m.Args {
		args = append(args, syscall.EscapeArg(a))
	}
	p, e := conpty.Start(strings.Join(args, " "), conpty.ConPtyWorkDir(m.Cwd), conpty.ConPtyDimensions(m.Cols, m.Rows), conpty.ConPtyEnv(append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor", "CHERE_INVOKING=1")))
	if e != nil {
		return nil, e
	}
	return &winTerminal{p, job}, nil
}
func (p *winTerminal) Read(b []byte) (int, error)  { return p.p.Read(b) }
func (p *winTerminal) Write(b []byte) (int, error) { return p.p.Write(b) }
func (p *winTerminal) Resize(cols, rows int) error { return p.p.Resize(cols, rows) }
func (p *winTerminal) Pid() int                    { return p.p.Pid() }
func (p *winTerminal) Wait() int {
	c, e := p.p.Wait(context.Background())
	if e != nil {
		return 1
	}
	return int(c)
}
func (p *winTerminal) Close() error { return p.p.Close() }
