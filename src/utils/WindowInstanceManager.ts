import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';


interface WindowInstance {
    id: string;
    pid: number;
    curTheme: string;
    workspacePath: string;
    lastActive: number;
}

export class WindowInstanceManager {
    private instances: Map<string, WindowInstance> = new Map();
    private lockDir: string;
    private currentInstanceId: string;

    constructor(private context: vscode.ExtensionContext) {
        this.lockDir = path.join(this.context.globalStorageUri.fsPath, 'instances');
        this.ensureLockDirectory();
        this.currentInstanceId = this.generateInstanceId();
    }

    private ensureLockDirectory(): void {
        if (!fs.existsSync(this.lockDir)) {
            fs.mkdirSync(this.lockDir, { recursive: true });
        }
    }

    private generateInstanceId(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'global';
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `${path.basename(workspaceFolder)}-${timestamp}-${random}`;
    }

    private getLockFilePath(instanceId: string): string {
        return path.join(this.lockDir, `${instanceId}.lock`);
    }

    private getInstanceInfoPath(instanceId: string): string {
        return path.join(this.lockDir, `${instanceId}.json`);
    }

    private createLockFile(instanceId: string): void {
        const lockPath = this.getLockFilePath(instanceId);
        const infoPath = this.getInstanceInfoPath(instanceId);

        try {
            // Create lock file (use process PID)
            const pid = process.pid;
            fs.writeFileSync(lockPath, pid.toString(), { flag: 'wx' });

            const config = vscode.workspace.getConfiguration('workbench');
            const curTheme = config.get<string>('colorTheme', '');
            const instanceInfo: WindowInstance = {
                id: instanceId,
                pid: pid,
                curTheme: curTheme,
                workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
                lastActive: Date.now()
            };

            fs.writeFileSync(infoPath, JSON.stringify(instanceInfo));

            this.watchLockFile(instanceId);

        } catch (error) {
            console.log(`Lock file already exists for instance: ${instanceId}`);
        }
    }

    private watchLockFile(instanceId: string): void {
        const lockPath = this.getLockFilePath(instanceId);

        try {
            const watcher = fs.watch(lockPath, (eventType) => {
                if (eventType === 'rename') {
                    // Lock file deleted ⇒ instance closed
                    this.removeInstance(instanceId);
                }
            });

            // Save watcher for cleanup
            this.context.subscriptions.push({
                dispose: () => watcher.close()
            });
        } catch (error) {
            console.error(`Failed to watch lock file: ${error}`);
        }
    }

    private removeInstance(instanceId: string): void {
        const info = this.readInstanceInfo(instanceId);
        this.instances.delete(instanceId);
        if (info && info.workspacePath) {
            this.resetWorkspaceThemeByPath(info.workspacePath);
            this.resetWorkspaceUIColorsByPath(info.workspacePath);
        }
        const lockPath = this.getLockFilePath(instanceId);
        const infoPath = this.getInstanceInfoPath(instanceId);
        try {
            if (fs.existsSync(lockPath)) {
                fs.unlinkSync(lockPath);
            }
            if (fs.existsSync(infoPath)) {
                fs.unlinkSync(infoPath);
            }
        } catch (error) {
            console.error(`Failed to clean up instance files: ${error}`);
        }
    }

    private readInstanceInfo(instanceId: string): WindowInstance | null {
        const infoPath = this.getInstanceInfoPath(instanceId);

        try {
            if (fs.existsSync(infoPath)) {
                const data = fs.readFileSync(infoPath, 'utf8');
                return JSON.parse(data) as WindowInstance;
            }
        } catch (error) {
            console.error(`Failed to read instance info: ${error}`);
        }

        return null;
    }

    private updateInstanceTheme(instanceId: string, theme: string): void {
        const infoPath = this.getInstanceInfoPath(instanceId);

        try {
            const instanceInfo = this.readInstanceInfo(instanceId);
            if (instanceInfo) {
                instanceInfo.curTheme = theme;
                instanceInfo.lastActive = Date.now();
                fs.writeFileSync(infoPath, JSON.stringify(instanceInfo));
                this.instances.set(instanceId, instanceInfo);
            }
        } catch (error) {
            console.error(`Failed to update instance theme: ${error}`);
        }
    }

    public updateCurrentInstanceTheme(theme: string): void {
        try {
            this.updateInstanceTheme(this.currentInstanceId, theme);
        } catch (error) {
            console.error(`Failed to update current instance theme: ${error}`);
        }
    }

    async initialize(): Promise<void> {
        console.log('Initializing window instance manager...');

        // Create lock file for current instance
        this.createLockFile(this.currentInstanceId);

        // initial is the first instance
        const selfInfo = this.readInstanceInfo(this.currentInstanceId);
        if (selfInfo) {
            this.instances.set(this.currentInstanceId, selfInfo);
        }

        await this.scanExistingInstances();

        // Cleanup dead instances (no running process)
        await this.cleanupDeadInstances();

        console.log(`Current instance: ${this.currentInstanceId}`);
        console.log(`Total instances: ${this.instances.size}`);
    }

