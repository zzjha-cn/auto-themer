<p align="right">
   <strong>English</strong> | <a href="./README.CN.md">简体中文</a>
</p>

# Auto Themer

Assign and apply theme-based or status-bar-based distinction per VS Code window/workspace. Supports persisting mappings by workspace path.

- (autoThemer.conflictResolution=theme):

  ![image](./public/image1.png)

- (autoThemer.conflictResolution=statusBar):

  ![image](./public/image2.png)

## Features

- Distinguish windows by theme or status bar: in multi-window scenarios, automatically assigns a distinct theme or a distinct status bar color+label per window
- Persistent workspace mappings: define "workspace path → theme" via `autoThemer.themeMappingsText`; define "workspace path → status bar label" via `autoThemer.statusBarMappingsText`
- Simple sidebar: quick theme selection, persist current theme, view and edit mappings, pick status bar scheme, persist status bar label, cycle next status bar scheme

## Usage

- In settings, configure `autoThemer.windowsThreshold`; auto assignment only runs when the number of open windows is greater than this threshold
- Set `autoThemer.conflictResolution` to `theme` or `statusBar` to choose your distinction strategy
- Use the sidebar panel for common actions: switch theme, pick status bar scheme, persist current theme mapping, persist status bar label mapping
- When a workspace opens in a new window, the extension applies the mapped theme or status bar settings into `.vscode/settings.json`; when switching workspaces or closing the window, it resets `workbench.colorTheme` to avoid carryover

### Sidebar Actions
- Select Theme: choose the current window's theme
- Random Theme: assign a random theme to the current window
- Reassign Theme: reassign a unique theme to the current window
- Persist Theme: persist the current window's theme mapping
- Show Mappings: view workspace ↔ theme mappings
- Pick Status Bar Scheme: choose the bottom status bar color scheme (built-in list)
- Persist Status Bar Label: persist a label mapping for the bottom status bar
- Next Status Bar Scheme: cycle to the next built-in status bar scheme

## How It Works

- Multi-window instance tracking: all VS Code windows coordinate using a shared global storage directory under `context.globalStorageUri.fsPath/instances` (macOS example: `~/Library/Application Support/Code/User/globalStorage`)
- Theme application: writes `workbench.colorTheme` in the workspace's `.vscode/settings.json`; the value is removed when the window/workspace closes

Flow:
1. Delayed initialization on startup; scan and track active window instances
2. If a workspace is open and a persisted mapping exists, apply the mapped theme (highest priority)
3. If no mapping and multiple windows are detected, assign a unique theme or status bar scheme
4. Event-driven detection of theme conflicts, with real-time notifications in the sidebar notifications
5. On window close or workspace removal, reset the workspace `.vscode/settings.json` `workbench.colorTheme` to avoid residual temporary settings

## Configuration

Configure in VS Code settings:

```json
{
  "autoThemer.enabled": true,
  "autoThemer.conflictResolution": "theme",
  "autoThemer.windowsThreshold": 2,
  "autoThemer.builtinThemes": [],
  "autoThemer.themeMappingsText": "/my/pro-dev: Kimbie Dark; /easy/hc: Kimbie Dark",
  "autoThemer.statusBarMappingsText": "/my/pro-dev: Custom Label; /easy/hc: Custom Project"
}
```

Notes:
- `themeMappingsText` uses a semicolon-separated `path: Theme` string; parsed in-memory as the workspace → theme mapping
- `statusBarMappingsText` uses a semicolon-separated `path: Label` string; parsed in-memory as the workspace → status bar label mapping

## Development

1. `npm install`
2. `npm run compile`
3. Press F5 in VS Code to launch the Extension Development Host

## License

MIT License
