# macOS Clipboard Fix Implementation Plan

## Problem Summary

The Claudeboard VS Code extension fails to detect images in the clipboard on macOS, even when images are clearly present. Users receive "No image found in clipboard" errors despite having copied images from various sources.

## Root Cause Analysis

### Current Implementation Issues

1. **Single Format Assumption**: The current implementation only attempts to retrieve images as PNG using `pbpaste -Prefer png`, which fails when images are in other formats.

2. **Incorrect Type Identifiers**: The `hasImage()` method uses `pbpaste -Prefer public.png` which may not work reliably across all macOS versions and applications.

3. **No Error Visibility**: Empty catch blocks swallow errors, making debugging impossible.

4. **Format Variability**: Different macOS applications place images on the clipboard in different formats:
   - Screenshots (Cmd+Shift+4): `public.png` and `public.tiff`
   - Preview app: Format depends on source file (PNG, JPEG, TIFF)
   - Web browsers: Multiple formats including HTML and plain text URLs
   - Chat apps (Slack/Discord): Usually `public.png`
   - Image editors: Various proprietary formats plus standard ones

## Solution Architecture

### 1. Multi-Strategy Approach

Implement a robust clipboard service that tries multiple retrieval methods in order of reliability:

1. **AppleScript** (Primary): Most reliable, can detect and convert formats
2. **pbpaste with UTIs** (Fallback): Try multiple format identifiers
3. **Comprehensive error handling**: Log all attempts for debugging

### 2. Technical Implementation Details

#### A. AppleScript Commands

**Check for image presence:**
```applescript
tell application "System Events"
    set clipboard_types to (class of (the clipboard as record))
end tell
if clipboard_types contains «class PNGf» or clipboard_types contains «class TIFF» then
    return "true"
else
    return "false"
end if
```

**Retrieve image as PNG (with format conversion):**
```applescript
try
    -- Try PNG first
    set imgData to (the clipboard as «class PNGf»)
    return imgData
on error
    try
        -- Try TIFF and convert to PNG
        set imgData to (the clipboard as «class TIFF»)
        -- macOS automatically converts when requesting as PNG
        return (the clipboard as «class PNGf»)
    on error
        return ""
    end try
end try
```

#### B. pbpaste Fallback Commands

Use proper UTIs (Uniform Type Identifiers):
- `pbpaste -Prefer public.png`
- `pbpaste -Prefer public.tiff`
- `pbpaste -Prefer public.jpeg`

**Important**: Use `-Prefer` (capital P) for better compatibility.

## Detailed Implementation Plan

### 1. Update MacOSClipboardService (src/services/clipboard.ts)

```typescript
class MacOSClipboardService implements ClipboardService {
    private readonly logger = this.createLogger();
    private readonly timeout = 10000;
    private debugMode = false; // Can be set via configuration

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
            throw new Error(`Failed to read temp file: ${error.message}`);
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
            exec(command, {
                encoding: binary ? 'buffer' : 'utf8',
                timeout: this.timeout
            }, (error, stdout, stderr) => {
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

    async clear(): Promise<void> {
        // Existing implementation is fine
        return new Promise((resolve) => {
            exec('pbcopy < /dev/null', { timeout: 5000 }, () => {
                resolve();
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
}
```

### 2. Add Debug Command (src/commands/debugClipboard.ts)

Create a new file with comprehensive debugging capabilities:

```typescript
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
            exec('osascript -e "clipboard info"', (err, stdout) => {
                resolve(err ? `Error: ${err.message}` : stdout);
            });
        });
        output.appendLine('Clipboard Info (via osascript):');
        output.appendLine(info);
        output.appendLine('');
    } catch (error) {
        output.appendLine(`Failed to get clipboard info: ${error.message}`);
    }
    
    // Test hasImage
    output.appendLine('Testing hasImage()...');
    try {
        const hasImage = await clipboard.hasImage();
        output.appendLine(`Result: ${hasImage}`);
    } catch (error) {
        output.appendLine(`Error: ${error.message}`);
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
        output.appendLine(`Error: ${error.message}`);
    }
    
    // Test individual formats
    output.appendLine('');
    output.appendLine('Testing individual formats:');
    const formats = ['public.png', 'public.tiff', 'public.jpeg', 'png', 'tiff', 'jpeg'];
    
    for (const format of formats) {
        try {
            const { exec } = require('child_process');
            const result = await new Promise<number>((resolve) => {
                exec(`pbpaste -Prefer ${format} | wc -c`, (err, stdout) => {
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
```

### 3. Update extension.ts

Add the debug command registration:

```typescript
// Add to imports
import { debugClipboard } from './commands/debugClipboard';

// In activate() function, add after existing command registrations:
const debugCommand = vscode.commands.registerCommand(
    'imageUploader.debugClipboard',
    () => debugClipboard(clipboard)
);

// Add to subscriptions
context.subscriptions.push(debugCommand);
```

### 4. Update package.json

Add the debug command to the commands section:

```json
{
    "contributes": {
        "commands": [
            // ... existing commands ...
            {
                "command": "imageUploader.debugClipboard",
                "title": "Claudeboard: Debug Clipboard",
                "category": "Developer"
            }
        ],
        "configuration": {
            "properties": {
                // ... existing properties ...
                "imageUploader.debug": {
                    "type": "boolean",
                    "default": false,
                    "description": "Enable debug logging for clipboard operations"
                }
            }
        }
    }
}
```

## Testing Strategy

### Test Cases

1. **macOS Screenshot**
   - Use Cmd+Shift+4, then Ctrl+Cmd+Shift+4 to copy to clipboard
   - Should detect as `public.png`

2. **Preview App**
   - Open PNG, JPEG, and TIFF files
   - Copy with Cmd+C
   - Each should be detected and retrieved

3. **Web Browsers**
   - Right-click → Copy Image from Safari and Chrome
   - Should handle various formats

4. **Chat Applications**
   - Copy images from Slack, Discord
   - Usually `public.png` format

5. **Image Editors**
   - Test with common editors (Pixelmator, Photoshop)
   - May use proprietary formats

### Debug Process for Users

1. User reports "No image found" error
2. Ask them to run Command Palette → "Claudeboard: Debug Clipboard"
3. Share the output from the Output panel
4. The debug info will show:
   - Available clipboard formats
   - Which methods succeeded/failed
   - Exact error messages

## Implementation Notes

### Binary Data Handling
- Always use `encoding: 'buffer'` when executing commands that return image data
- Never attempt to convert binary data to strings

### Timeout Considerations
- 10 second timeout is reasonable for clipboard operations
- AppleScript operations may be slower on first run

### Error Messages
- Provide clear, actionable error messages
- Include suggestions (e.g., "Try copying the image again")

### Performance
- The warmUp() method pre-loads AppleScript runtime
- Multiple strategies add ~100-500ms in worst case
- Most operations complete in <50ms

## Rollback Plan

If issues persist:
1. Add a configuration option to disable AppleScript
2. Provide manual format selection in settings
3. Create platform-specific implementations

## Success Criteria

1. Successfully retrieves images from all common macOS applications
2. Clear error messages when clipboard doesn't contain images
3. Debug command provides actionable information
4. No performance regression for successful operations
5. Works across macOS versions (10.15+)