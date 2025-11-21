import * as vscode from 'vscode';
const statusBarColorList = {
    "Abyss": {
        'statusBar.background': '#282c34',
        'statusBar.foreground': '#d7dae0',
    },
    "Default Light+": {
        'statusBar.background': '#ECECEC',
        'statusBar.foreground': '#686868',
    },
    "Default Dark+": {
        'statusBar.background': '#252526',
        'statusBar.foreground': '#CCCCCC',
    },
    "Kimbie Dark": {
        'statusBar.background': '#B07219',
        'statusBar.foreground': '#FFFFFF',
    },
    "Monokai": {
        'statusBar.background': '#2D2B55',
        'statusBar.foreground': '#D4D4D4',
    },
    "Monokai Dimmed": {
        'statusBar.background': '#1e1e2f',
        'statusBar.foreground': '#a9a9b6',
    },
    "Quiet Light": {
        'statusBar.background': '#F4F4F4',
        'statusBar.foreground': '#686868',
    },
    "Red": {
        'statusBar.background': '#CD3131',
        'statusBar.foreground': '#FFFFFF',
    },
    "Solarized Dark": {
        'statusBar.background': '#073642',
        'statusBar.foreground': '#839496',
    },
    "Solarized Light": {
        'statusBar.background': '#FDF6E3',
        'statusBar.foreground': '#586E75',
    },
    "Tomorrow Night Blue": {
        'statusBar.background': '#003F8E',
        'statusBar.foreground': '#C5C8C6',
    }
};

export class StatusBarManager {
    constructor(private context: vscode.ExtensionContext) { }

    getSchemeNames(): string[] {
        return Object.keys(statusBarColorList);
    }

    async applyNextStatusBarScheme(workspacePath: string): Promise<string | undefined> {
        const names = this.getSchemeNames();
        if (names.length === 0) return;
        const key = `statusBarSchemeIndex:${workspacePath || 'global'}`;
        let idx = this.context.globalState.get<number>(key, -1) ?? -1;
        idx = (idx + 1) % names.length;
        const name = names[idx];
        await this.applySchemeToWorkspace(workspacePath, name);
        await this.context.globalState.update(key, idx);
        return name;
    }

    async applySchemeToWorkspace(workspacePath: string, schemeName: string): Promise<void> {
        const cfg = vscode.workspace.getConfiguration('workbench');
        // const custom = cfg.get<Record<string, any>>('colorCustomizations', {}) || {};
        const scheme = (statusBarColorList as any)[schemeName] as Record<string, string> | undefined;
        if (!scheme) return;
        let statusBarCfg = {
            'statusBar.background': scheme['statusBar.background'],
            'statusBar.foreground': scheme['statusBar.foreground'],
        };
        await cfg.update('colorCustomizations', statusBarCfg, vscode.ConfigurationTarget.Workspace);
    }
}
