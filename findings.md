# Session scrolling investigation

Hidden sessions remain mounted, but `src/mainview/App.tsx` forces their containers to full width and height. When a session was displayed in a split pane, hiding it changes its container dimensions. `src/mainview/session-view.tsx` enables automatic terminal resizing, so this can resize the background PTY and reflow its contents.

This is a likely source of background-session disruption, but it has not been confirmed as the cause of the reported scroll-position problem. The terminal library attaches wheel handlers to individual terminal elements, and hidden containers disable pointer events; the investigation did not find evidence that a wheel event directly scrolls every session.

Next, reproduce the issue and inspect terminal and PTY dimensions and scroll positions while switching sessions, including sessions in split panes.
