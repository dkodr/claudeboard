import * as vscode from 'vscode';
import { ClipboardService, ImageData } from '../services/clipboard';
import { FileManagerService, ImageFile } from '../services/fileManager';
import { ProgressService, ProgressPatterns, ProgressSteps } from '../services/progress';
import { ConfigurationService } from '../services/configuration';
import { Result, success, failure, ExtensionResult, ClipboardError, FileSystemError } from '../common/result';

export type InsertDestination = 'editor' | 'terminal';

export interface UploadImageCommand {
    execute(destination: InsertDestination): Promise<ExtensionResult<string>>;
}

export interface CommandDependencies {
    clipboard: ClipboardService;
    fileManager: FileManagerService;
    progress: ProgressService;
    config: ConfigurationService;
}

class ImageUploadCommand implements UploadImageCommand {
    constructor(private readonly deps: CommandDependencies) {}

    async execute(destination: InsertDestination): Promise<ExtensionResult<string>> {
        // Validate remote connection first
        const remoteCheck = this.validateRemoteConnection();
        if (Result.isFailure(remoteCheck)) {
            return remoteCheck;
        }

        return await this.deps.progress.withSequentialProgress(
            ProgressPatterns.IMAGE_UPLOAD_WORKFLOW,
            [
                () => this.checkClipboard(),
                (reporter) => this.uploadAndInsert(destination, reporter)
            ]
        );
    }

    private validateRemoteConnection(): ExtensionResult<void> {
        if (!vscode.env.remoteName) {
            return failure(new ClipboardError(
                'No remote connection detected. Please connect to a server using Remote-SSH to upload images.',
                { remoteName: vscode.env.remoteName }
            ));
        }
        return success(undefined);
    }

    private async checkClipboard(): Promise<ExtensionResult<ImageData>> {
        try {
            const imageData = await this.deps.clipboard.getImage();
            
            if (!imageData) {
                return failure(new ClipboardError('No image found in clipboard'));
            }

            return success(imageData);
        } catch (error) {
            return failure(new ClipboardError(
                'Failed to access clipboard',
                { originalError: error }
            ));
        }
    }

    private async uploadAndInsert(
        destination: InsertDestination,
        reporter: any
    ): Promise<ExtensionResult<string>> {
        reporter.report(ProgressSteps.preparing());

        try {
            // Get image from previous step's result - this is a simplified approach
            // In a more complex implementation, we'd pass results between steps
            const imageData = await this.deps.clipboard.getImage();
            if (!imageData) {
                return failure(new ClipboardError('Image no longer available in clipboard'));
            }

            // Cleanup old images based on user configuration
            const retentionDays = this.deps.config.getRetentionDays();
            await this.deps.fileManager.cleanupOldImages(retentionDays);

            reporter.report(ProgressSteps.uploading());

            // Create image file
            const imageFile = await this.deps.fileManager.createImageFile(
                imageData.buffer,
                imageData.format
            );

            reporter.report(ProgressSteps.inserting());

            // Insert URL into editor/terminal
            const insertResult = await this.insertImageUrl(imageFile.getPath(), destination);
            if (Result.isFailure(insertResult)) {
                imageFile.dispose();
                return insertResult;
            }

            reporter.report(ProgressSteps.cleaning());

            // Clear clipboard if configured to do so
            if (this.deps.config.getClearClipboardAfterUpload()) {
                await this.deps.clipboard.clear();
            }

            const imageUrl = imageFile.getPath();
            
            // Show success message
            vscode.window.showInformationMessage(`Image uploaded: ${imageUrl}`);

            return success(imageUrl);

        } catch (error) {
            return failure(new FileSystemError(
                'Failed to upload image',
                { originalError: error, destination }
            ));
        }
    }

    private async insertImageUrl(url: string, destination: InsertDestination): Promise<ExtensionResult<void>> {
        try {
            if (destination === 'editor') {
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor) {
                    return failure(new FileSystemError('No active editor available'));
                }

                const position = activeEditor.selection.active;
                await activeEditor.edit(editBuilder => {
                    editBuilder.insert(position, url);
                });
            } else if (destination === 'terminal') {
                const activeTerminal = vscode.window.activeTerminal;
                if (!activeTerminal) {
                    return failure(new FileSystemError('No active terminal available'));
                }

                activeTerminal.sendText(url, false);
            }

            return success(undefined);
        } catch (error) {
            return failure(new FileSystemError(
                `Failed to insert image URL into ${destination}`,
                { originalError: error, destination, url }
            ));
        }
    }
}