    private async scanExistingInstances(): Promise<void> {
        try {
            const files = fs.readdirSync(this.lockDir);
            const lockFiles = files.filter(f => f.endsWith('.lock'));

            for (const lockFile of lockFiles) {
                const instanceId = lockFile.replace('.lock', '');
                if (instanceId !== this.currentInstanceId) {
                    const instanceInfo = this.readInstanceInfo(instanceId);
                    if (instanceInfo) {
                        // Check if process is still running
                        if (this.isProcessRunning(instanceInfo.pid)) {
                            this.instances.set(instanceId, instanceInfo);
                            this.watchLockFile(instanceId);
                        } else {
                            // Process is dead ⇒ clean up files
                            this.removeInstance(instanceId);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to scan existing instances: ${error}`);
        }
    }

    private isProcessRunning(pid: number): boolean {
        try {
            // Check if process exists
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return false;
        }
    }

    private async cleanupDeadInstances(): Promise<void> {
        try {
            const files = fs.readdirSync(this.lockDir);
            const infoFiles = files.filter(f => f.endsWith('.json'));

            for (const infoFile of infoFiles) {
                const instanceId = infoFile.replace('.json', '');
                const instanceInfo = this.readInstanceInfo(instanceId);

                if (instanceInfo && !this.isProcessRunning(instanceInfo.pid)) {
                    this.removeInstance(instanceId);
                }
            }
        } catch (error) {
            console.error(`Failed to cleanup dead instances: ${error}`);
        }
    }

    async onWindowActivated(): Promise<void> {
        // Update last active time for the current instance
        const instanceInfo = this.readInstanceInfo(this.currentInstanceId);
        if (instanceInfo) {
            instanceInfo.lastActive = Date.now();
            this.updateInstanceTheme(this.currentInstanceId, instanceInfo.curTheme);
        }
    }

    async syncWindowStates(): Promise<void> {
        await this.scanExistingInstances();

        // Refresh current instance state
        const instanceInfo = this.readInstanceInfo(this.currentInstanceId);
        if (instanceInfo) {
            this.instances.set(this.currentInstanceId, instanceInfo);
        }
    }

    getAllInstances(): WindowInstance[] {
        return Array.from(this.instances.values());
    }

    getCurrentInstanceId(): string {
        return this.currentInstanceId;
    }

    getInstanceCount(): number {
        return this.instances.size;
    }

    dispose(): void {
        // Clean up files for the current instance
        this.removeInstance(this.currentInstanceId);

        // Clean up lock directory (if no other instances)
        try {
            const files = fs.readdirSync(this.lockDir);
            if (files.length === 0) {
                fs.rmdirSync(this.lockDir);
            }
        } catch (error) {
            console.error(`Failed to cleanup lock directory: ${error}`);
        }
    }

    public resetWorkspaceThemeByPath(workspacePath: string): void {
        try {
            if (!workspacePath) return;
            const settingsPath = path.join(workspacePath, '.vscode', 'settings.json');
            if (!fs.existsSync(settingsPath)) return;
            let raw = fs.readFileSync(settingsPath, 'utf8');
            raw = raw.replace(/,(?=\s*[}\]])/g, ''); // trim invalid json data: ",}"
            let json: any;
            try {
                json = JSON.parse(raw);
            } catch {
                return;
            }
            if (json && Object.prototype.hasOwnProperty.call(json, 'workbench.colorTheme')) {
                delete json['workbench.colorTheme'];
                fs.writeFileSync(settingsPath, JSON.stringify(json, null, 2));
            }
        } catch { }
    }

    public resetWorkspaceUIColorsByPath(workspacePath: string): void {
        try {
            if (!workspacePath) return;
            const settingsPath = path.join(workspacePath, '.vscode', 'settings.json');
            if (!fs.existsSync(settingsPath)) return;
            let raw = fs.readFileSync(settingsPath, 'utf8');
            raw = raw.replace(/,(?=\s*[}\]])/g, '');
            let json: any;
            try {
                json = JSON.parse(raw);
            } catch {
                return;
            }
            const key = 'workbench.colorCustomizations';
            if (json && Object.prototype.hasOwnProperty.call(json, key)) {
                const cc = json[key];
                if (cc && typeof cc === 'object') {
                    delete cc['statusBar.background'];
                    delete cc['statusBar.foreground'];
                    if (Object.keys(cc).length === 0) {
                        delete json[key];
                    } else {
                        json[key] = cc;
                    }
                    fs.writeFileSync(settingsPath, JSON.stringify(json, null, 2));
                }
            }
        } catch { }
    }
}
