import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
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
    private readonly timeout = 10000;
    
    private get debugMode(): boolean {
        return vscode.workspace.getConfiguration('imageUploader').get('debug', false);
    }

    async getImage(): Promise<ClipboardResult> {
        this.log('Getting image from clipboard...');
        
        // Strategy 1: AppleScript for PNG with auto-conversion
        try {
            const buffer = await this.getImageViaAppleScript();
            if (buffer && buffer.length > 0) {
                this.log('Successfully retrieved image via AppleScript');
                return { buffer, format: 'png' };
            }
        } catch (error) {
            this.logError('AppleScript failed', error);
        }

        // Strategy 2: pbpaste with multiple formats
        const formats = [
            { uti: 'public.png', format: 'png' },
            { uti: 'public.tiff', format: 'tiff' },
            { uti: 'public.jpeg', format: 'jpeg' }
        ];

        for (const { uti, format } of formats) {
            try {
                const buffer = await this.getImageViaPbpaste(uti);
                if (buffer && buffer.length > 0) {
                    this.log(`Successfully retrieved image via pbpaste (${uti})`);
                    return { buffer, format };
                }
            } catch (error) {
                this.logError(`pbpaste failed for ${uti}`, error);
            }
        }

        this.log('No image found in clipboard after trying all methods');
        return null;
    }

    async hasImage(): Promise<boolean> {
        try {
            // Use AppleScript to check clipboard contents
            const script = `
                tell application "System Events"
                    set clipTypes to (class of (the clipboard as record))
                end tell
                if clipTypes contains «class PNGf» or clipTypes contains «class TIFF» or clipTypes contains «class JPEG» then
                    return "true"
                else
                    return "false"
                end if
            `;
            
            const result = await this.executeAppleScript(script);
            return result.toString().trim() === 'true';
        } catch (error) {
            this.logError('Failed to check clipboard contents', error);
            
            // Fallback: try to get clipboard info
            try {
                const output = await this.executeCommand('osascript -e "clipboard info"');
                const info = output.toString();
                return info.includes('image') || 
                       info.includes('PNGf') || 
                       info.includes('TIFF') || 
                       info.includes('JPEG');
            } catch {
                return false;
            }
        }
    }

    async clear(): Promise<void> {
        return new Promise((resolve) => {
            exec('pbcopy < /dev/null', { timeout: 5000 }, () => {
                resolve(); // Always resolve, cleanup is best effort
            });
        });
    }

    async warmUp(): Promise<void> {
        try {
            // Pre-check clipboard access
            await this.executeCommand('osascript -e "clipboard info"');
        } catch {
            // Best effort
        }
    }

    private async getImageViaAppleScript(): Promise<Buffer> {
        const script = `
            set tempFile to (path to temporary items as text) & "clipboard_image_" & (random number from 1000 to 9999) & ".png"
            set posixPath to POSIX path of tempFile
            
            try
                set imageData to (the clipboard as «class PNGf»)
                set fileRef to open for access tempFile with write permission
                write imageData to fileRef
                close access fileRef
                return posixPath
            on error
                try
                    close access tempFile
                end try
                try
                    -- Try TIFF format
                    set imageData to (the clipboard as «class TIFF»)
                    set fileRef to open for access tempFile with write permission
                    write imageData to fileRef
                    close access fileRef
                    
                    -- Convert to PNG using sips
                    do shell script "sips -s format png " & quoted form of posixPath & " --out " & quoted form of posixPath
                    return posixPath
                on error errMsg
                    return "ERROR:" & errMsg
                end try
            end try
        `;

        const result = await this.executeAppleScript(script);
        const output = result.toString().trim();
        
        if (output.startsWith('ERROR:')) {
            throw new Error(output.substring(6));
        }

        // Read the temp file and clean up
        const tempPath = output;
        try {
            const buffer = await fs.promises.readFile(tempPath);
            await fs.promises.unlink(tempPath);
            return buffer;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read temp file: ${errorMessage}`);
        }
    }

    private async getImageViaPbpaste(uti: string): Promise<Buffer> {
        return await this.executeCommand(`pbpaste -Prefer ${uti}`, true);
    }

    private async executeAppleScript(script: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const child = exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
                encoding: 'buffer',
                timeout: this.timeout
            }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`AppleScript error: ${error.message}\nStderr: ${stderr.toString()}`));
                    return;
                }
                resolve(stdout);
            });
        });
    }

    private async executeCommand(command: string, binary = false): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const options = binary 
                ? { encoding: 'buffer' as const, timeout: this.timeout }
                : { encoding: 'utf8' as const, timeout: this.timeout };
                
            exec(command, options, (error: any, stdout: any, stderr: any) => {
                if (error) {
                    reject(new Error(`Command failed: ${error.message}\nStderr: ${stderr.toString()}`));
                    return;
                }
                resolve(binary ? stdout : Buffer.from(stdout.toString()));
            });
        });
    }

    private log(message: string): void {
        if (this.debugMode) {
            console.log(`[MacOSClipboard] ${message}`);
        }
    }

    private logError(message: string, error: any): void {
        console.error(`[MacOSClipboard] ${message}:`, error);
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