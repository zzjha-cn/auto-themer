import * as vscode from 'vscode';

export class ThemeManager {
    private builtinThemes: string[] = [];
    private currentThemeIndex: number = 0;

    constructor(private context: vscode.ExtensionContext) {
        this.loadBuiltinThemes();
    }

    private loadBuiltinThemes(): void {
        this.builtinThemes = [
            "Abyss",
            "Default Light+",
            "Default Dark+",
            "Kimbie Dark",
            "Monokai",
            "Monokai Dimmed",
            "Quiet Light",
            "Red",
            "Solarized Dark",
            "Solarized Light",
            "Tomorrow Night Blue",
        ];

        // TODO: use config builtinThemes
    }

    async getAvailableThemes(): Promise<string[]> {
        const themes: string[] = [];

        // Get all installed extensions
        const extensions = vscode.extensions.all;

        for (const ext of extensions) {
            const contributes = ext.packageJSON?.contributes;
            if (contributes?.themes) {
                for (const theme of contributes.themes) {
                    if (theme.label || theme.id) {
                        themes.push(theme.label || theme.id);
                    }
                }
            }
        }

        const uniqueThemes = [...new Set(themes)].sort();
        const prioritizedThemes = this.builtinThemes.filter(t => uniqueThemes.includes(t));
        const otherThemes = uniqueThemes.filter(t => !this.builtinThemes.includes(t));

        return [...prioritizedThemes, ...otherThemes];
    }

    async getCurrentTheme(): Promise<string> {
        const config = vscode.workspace.getConfiguration('workbench');
        return config.get<string>('colorTheme', 'Default Dark+');
    }

    async switchTheme(themeName: string): Promise<boolean> {
        try {
            // (.vscode) Update workbench.colorTheme in workspace settings
            const config = vscode.workspace.getConfiguration('workbench');
            await config.update('colorTheme', themeName, vscode.ConfigurationTarget.Workspace);

            // Update current theme index
            const index = this.builtinThemes.indexOf(themeName);
            if (index !== -1) {
                this.currentThemeIndex = index;
            }

            // Save to global state
            await this.context.globalState.update('currentTheme', themeName);

            return true;
        } catch (error) {
            console.error('Failed to switch theme:', error);
            vscode.window.showErrorMessage(`Failed to switch theme: ${error}`);
            return false;
        }
    }

    async getBuiltinThemes(): Promise<string[]> {
        return this.builtinThemes;
    }

    async assignUniqueTheme(instanceId: string, instanceCount: number): Promise<string> {
        // Assign a unique theme based on instanceId
        const themes = await this.getBuiltinThemes();
        if (themes.length === 0) {
            return 'Default Dark+';
        }

        // Hash instanceId to pick a theme
        let hash = 0;
        for (let i = 0; i < instanceId.length; i++) {
            const char = instanceId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        const themeIndex = Math.abs(hash) % themes.length;
        const assignedTheme = themes[themeIndex];

        // Switch to the assigned theme
        await this.switchTheme(assignedTheme);

        return assignedTheme;
    }

    async showThemeNotification(themeName: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('autoThemer');
        if (config.get('enableNotifications', true)) {
            vscode.window.showInformationMessage(`Theme switched to: ${themeName}`);
        }
    }
}
