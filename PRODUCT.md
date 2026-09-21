# Product
<!-- impeccable:product-schema 1 -->
## Platform
web
## Users
Developers working inside 1C:Enterprise.Element IDE.
## Product Purpose
A simple interactive Bash terminal inside the IDE, comparable to VS Code.
## Operating Context
The owner selected an independent Bash process in the server Node extension host.
Source root and GitHub remote were supplied by the owner. Packages target XBSL.IO.
## Capabilities and Constraints
Cross-platform PTY, multiple sessions, keyboard input, ANSI output and resize.
Element/vendor files stay unchanged. Bash must already exist on the server.
Native Windows/Linux validation remains separate from cross-compilation.
## Brand Commitments
Follow the VS Code terminal, native host themes and Russian interface.
README uses stop-slop: direct instructions and explicit verification boundaries.
## Stack
Implementation choice: TypeScript + bundled xterm.js and Go PTY helper. No framework
is needed for a terminal toolbar. Host exposes only the standard Webview API.
