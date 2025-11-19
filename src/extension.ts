import * as vscode from 'vscode';
import * as path from 'path';
import { WindowInstanceManager } from './utils/WindowInstanceManager';
import { ThemeManager } from './utils/ThemeManager';
import { SimpleWebviewProvider } from './providers/SimpleWebviewProvider';

let windowManager: WindowInstanceManager;
let themeManager: ThemeManager;
let autoAssignmentEnabled: boolean = false;

// "onStartupFinished" actives once when Extension Host finish.
export function activate(context: vscode.ExtensionContext) {

    // Initialize managers
    windowManager = new WindowInstanceManager(context);
    themeManager = new ThemeManager(context);

    const provider = new SimpleWebviewProvider(context.extensionUri, themeManager);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('autoThemer.view', provider)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('autoThemer.enable', async () => {
            await vscode.workspace.getConfiguration('autoThemer').update('enabled', true, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('Auto Themer enabled');
            autoAssignmentEnabled = true;
            await performAutoThemeAssignment();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('autoThemer.disable', async () => {
            await vscode.workspace.getConfiguration('autoThemer').update('enabled', false, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('Auto Themer disabled');
            autoAssignmentEnabled = false;
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('autoThemer.switchTheme', async () => {
            const themes = await themeManager.getAvailableThemes();
            const currentTheme = await themeManager.getCurrentTheme();

            const items = themes.map(theme => ({
                label: theme,
                description: theme === currentTheme ? '(current)' : '',
                picked: theme === currentTheme
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a theme'
            });

            if (selected) {
                await themeManager.switchTheme(selected.label);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('autoThemer.reassignTheme', async () => {
            const currentInstanceId = windowManager.getCurrentInstanceId();
            const instanceCount = windowManager.getInstanceCount();

            if (instanceCount <= 1) {
                vscode.window.showInformationMessage('Only one VSCode window detected. Theme assignment not needed.');
                return;
            }

            const newTheme = await themeManager.assignUniqueTheme(currentInstanceId, instanceCount);
            vscode.window.showInformationMessage(`Theme reassigned to: ${newTheme}`);
            provider.notifyConflictResolved();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('autoThemer.showThemeMappings', async () => {
            await showThemeMappings();
        })
    );

    // Initialize window management
    const config = vscode.workspace.getConfiguration('autoThemer');
    autoAssignmentEnabled = config.get('enabled', true);

    if (autoAssignmentEnabled) {
        setTimeout(async () => {
            await windowManager.initialize();
            await applyWorkspaceMappingIfExists();
            await performAutoThemeAssignment();
        }, 2000);
    }

    // Listen for active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async () => {
            if (autoAssignmentEnabled) {
                await windowManager.onWindowActivated();
            }
        })
    );

    // Listen for workspace folder changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(async (e) => {
            if (autoAssignmentEnabled) {
                for (const removed of e.removed) {
                    windowManager.resetWorkspaceThemeByPath(removed.uri.fsPath);
                }
                await applyWorkspaceMappingIfExists();
                await performAutoThemeAssignment();
            }
        })
    );

    // Periodic window state sync (hacky)
    const syncInterval = setInterval(async () => {
        if (autoAssignmentEnabled) {
            await windowManager.syncWindowStates();
            await checkAndAssignTheme();
        }
    }, 3000);

    context.subscriptions.push({
        dispose: () => clearInterval(syncInterval)
    });

    // Auto theme assignment
    async function performAutoThemeAssignment(): Promise<void> {
        try {
            const hasWorkspace = (vscode.workspace.workspaceFolders?.length || 0) > 0;
            if (!hasWorkspace) return;
            const instanceCount = windowManager.getInstanceCount();
            const currentInstanceId = windowManager.getCurrentInstanceId();

            if (instanceCount > 1) {
                // Multi-window: assign unique theme
                const assignedTheme = await themeManager.assignUniqueTheme(currentInstanceId, instanceCount);
                await themeManager.showThemeNotification(assignedTheme);
                console.log(`Auto-assigned theme: ${assignedTheme} to instance: ${currentInstanceId}`);
            } else {
                // Single-window: use default or user preference
                const currentTheme = await themeManager.getCurrentTheme();
                console.log(`Single window mode, current theme: ${currentTheme}`);
            }
        } catch (error) {
            console.error('Failed to perform auto theme assignment:', error);
        }
    }

    // Save/get workspace theme mapping (by workspace path)
    async function saveWorkspaceThemeMapping(workspacePath: string, theme: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('autoThemer');
        const text = config.get<string>('themeMappingsText', '');
        const mappings = parseMappingsText(text);
        mappings[workspacePath] = theme;
        const newText = serializeMappingsToText(mappings);
        await config.update('themeMappingsText', newText, vscode.ConfigurationTarget.Global);
    }

    async function getWorkspaceThemeMapping(workspacePath: string): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration('autoThemer');
        const text = config.get<string>('themeMappingsText', '');
        const mappings = parseMappingsText(text);
        return mappings[workspacePath];
    }

    function serializeMappingsToText(m: Record<string, string>): string {
        const entries = Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
        return entries.map(([k, v]) => `${k}: ${v}`).join('; ');
    }

    function parseMappingsText(text: string): Record<string, string> {
        const result: Record<string, string> = {};
        const parts = text.split(';');
        for (const part of parts) {
            const s = part.trim();
            if (!s) continue;
            const idx = s.indexOf(':');
            if (idx === -1) continue;
            let key = s.slice(0, idx).trim();
            let val = s.slice(idx + 1).trim();
            if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            if (key) result[key] = val;
        }
        return result;
    }



    async function applyWorkspaceMappingIfExists(): Promise<void> {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspacePath) return;
        const mapped = await getWorkspaceThemeMapping(workspacePath);
        if (mapped) {
            await themeManager.switchTheme(mapped);
        }
    }

    // Persist current theme to workspace mapping
    context.subscriptions.push(
        vscode.commands.registerCommand('autoThemer.persistCurrentTheme', async () => {
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspacePath) {
                vscode.window.showWarningMessage('No workspace open to persist theme.');
                return;
            }
            const currentTheme = await themeManager.getCurrentTheme();
            await saveWorkspaceThemeMapping(workspacePath, currentTheme);
            vscode.window.showInformationMessage(`Persisted theme for workspace: ${path.basename(workspacePath)} → ${currentTheme}`);
        })
    );

    // Show theme mappings
    async function showThemeMappings(): Promise<void> {
        const config = vscode.workspace.getConfiguration('autoThemer');
        const text2 = config.get<string>('autoThemer.themeMappingsText' as any, '');
        const mappings = parseMappingsText(text2 || config.get<string>('themeMappingsText', ''));
        const instances = windowManager.getAllInstances();
        const availableThemes = await themeManager.getAvailableThemes();

        const rows: Array<{
            label: string;
            description: string;
            detail: string;
            workspacePath: string;
            currentTheme?: string;
            mappedTheme?: string;
            status: 'in_sync' | 'conflict' | 'unmapped';
        }> = [];

        // Current instances rows
        for (const inst of instances) {
            const mappedTheme = mappings[inst.workspacePath];
            let status: 'in_sync' | 'conflict' | 'unmapped' = 'unmapped';
            if (mappedTheme) {
                status = mappedTheme === inst.theme ? 'in_sync' : 'conflict';
            }
            rows.push({
                label: path.basename(inst.workspacePath || 'global'),
                description: `Current: ${inst.theme || 'Unknown'} | Mapped: ${mappedTheme || 'None'}`,
                detail: `Path: ${inst.workspacePath || 'global'} | Status: ${status}`,
                workspacePath: inst.workspacePath,
                currentTheme: inst.theme,
                mappedTheme,
                status
            });
        }

        // Mapped workspaces not currently open
        const knownPaths = new Set(instances.map(i => i.workspacePath));
        for (const [wsPath, theme] of Object.entries(mappings)) {
            if (knownPaths.has(wsPath)) continue;
            rows.push({
                label: path.basename(wsPath || 'Unknown'),
                description: `Mapped: ${theme}`,
                detail: `Path: ${wsPath || 'Unknown'} | Status: unmapped`,
                workspacePath: wsPath,
                mappedTheme: theme,
                status: 'unmapped'
            });
        }

        if (rows.length === 0) {
            vscode.window.showInformationMessage('No instances or mappings to display.');
            return;
        }

        const selected = await vscode.window.showQuickPick(rows, {
            placeHolder: 'Theme Mappings (select an item to manage)',
            ignoreFocusOut: true
        });

        if (!selected) return;

        const actions = [
            { label: 'Apply Mapped Theme', description: 'Switch current window to mapped theme' },
            { label: 'Set Mapping To Current Theme', description: 'Update mapping to current theme' },
            { label: 'Change Mapped Theme', description: 'Pick a different theme for mapping' },
            { label: 'Remove Mapping', description: 'Delete this mapping entry' },
            { label: 'Cancel', description: '' }
        ];

        const action = await vscode.window.showQuickPick(actions, {
            placeHolder: `Selected: ${selected.label} (${selected.mappedTheme || 'None'})`
        });

        if (!action || action.label === 'Cancel') return;

        if (action.label === 'Apply Mapped Theme') {
            if (!selected.mappedTheme) {
                vscode.window.showWarningMessage('No mapped theme to apply.');
                return;
            }
            await themeManager.switchTheme(selected.mappedTheme);
            provider.notifyConflictResolved();
            vscode.window.showInformationMessage(`Applied mapped theme: ${selected.mappedTheme}`);
            return;
        }

        if (action.label === 'Set Mapping To Current Theme') {
            const current = await themeManager.getCurrentTheme();
            await saveWorkspaceThemeMapping(selected.workspacePath, current);
            vscode.window.showInformationMessage(`Mapping updated: ${selected.label} → ${current}`);
            provider.notifyConflictResolved();
            return;
        }

        if (action.label === 'Change Mapped Theme') {
            const newTheme = await vscode.window.showQuickPick(availableThemes, {
                placeHolder: 'Select new mapped theme'
            });
            if (!newTheme) return;
            await saveWorkspaceThemeMapping(selected.workspacePath, newTheme);
            if (selected.workspacePath === (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '')) {
                await themeManager.switchTheme(newTheme);
            }
            vscode.window.showInformationMessage(`Mapping updated: ${selected.label} → ${newTheme}`);
            provider.notifyConflictResolved();
            return;
        }

        if (action.label === 'Remove Mapping') {
            const text2 = config.get<string>('themeMappingsText', '');
            const all = parseMappingsText(text2);
            delete all[selected.workspacePath];
            const newText = serializeMappingsToText(all);
            await config.update('themeMappingsText', newText, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Theme mapping removed for ${selected.label}`);
            return;
        }
    }

    // Check and assign theme (detect conflicts; do not auto reassign)
    async function checkAndAssignTheme(): Promise<void> {
        const config = vscode.workspace.getConfiguration('autoThemer');
        if (!config.get('enabled', true)) {
            return;
        }

        const instanceCount = windowManager.getInstanceCount();
        if (instanceCount > 1) {
            // Check if current theme is used by other instances
            const instances = windowManager.getAllInstances();
            const currentTheme = await themeManager.getCurrentTheme();
            const currentInstanceId = windowManager.getCurrentInstanceId();

            // Check for other instances with the same theme
            const duplicateThemeUsers = instances.filter(instance =>
                instance.theme === currentTheme && instance.id !== currentInstanceId
            );

            if (duplicateThemeUsers.length > 0) {
                console.log(`Theme conflict detected: ${currentTheme} used by ${duplicateThemeUsers.length} other instances`);

                // Auto assign on first launch only; later only log conflicts
                const hasAutoAssigned = await context.globalState.get('hasAutoAssigned', false);
                if (!hasAutoAssigned) {
                    await performAutoThemeAssignment();
                    await context.globalState.update('hasAutoAssigned', true);
                } else {
                    // Show conflict warning without auto reassign
                    vscode.window.showWarningMessage(
                        `Theme conflict detected: "${currentTheme}" is used by ${duplicateThemeUsers.length} other VSCode window(s).`,
                        'Reassign Theme',
                        'Show Mappings'
                    ).then(selection => {
                        if (selection === 'Reassign Theme') {
                            vscode.commands.executeCommand('autoThemer.reassignTheme');
                        } else if (selection === 'Show Mappings') {
                            vscode.commands.executeCommand('autoThemer.showThemeMappings');
                        }
                    });

                    // Notify WebView of conflict
                    provider.notifyConflictDetected();
                }
            }
        }
    }
}

export function deactivate() {
    if (windowManager) {
        windowManager.dispose();
    }
}
