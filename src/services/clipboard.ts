import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { exec } from 'child_process';

export interface ImageData {
    buffer: Buffer;
    format: string;
}

export type ClipboardResult = ImageData | null;

export interface ClipboardService {
    getImage(): Promise<ClipboardResult>;
    clear(): Promise<void>;
    hasImage(): Promise<boolean>;
    warmUp(): Promise<void>;
}

export interface Disposable {
    dispose(): void;
}

class ManagedTempFile implements Disposable {
    constructor(private readonly filePath: string, private readonly dirPath: string) {}

    getPath(): string {
        return this.filePath;
    }

    dispose(): void {
        try {
            if (fs.existsSync(this.filePath)) {
                fs.unlinkSync(this.filePath);
            }
            if (fs.existsSync(this.dirPath)) {
                fs.rmdirSync(this.dirPath);
            }
        } catch (error) {
            // Best effort cleanup - don't throw
        }
    }
}

class WindowsClipboardService implements ClipboardService {
    private readonly timeout = 10000;

    async getImage(): Promise<ClipboardResult> {
        const tempFile = this.createTempFile();
        
        try {
            const hasImage = await this.executeClipboardCommand(tempFile.getPath());
            
            if (!hasImage || !fs.existsSync(tempFile.getPath())) {
                return null;
            }

            const buffer = fs.readFileSync(tempFile.getPath());
            return {
                buffer,
                format: 'png'
            };
        } finally {
            tempFile.dispose();
        }
    }

    async clear(): Promise<void> {
        const command = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::Clear()"';
        
        return new Promise((resolve) => {
            exec(command, { timeout: 5000 }, () => {
                resolve(); // Always resolve, cleanup is best effort
            });
        });
    }

    async hasImage(): Promise<boolean> {
        const psCommand = 'Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Clipboard]::ContainsImage()) { Write-Host "true" } else { Write-Host "false" }';
        const command = `powershell -NoProfile -Command "${psCommand}"`;
        
        return new Promise((resolve, reject) => {
            exec(command, { timeout: 5000 }, (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stdout.trim() === 'true');
            });
        });
    }

    async warmUp(): Promise<void> {
        const psCommand = 'Add-Type -AssemblyName System.Windows.Forms';
        const command = `powershell -NoProfile -Command "${psCommand}"`;
        
        return new Promise((resolve) => {
            exec(command, { timeout: 15000 }, () => {
                resolve();
            });
        });
    }

    private createTempFile(): ManagedTempFile {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-clipboard-'));
        const randomSuffix = crypto.randomBytes(8).toString('hex');
        const tempFile = path.join(tempDir, `clipboard-${randomSuffix}.png`);
        const fullPath = path.resolve(tempFile);
        
        return new ManagedTempFile(fullPath, tempDir);
    }

    private async executeClipboardCommand(filePath: string): Promise<boolean> {
        const escapedPath = filePath.replace(/'/g, "''").replace(/"/g, '""');
        const psCommand = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; try { if ([System.Windows.Forms.Clipboard]::ContainsImage()) { $image = [System.Windows.Forms.Clipboard]::GetImage(); $image.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Png); Write-Host 'success' } else { Write-Host 'no_image' } } catch { Write-Host 'error' }`;
        const command = `powershell -NoProfile -Command "${psCommand}"`;

        return new Promise((resolve, reject) => {
            exec(command, { timeout: this.timeout }, (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }

                const result = stdout.trim();
                resolve(result.startsWith('success'));
            });
        });
    }
}

class LinuxClipboardService implements ClipboardService {
    async getImage(): Promise<ClipboardResult> {
        // Try xclip first (X11), then wl-clipboard (Wayland)
        const commands = [
            'xclip -selection clipboard -t image/png -o',
            'wl-paste -t image/png'
        ];

        for (const command of commands) {
            try {
                const buffer = await this.executeCommand(command);
                if (buffer && buffer.length > 0) {
                    return {
                        buffer,
                        format: 'png'
                    };
                }
            } catch (error) {
                // Try next command
                continue;
            }
        }

        return null;
    }

    async clear(): Promise<void> {
        const commands = [
            'xclip -selection clipboard /dev/null',
            'wl-copy --clear'
        ];

        for (const command of commands) {
            try {
                await this.executeCommand(command);
                return;
            } catch (error) {
                // Try next command
                continue;
            }
        }
    }

    async hasImage(): Promise<boolean> {
        const commands = [
            'xclip -selection clipboard -t TARGETS -o',
            'wl-paste --list-types'
        ];

        for (const command of commands) {
            try {
                const output = await this.executeCommand(command);
                const outputStr = output.toString();
                return outputStr.includes('image/png') || outputStr.includes('image/jpeg');
            } catch (error) {
                continue;
            }
        }

        return false;
    }

    async warmUp(): Promise<void> {
        const commands = [
            'xclip -version',
            'wl-paste --version'
        ];

        for (const command of commands) {
            try {
                await this.executeCommand(command);
                return;
            } catch (error) {
                continue;
            }
        }
    }

    private executeCommand(command: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            exec(command, { encoding: 'buffer', timeout: 10000 }, (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stdout);
            });
        });
    }
}

class MacOSClipboardService implements ClipboardService {
    async getImage(): Promise<ClipboardResult> {
        try {
            const buffer = await this.executeCommand('pbpaste -Prefer png');
            
            if (buffer && buffer.length > 0) {
                return {
                    buffer,
                    format: 'png'
                };
            }
        } catch (error) {
            // No image in clipboard or command failed
        }

        return null;
    }

    async clear(): Promise<void> {
        return new Promise((resolve) => {
            exec('pbcopy < /dev/null', { timeout: 5000 }, () => {
                resolve(); // Always resolve, cleanup is best effort
            });
        });
    }

    async hasImage(): Promise<boolean> {
        try {
            const output = await this.executeCommand('pbpaste -Prefer public.png');
            return output.length > 0;
        } catch (error) {
            return false;
        }
    }

    async warmUp(): Promise<void> {
        try {
            await this.executeCommand('pbpaste -Prefer txt');
        } catch (error) {
            // Best effort
        }
    }

    private executeCommand(command: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            exec(command, { encoding: 'buffer', timeout: 10000 }, (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stdout);
            });
        });
    }
}

export function createClipboardService(): ClipboardService {
    switch (process.platform) {
        case 'win32':
            return new WindowsClipboardService();
        case 'linux':
            return new LinuxClipboardService();
        case 'darwin':
            return new MacOSClipboardService();
        default:
            throw new Error(`Unsupported platform: ${process.platform}`);
    }
}