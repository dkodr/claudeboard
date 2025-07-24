import * as vscode from 'vscode';
import { Disposable } from './clipboard';

export interface FileManagerService {
    createImageFile(imageData: Buffer, format: string): Promise<ImageFile>;
    cleanupOldImages(retentionDays: number): Promise<void>;
    ensureDirectoryExists(): Promise<void>;
}

export interface ImageFile extends Disposable {
    getUri(): vscode.Uri;
    getPath(): string;
    exists(): Promise<boolean>;
}

class ManagedImageFile implements ImageFile {
    constructor(
        private readonly uri: vscode.Uri,
        private readonly shouldCleanup: boolean = false
    ) {}

    getUri(): vscode.Uri {
        return this.uri;
    }

    getPath(): string {
        return this.uri.fsPath;
    }

    async exists(): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(this.uri);
            return true;
        } catch {
            return false;
        }
    }

    dispose(): void {
        if (this.shouldCleanup) {
            // Best effort cleanup - don't await or throw
            Promise.resolve(vscode.workspace.fs.delete(this.uri)).catch(() => {
                // Ignore cleanup errors
            });
        }
    }
}

export class WorkspaceFileManager implements FileManagerService {
    private readonly imageDirPath = '.claude/claude-code-chat-images';
    private readonly gitignoreContent = '*\n';

    private cachedWorkspaceFolder: vscode.WorkspaceFolder | null = null;
    private cachedImagesDir: vscode.Uri | null = null;

    async createImageFile(imageData: Buffer, format: string): Promise<ImageFile> {
        await this.ensureDirectoryExists();
        
        const imagesDir = await this.getImagesDirectory();
        const fileName = this.generateFileName(format);
        const imageUri = vscode.Uri.joinPath(imagesDir, fileName);
        
        await vscode.workspace.fs.writeFile(imageUri, imageData);
        
        return new ManagedImageFile(imageUri);
    }

    async cleanupOldImages(retentionDays: number): Promise<void> {
        // If retentionDays is 0, never delete images
        if (retentionDays === 0) {
            return;
        }

        try {
            const imagesDir = await this.getImagesDirectory();
            const files = await vscode.workspace.fs.readDirectory(imagesDir);
            const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
            
            const deletePromises = files
                .filter(([fileName, fileType]) => 
                    fileType === vscode.FileType.File && 
                    fileName !== '.gitignore' && 
                    this.isOldImageFile(fileName, cutoffTime)
                )
                .map(([fileName]) => {
                    const filePath = vscode.Uri.joinPath(imagesDir, fileName);
                    return Promise.resolve(vscode.workspace.fs.delete(filePath)).catch(() => {
                        // Log but don't fail cleanup for individual files
                        console.warn(`Failed to cleanup old image: ${fileName}`);
                    });
                });

            await Promise.allSettled(deletePromises);
        } catch (error) {
            // Don't fail the upload if cleanup fails
            console.warn('Error during image cleanup:', error);
        }
    }

    async ensureDirectoryExists(): Promise<void> {
        const imagesDir = await this.getImagesDirectory();
        
        try {
            await vscode.workspace.fs.createDirectory(imagesDir);
        } catch {
            // Directory might already exist, ignore error
        }

        await this.ensureGitignoreExists(imagesDir);
    }

    private async getWorkspaceFolder(): Promise<vscode.WorkspaceFolder> {
        if (!this.cachedWorkspaceFolder) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder available. Please open a folder in VS Code.');
            }
            this.cachedWorkspaceFolder = workspaceFolder;
        }
        return this.cachedWorkspaceFolder;
    }

    private async getImagesDirectory(): Promise<vscode.Uri> {
        if (!this.cachedImagesDir) {
            const workspaceFolder = await this.getWorkspaceFolder();
            this.cachedImagesDir = vscode.Uri.joinPath(workspaceFolder.uri, ...this.imageDirPath.split('/'));
        }
        return this.cachedImagesDir;
    }

    private generateFileName(format: string): string {
        const timestamp = Date.now();
        return `image_${timestamp}.${format}`;
    }

    private isOldImageFile(fileName: string, cutoffTime: number): boolean {
        const match = fileName.match(/^image_(\d+)\./);
        if (!match) {
            return false;
        }

        const fileTimestamp = parseInt(match[1], 10);
        return fileTimestamp < cutoffTime;
    }

    private async ensureGitignoreExists(imagesDir: vscode.Uri): Promise<void> {
        const gitignorePath = vscode.Uri.joinPath(imagesDir, '.gitignore');
        
        try {
            await vscode.workspace.fs.stat(gitignorePath);
        } catch {
            // .gitignore doesn't exist, create it
            const gitignoreData = new TextEncoder().encode(this.gitignoreContent);
            await vscode.workspace.fs.writeFile(gitignorePath, gitignoreData);
        }
    }
}

export function createFileManager(): FileManagerService {
    return new WorkspaceFileManager();
}