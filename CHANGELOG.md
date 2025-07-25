# Changelog

All notable changes to the "Claudeboard" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-01-25

### Fixed
- **macOS clipboard detection**: Implemented robust multi-strategy clipboard access to resolve "No image found in clipboard" errors
- **Format compatibility**: Added support for multiple image formats (PNG, TIFF, JPEG) with automatic conversion
- **AppleScript integration**: Primary clipboard access method with native macOS format handling
- **Fallback mechanisms**: Enhanced pbpaste fallback with proper UTI (Uniform Type Identifier) support

### Technical Improvements
- Multi-strategy clipboard service architecture (AppleScript → pbpaste fallback)
- Automatic TIFF to PNG conversion using macOS sips command
- Comprehensive error handling with silent fallbacks
- Support for images from various macOS applications (Preview, browsers, chat apps, screenshots)

## [1.0.0] - 2025-01-24

### Added
- Initial release
- Cross-platform clipboard image upload (Windows, Linux, macOS)
- Remote-SSH server integration
- Configurable keyboard shortcuts
- Automatic image cleanup with configurable retention period
- Progress indicators and error handling

[1.0.1]: https://github.com/dkodr/claudeboard/releases/tag/v1.0.1
[1.0.0]: https://github.com/dkodr/claudeboard/releases/tag/v1.0.0