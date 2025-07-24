# Claudeboard

Share images with Claude Code running on a remote server via Remote-SSH. Upload clipboard images instantly and get shareable file paths for seamless Claude Code workflows.

## ✨ Features

- 🖼️ **Instant clipboard upload** - Press `Ctrl+Alt+V` to upload any image from clipboard
- 🌍 **Cross-platform support** - Works on Windows, Linux, and macOS
- 🔗 **Smart path insertion** - Automatically pastes file paths in editor or terminal
- 🌐 **Remote-SSH integration** - Seamlessly works with VS Code Remote-SSH
- 🧹 **Configurable auto-cleanup** - Set retention period (0-365 days, 0 = never delete)
- ⚡ **Real-time progress** - Visual feedback during upload process
- 🔐 **Secure by design** - Uses your existing SSH connections
- 🎯 **Dual context** - Works in both code editors and integrated terminals

## 🚀 Quick Start

### Step 1: Prerequisites
- Install VS Code Remote-SSH extension
- Connect to your remote server
- Open a workspace folder on the remote server

### Step 2: Upload Images
1. **Copy any image to clipboard** (screenshot, file copy, web image)
2. **Press `Ctrl+Alt+V`** in VS Code editor or terminal
3. **Watch the magic** - Image uploads instantly and path is pasted
4. **Done!** Your image is now accessible at the inserted file path

💡 **Claude Code Tip**: The generated file paths can be directly shared with Claude Code for image analysis, making it perfect for discussing screenshots, diagrams, or visual debugging.

## 🌐 Upload Destination

### Remote Server Upload
- **Location**: `.claude/claude-code-chat-images/` in workspace root
- **Automatic cleanup**: Files older than 30 days are automatically deleted
- **Git ignored**: Images are automatically excluded from git commits
- **Secure**: Uses existing Remote-SSH connection, no additional authentication needed
- **Returns**: Full file path (e.g., `/workspace/.claude/claude-code-chat-images/image_1234567890.png`)

## ⚙️ Configuration

Go to `File > Preferences > Settings` and search for "Claudeboard":

### Available Settings:

#### Keybinding
Choose your preferred keyboard shortcut:
- `Ctrl+Alt+V` (default)
- `Ctrl+Shift+V`  
- `Alt+V`
- `Ctrl+V` (may conflict with normal paste)
- `F12`

#### Retention Period
Control how long uploaded images are kept:
- **Default**: 30 days
- **Range**: 0-365 days
- **Special**: Set to `0` to never delete images automatically

**Note**: The extension always inserts raw file paths for maximum compatibility.

## 📋 Requirements

- **VS Code 1.74.0** or newer
- **VS Code Remote-SSH extension** (for remote server connections)
- **Active remote connection** to your development server
- **Workspace folder** opened on the remote server

### Platform Support
- ✅ **Windows** - Full clipboard support via PowerShell
- ✅ **Linux** - Clipboard support via `xclip` or `wl-clipboard` 
- ✅ **macOS** - Clipboard support via `pbpaste`

### Platform-Specific Dependencies
- **Linux**: Install `xclip` (X11) or `wl-clipboard` (Wayland)
- **macOS**: Uses built-in `pbpaste` (no additional setup)
- **Windows**: Uses built-in PowerShell (no additional setup)

## 🎨 Supported Formats

- **PNG** (automatic conversion from clipboard)
- **Automatic cleanup** after 30 days
- **Workspace integration** with `.claude/` directory structure

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+Alt+V` | Upload image from clipboard | Editor & Terminal |
| `Ctrl+V` | Normal paste (unaffected) | Editor & Terminal |

**Note**: You can change the upload shortcut in settings. `Ctrl+V` always works normally for text pasting.

## 📦 Installation

### From VS Code Marketplace (Recommended)
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Claudeboard"
4. Click "Install"

### From .vsix file
1. Download the latest `.vsix` file from [Releases](https://github.com/dkodr/claudeboard/releases)
2. Open VS Code
3. Press `Ctrl+Shift+P` and type "Extensions: Install from VSIX"
4. Select the downloaded `.vsix` file

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "No remote connection detected" | Connect to remote server using Remote-SSH extension |
| "No workspace folder available" | Open a folder on the remote server |
| Image not detected | Make sure image is copied to clipboard (not just selected) |
| PowerShell error | Check if PowerShell is available and ExecutionPolicy allows execution |
| Upload timeout | Check Remote-SSH connection stability |
| Paste error | Make sure cursor is in text editor or terminal |
| File permission error | Check write permissions in workspace directory |

## 📁 File Organization

```
workspace/
├── .claude/
│   └── claude-code-chat-images/
│       ├── .gitignore          # Automatically created
│       ├── image_1234567890.png
│       └── image_1234567891.png
└── your-project-files/
```

## 🛠️ Development

Want to contribute or build from source?

```bash
# Clone repository
git clone https://github.com/dkodr/claudeboard.git
cd claudeboard

# Install dependencies
npm install

# Development workflow
npm run compile     # Compile TypeScript
npm run watch      # Watch for changes
npm run package    # Create VSIX package

# Testing
code .             # Open in VS Code
# Press F5 to launch Extension Development Host
```

### Architecture
- **TypeScript** with strict mode for type safety
- **Service-based architecture** for maintainability  
- **Cross-platform clipboard abstractions**
- **Result<T,E> pattern** for error handling
- **RAII** for automatic resource cleanup

## 🤝 Contributing

If you want to help with development:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](https://github.com/dkodr/claudeboard/blob/HEAD/LICENSE) for details.

## 🔗 Links

- [VS Code Remote-SSH](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh) - Required extension
- [VS Code Extensions](https://marketplace.visualstudio.com/vscode) - Marketplace
- [GitHub Issues](https://github.com/dkodr/claudeboard/issues) - Report issues

---

**Made with ❤️ for Claude Code and VS Code Remote Development users**