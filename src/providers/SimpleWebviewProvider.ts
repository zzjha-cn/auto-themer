import * as vscode from 'vscode';
import { ThemeManager } from '../utils/ThemeManager';

export class SimpleWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly themeManager: ThemeManager
    ) { }

    public notifyConflictDetected(): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'conflictDetected'
            });
        }
    }

    public notifyConflictResolved(): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'conflictResolved'
            });
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the WebView
        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'switchTheme':
                    await vscode.commands.executeCommand('autoThemer.switchTheme');
                    break;
                case 'selectTheme':
                    await vscode.commands.executeCommand('autoThemer.switchTheme');
                    break;
                case 'randomTheme':
                    const themes = await this.themeManager.getBuiltinThemes();
                    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
                    await this.themeManager.switchTheme(randomTheme);
                    break;
                case 'reassignTheme':
                    await vscode.commands.executeCommand('autoThemer.reassignTheme');
                    break;
                case 'persistTheme':
                    await vscode.commands.executeCommand('autoThemer.persistCurrentTheme');
                    break;
                case 'showMappings':
                    await vscode.commands.executeCommand('autoThemer.showThemeMappings');
                    break;
                case 'pickStatusBarScheme':
                    await vscode.commands.executeCommand('autoThemer.pickStatusBarScheme');
                    break;
                case 'persistStatusBarLabel':
                    await vscode.commands.executeCommand('autoThemer.persistStatusBarLabel');
                    break;
                case 'nextStatusBarScheme':
                    await vscode.commands.executeCommand('autoThemer.nextStatusBarScheme');
                    break;
                case 'getCurrentTheme':
                    const currentTheme = await this.themeManager.getCurrentTheme();
                    webviewView.webview.postMessage({
                        type: 'currentTheme',
                        theme: currentTheme
                    });
                    break;
            }
        });

        // Periodically update the current theme
        const updateInterval = setInterval(async () => {
            if (this._view) {
                const currentTheme = await this.themeManager.getCurrentTheme();
                this._view.webview.postMessage({
                    type: 'currentTheme',
                    theme: currentTheme
                });
            }
        }, 3000);

        // Clean up the interval timer
        webviewView.onDidDispose(() => {
            clearInterval(updateInterval);
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Auto Themer</title>
                <style>
                    body {
                        padding: 10px;
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                    }
                    .container {
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }
                    .current-theme {
                        padding: 8px;
                        background-color: var(--vscode-editor-inactiveSelectionBackground);
                        border-radius: 4px;
                        text-align: center;
                        font-size: 0.9em;
                        margin-bottom: 10px;
                    }
                    .button-group {
                        display: flex;
                        flex-direction: column;
                        gap: 5px;
                    }
                    button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 6px 12px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 0.9em;
                        transition: background-color 0.2s;
                    }
                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    button:active {
                        transform: translateY(1px);
                    }
                    .divider {
                        height: 1px;
                        background-color: var(--vscode-panel-border);
                        margin: 10px 0;
                    }
                    .status {
                        text-align: center;
                        font-size: 0.8em;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 10px;
                    }
                    .conflict-warning {
                        background-color: var(--vscode-inputValidation-warningBackground);
                        border: 1px solid var(--vscode-inputValidation-warningBorder);
                        border-radius: 4px;
                        padding: 8px;
                        font-size: 0.8em;
                        margin-top: 10px;
                        display: none;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="current-theme">
                        <div>Current Theme:</div>
                        <div id="current-theme" style="font-weight: bold;">Loading...</div>
                    </div>

                    <div class="button-group">
                        <button id="select-theme">Select Theme</button>
                        <button id="random-theme">Random Theme</button>
                    </div>

                    <div class="divider"></div>

                    <div class="button-group">
                        <button id="reassign-theme">Reassign Theme</button>
                        <button id="persist-theme">Persist Theme</button>
                        <button id="show-mappings">Show Mappings</button>
                    </div>

                    <div class="divider"></div>

                    <div class="button-group">
                        <button id="pick-statusbar-scheme">Pick Status Bar Scheme</button>
                        <button id="persist-statusbar-label">Persist Status Bar Label</button>
                        <button id="next-statusbar-scheme">Next Status Bar Scheme</button>
                    </div>

                    <div id="conflict-warning" class="conflict-warning">
                        ⚠️ Theme conflict detected! Click "Reassign Theme" to fix.
                    </div>

                    <div class="status">
                        Auto Themer Active
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    vscode.postMessage({ type: 'getCurrentTheme' });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'currentTheme':
                                document.getElementById('current-theme').textContent = message.theme;
                                break;
                            case 'conflictDetected':
                                document.getElementById('conflict-warning').style.display = 'block';
                                break;
                            case 'conflictResolved':
                                document.getElementById('conflict-warning').style.display = 'none';
                                break;
                        }
                    });

                    // Bind button events
                    document.getElementById('select-theme').addEventListener('click', () => {
                        vscode.postMessage({ type: 'selectTheme' });
                    });

                    document.getElementById('random-theme').addEventListener('click', () => {
                        vscode.postMessage({ type: 'randomTheme' });
                    });

                    document.getElementById('reassign-theme').addEventListener('click', () => {
                        vscode.postMessage({ type: 'reassignTheme' });
                    });

                    document.getElementById('persist-theme').addEventListener('click', () => {
                        vscode.postMessage({ type: 'persistTheme' });
                    });

                    document.getElementById('show-mappings').addEventListener('click', () => {
                        vscode.postMessage({ type: 'showMappings' });
                    });

                    document.getElementById('pick-statusbar-scheme').addEventListener('click', () => {
                        vscode.postMessage({ type: 'pickStatusBarScheme' });
                    });

                    document.getElementById('persist-statusbar-label').addEventListener('click', () => {
                        vscode.postMessage({ type: 'persistStatusBarLabel' });
                    });

                    document.getElementById('next-statusbar-scheme').addEventListener('click', () => {
                        vscode.postMessage({ type: 'nextStatusBarScheme' });
                    });
                </script>
            </body>
            </html>`;
    }
}
