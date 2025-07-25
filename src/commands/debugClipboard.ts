import * as vscode from 'vscode';
import { ClipboardService } from '../services/clipboard';

export async function debugClipboard(clipboard: ClipboardService): Promise<void> {
    const output = vscode.window.createOutputChannel('Claudeboard Debug');
    output.show();
    
    output.appendLine('=== Claudeboard Clipboard Debug ===');
    output.appendLine(`Time: ${new Date().toISOString()}`);
    output.appendLine(`Platform: ${process.platform}`);
    output.appendLine('');
    
    // Check clipboard info
    try {
        const { exec } = require('child_process');
        const info = await new Promise<string>((resolve) => {
            exec('osascript -e "clipboard info"', (err: any, stdout: any) => {
                resolve(err ? `Error: ${err.message}` : stdout);
            });
        });
        output.appendLine('Clipboard Info (via osascript):');
        output.appendLine(info);
        output.appendLine('');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        output.appendLine(`Failed to get clipboard info: ${errorMessage}`);
    }
    
    // Test hasImage
    output.appendLine('Testing hasImage()...');
    try {
        const hasImage = await clipboard.hasImage();
        output.appendLine(`Result: ${hasImage}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        output.appendLine(`Error: ${errorMessage}`);
    }
    output.appendLine('');
    
    // Test getImage
    output.appendLine('Testing getImage()...');
    try {
        const imageData = await clipboard.getImage();
        if (imageData) {
            output.appendLine(`Success! Format: ${imageData.format}, Size: ${imageData.buffer.length} bytes`);
        } else {
            output.appendLine('No image data returned');
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        output.appendLine(`Error: ${errorMessage}`);
    }
    
    // Test individual formats
    output.appendLine('');
    output.appendLine('Testing individual formats:');
    const formats = ['public.png', 'public.tiff', 'public.jpeg', 'png', 'tiff', 'jpeg'];
    
    for (const format of formats) {
        try {
            const { exec } = require('child_process');
            const result = await new Promise<number>((resolve) => {
                exec(`pbpaste -Prefer ${format} | wc -c`, (err: any, stdout: any) => {
                    resolve(err ? 0 : parseInt(stdout.trim()));
                });
            });
            output.appendLine(`  ${format}: ${result > 0 ? `${result} bytes` : 'not available'}`);
        } catch {
            output.appendLine(`  ${format}: error`);
        }
    }
    
    output.appendLine('');
    output.appendLine('=== Debug Complete ===');
}