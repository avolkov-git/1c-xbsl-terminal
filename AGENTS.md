# 1C XBSL Terminal

Work only in this repository. Read README.md and docs/architecture.md before changes.
External Node VS Code plugin, API baseline 1.97.0. Never patch Element/vendor/configs.
The owner explicitly selected an independent Bash process from the Node extension
host, rather than the host's restricted Terminal API. Keep that boundary documented.
No network listeners, telemetry, auto-start, shell installation or remote code loading.
Use server OS/arch; ship verified PTY helpers, never npm/go installation on Element.
Test process lifecycle, framing, resize, cancellation and Webview input validation.
Keep XBSL publisher metadata and licenses accurate; do not claim untested native
platforms work. No commit/push/deploy/publication without a direct request.
