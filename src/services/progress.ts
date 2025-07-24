import * as vscode from 'vscode';

export interface ProgressStep {
    message: string;
    increment?: number;
}

export interface ProgressReporter {
    report(step: ProgressStep): void;
}

export interface ProgressService {
    withProgress<T>(
        title: string,
        task: (reporter: ProgressReporter) => Promise<T>
    ): Promise<T>;
    
    withSequentialProgress<T>(
        steps: ProgressStepConfig[],
        tasks: Array<(reporter: ProgressReporter) => Promise<any>>
    ): Promise<T>;
}

export interface ProgressStepConfig {
    title: string;
    cancellable?: boolean;
}

class VSCodeProgressReporter implements ProgressReporter {
    constructor(
        private readonly vscodeProgress: vscode.Progress<{ message?: string; increment?: number }>
    ) {}

    report(step: ProgressStep): void {
        this.vscodeProgress.report({
            message: step.message,
            increment: step.increment
        });
    }
}

export class NotificationProgressService implements ProgressService {
    async withProgress<T>(
        title: string,
        task: (reporter: ProgressReporter) => Promise<T>
    ): Promise<T> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: false
        }, async (progress) => {
            const reporter = new VSCodeProgressReporter(progress);
            return await task(reporter);
        });
    }

    async withSequentialProgress<T>(
        steps: ProgressStepConfig[],
        tasks: Array<(reporter: ProgressReporter) => Promise<any>>
    ): Promise<T> {
        if (steps.length !== tasks.length) {
            throw new Error('Steps and tasks arrays must have the same length');
        }

        let result: T;
        
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const task = tasks[i];
            
            const stepResult = await this.withProgress(step.title, task);
            
            // Store the result from the last task
            if (i === tasks.length - 1) {
                result = stepResult;
            }
        }

        return result!;
    }
}

// Predefined progress patterns for common workflows
export class ProgressPatterns {
    static readonly CLIPBOARD_CHECK: ProgressStepConfig = {
        title: "Checking clipboard...",
        cancellable: false
    };

    static readonly IMAGE_UPLOAD: ProgressStepConfig = {
        title: "Uploading image...",
        cancellable: false
    };

    static readonly IMAGE_UPLOAD_WORKFLOW = [
        ProgressPatterns.CLIPBOARD_CHECK,
        ProgressPatterns.IMAGE_UPLOAD
    ];

    static createUploadStep(destination: string): ProgressStepConfig {
        return {
            title: `Uploading image to ${destination}...`,
            cancellable: false
        };
    }
}

// Common progress steps as reusable functions
export class ProgressSteps {
    static preparing(): ProgressStep {
        return { message: "Preparing image...", increment: 30 };
    }

    static uploading(): ProgressStep {
        return { message: "Uploading...", increment: 50 };
    }

    static inserting(): ProgressStep {
        return { message: "Inserting link...", increment: 20 };
    }

    static cleaning(): ProgressStep {
        return { message: "Cleaning up...", increment: 10 };
    }

    static custom(message: string, increment?: number): ProgressStep {
        return { message, increment };
    }
}

export function createProgressService(): ProgressService {
    return new NotificationProgressService();
}