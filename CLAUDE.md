# Claudeboard - VS Code Extension

## Project Overview
A VS Code extension that shares images with Claude Code running on remote servers via Remote-SSH. Upload clipboard images instantly and get shareable file paths for seamless Claude Code workflows.

## Tech Stack
- **Language:** TypeScript (strict mode)
- **Framework:** VS Code Extension API
- **Dependencies:** @types/vscode, @types/node, typescript
- **Build:** TypeScript compiler
- **Package:** vsce (Visual Studio Code Extension)
- **Architecture:** Service-based with dependency injection

## Development Commands

### Build & Development
```bash
npm run compile      # Compile TypeScript to JavaScript
npm run watch        # Watch for changes and auto-compile
npm run clean        # Remove compiled output
```

### Testing & Validation
```bash
# No automated tests currently configured
# Manual testing: F5 in VS Code to launch Extension Development Host
```

### Packaging & Installation
```bash
npm run package                    # Create VSIX package
npm run install-package           # Install the generated VSIX
code --install-extension *.vsix   # Alternative install method
```

## Release Workflow

### Version Management
```bash
# Update version in package.json and create git tag
npm version patch    # For bug fixes (1.0.0 → 1.0.1)
npm version minor    # For new features (1.0.0 → 1.1.0)
npm version major    # For breaking changes (1.0.0 → 2.0.0)
```

### Git Workflow
```bash
# Daily development cycle
git status
git add .
git commit -m "feat: Add new feature"
git push origin main

# Release process
npm version patch              # Updates package.json and creates git tag
git push origin main          # Push commits
git push --tags              # Push tags
npm run package             # Create VSIX file
```

## Key Features
- **Cross-platform clipboard support:** Windows, Linux, macOS with enhanced macOS compatibility
- **Robust macOS clipboard detection:** Multi-strategy approach (AppleScript + pbpaste fallback)
- **Multiple image format support:** PNG, TIFF, JPEG with automatic format conversion
- **Remote-SSH integration:** Seamless uploads to remote servers
- **Configurable keybinding:** Choose from multiple keyboard shortcuts
- **Auto-cleanup:** Configurable retention period (0-365 days)
- **Dual context:** Works in both editor and terminal
- **Progress indicators:** Real-time upload feedback
- **Secure by design:** Uses existing SSH connections

## Configuration
The extension provides these settings:
- `imageUploader.keybinding`: Keyboard shortcut (ctrl+alt+v, ctrl+shift+v, alt+v, ctrl+v, f12)
- `imageUploader.retentionDays`: Image retention period (0-365 days, 0=never delete)

## Commands
- `imageUploader.uploadFromClipboard.editor`: Upload from clipboard (editor)
- `imageUploader.uploadFromClipboard.terminal`: Upload from clipboard (terminal)

## Extension Requirements
- VS Code version: ^1.74.0
- Extension kind: UI (runs in main VS Code process)
- Activation: On startup (all contexts)

## Architecture
- **Service-based design:** ClipboardService, FileManagerService, ProgressService, ConfigurationService
- **Cross-platform abstractions:** Platform-specific clipboard implementations with enhanced macOS support
- **Multi-strategy clipboard access:** AppleScript (primary) with pbpaste fallback for maximum compatibility
- **Format conversion:** Automatic TIFF/JPEG to PNG conversion using native macOS tools
- **Type safety:** TypeScript strict mode with Result<T,E> pattern
- **Resource management:** RAII pattern for guaranteed cleanup
- **Command pattern:** Decoupled business logic with dependency injection

## Notes
- No automated testing configured
- Manual workflow preferred over GitHub Actions
- Solo development project
- Designed specifically for Claude Code workflows