// Optimized version that passes results between steps
class OptimizedImageUploadCommand implements UploadImageCommand {
    constructor(private readonly deps: CommandDependencies) {}

    async execute(destination: InsertDestination): Promise<ExtensionResult<string>> {
        // Validate remote connection first
        const remoteCheck = this.validateRemoteConnection();
        if (Result.isFailure(remoteCheck)) {
            return remoteCheck;
        }

        // Step 1: Check clipboard
        const clipboardResult = await this.deps.progress.withProgress(
            "Checking clipboard...",
            () => this.checkClipboard()
        );

        if (Result.isFailure(clipboardResult)) {
            vscode.window.showWarningMessage(clipboardResult.error.message);
            return clipboardResult;
        }

        // Step 2: Upload and insert
        return await this.deps.progress.withProgress(
            `Uploading image to Server...`,
            (reporter) => this.uploadAndInsert(clipboardResult.data, destination, reporter)
        );
    }

    private validateRemoteConnection(): ExtensionResult<void> {
        if (!vscode.env.remoteName) {
            return failure(new ClipboardError(
                'No remote connection detected. Please connect to a server using Remote-SSH to upload images.',
                { remoteName: vscode.env.remoteName }
            ));
        }
        return success(undefined);
    }

    private async checkClipboard(): Promise<ExtensionResult<ImageData>> {
        try {
            const imageData = await this.deps.clipboard.getImage();
            
            if (!imageData) {
                return failure(new ClipboardError('No image found in clipboard'));
            }

            return success(imageData);
        } catch (error) {
            return failure(new ClipboardError(
                'Failed to access clipboard',
                { originalError: error }
            ));
        }
    }

    private async uploadAndInsert(
        imageData: ImageData,
        destination: InsertDestination,
        reporter: any
    ): Promise<ExtensionResult<string>> {
        try {
            reporter.report(ProgressSteps.preparing());

            // Cleanup old images first based on user configuration
            const retentionDays = this.deps.config.getRetentionDays();
            await this.deps.fileManager.cleanupOldImages(retentionDays);

            reporter.report(ProgressSteps.uploading());

            // Create image file
            const imageFile = await this.deps.fileManager.createImageFile(
                imageData.buffer,
                imageData.format
            );

            reporter.report(ProgressSteps.inserting());

            // Insert URL into editor/terminal
            const insertResult = await this.insertImageUrl(imageFile.getPath(), destination);
            if (Result.isFailure(insertResult)) {
                imageFile.dispose();
                return insertResult;
            }

            reporter.report(ProgressSteps.cleaning());

            // Clear clipboard if configured to do so
            if (this.deps.config.getClearClipboardAfterUpload()) {
                await this.deps.clipboard.clear();
            }

            const imageUrl = imageFile.getPath();
            
            // Show success message
            vscode.window.showInformationMessage(`Image uploaded: ${imageUrl}`);

            return success(imageUrl);

        } catch (error) {
            return failure(new FileSystemError(
                'Failed to upload image',
                { originalError: error, destination }
            ));
        }
    }

    private async insertImageUrl(url: string, destination: InsertDestination): Promise<ExtensionResult<void>> {
        try {
            if (destination === 'editor') {
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor) {
                    return failure(new FileSystemError('No active editor available'));
                }

                const position = activeEditor.selection.active;
                await activeEditor.edit(editBuilder => {
                    editBuilder.insert(position, url);
                });
            } else if (destination === 'terminal') {
                const activeTerminal = vscode.window.activeTerminal;
                if (!activeTerminal) {
                    return failure(new FileSystemError('No active terminal available'));
                }

                activeTerminal.sendText(url, false);
            }

            return success(undefined);
        } catch (error) {
            return failure(new FileSystemError(
                `Failed to insert image URL into ${destination}`,
                { originalError: error, destination, url }
            ));
        }
    }
}

// Factory function
export function createUploadImageCommand(deps: CommandDependencies): UploadImageCommand {
    return new OptimizedImageUploadCommand(deps);
}

// Command handler for VS Code commands
export async function handleUploadCommand(
    destination: InsertDestination,
    deps: CommandDependencies
): Promise<void> {
    const command = createUploadImageCommand(deps);
    const result = await command.execute(destination);

    if (Result.isFailure(result)) {
        vscode.window.showErrorMessage(`Upload error: ${result.error.message}`);
    }
}