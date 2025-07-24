// Result<T, E> pattern for proper error handling without exceptions

export type Result<T, E = Error> = Success<T> | Failure<E>;

export interface Success<T> {
    readonly success: true;
    readonly data: T;
}

export interface Failure<E> {
    readonly success: false;
    readonly error: E;
}

// Constructor functions
export function success<T>(data: T): Success<T> {
    return { success: true, data };
}

export function failure<E>(error: E): Failure<E> {
    return { success: false, error };
}

// Utility functions for working with Results
export namespace Result {
    export function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
        return result.success;
    }

    export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
        return !result.success;
    }

    // Map over the success value
    export function map<T, U, E>(
        result: Result<T, E>,
        fn: (value: T) => U
    ): Result<U, E> {
        return isSuccess(result) 
            ? success(fn(result.data))
            : result;
    }

    // Chain operations that return Results
    export function flatMap<T, U, E>(
        result: Result<T, E>,
        fn: (value: T) => Result<U, E>
    ): Result<U, E> {
        return isSuccess(result) 
            ? fn(result.data)
            : result;
    }

    // Map over the error value
    export function mapError<T, E, F>(
        result: Result<T, E>,
        fn: (error: E) => F
    ): Result<T, F> {
        return isFailure(result)
            ? failure(fn(result.error))
            : result;
    }

    // Get value or provide default
    export function getOrElse<T, E>(
        result: Result<T, E>,
        defaultValue: T
    ): T {
        return isSuccess(result) ? result.data : defaultValue;
    }

    // Get value or compute default lazily
    export function getOrElseLazy<T, E>(
        result: Result<T, E>,
        getDefault: () => T
    ): T {
        return isSuccess(result) ? result.data : getDefault();
    }

    // Convert Promise to Result
    export async function fromPromise<T>(
        promise: Promise<T>
    ): Promise<Result<T, Error>> {
        try {
            const data = await promise;
            return success(data);
        } catch (error) {
            return failure(error instanceof Error ? error : new Error(String(error)));
        }
    }

    // Convert Result to Promise (throwing on failure)
    export function toPromise<T, E>(result: Result<T, E>): Promise<T> {
        return isSuccess(result)
            ? Promise.resolve(result.data)
            : Promise.reject(result.error);
    }

    // Combine multiple Results into one
    export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
        const values: T[] = [];
        
        for (const result of results) {
            if (isFailure(result)) {
                return result;
            }
            values.push(result.data);
        }
        
        return success(values);
    }

    // Apply a function to multiple Results
    export function sequence<T, E>(results: Result<T, E>[]): Result<T[], E> {
        return combine(results);
    }
}

// Async Result utilities
export namespace AsyncResult {
    export async function map<T, U, E>(
        resultPromise: Promise<Result<T, E>>,
        fn: (value: T) => U | Promise<U>
    ): Promise<Result<U, E>> {
        const result = await resultPromise;
        if (Result.isFailure(result)) {
            return result;
        }
        
        try {
            const mapped = await fn(result.data);
            return success(mapped);
        } catch (error) {
            return failure(error instanceof Error ? error as E : new Error(String(error)) as E);
        }
    }

    export async function flatMap<T, U, E>(
        resultPromise: Promise<Result<T, E>>,
        fn: (value: T) => Promise<Result<U, E>>
    ): Promise<Result<U, E>> {
        const result = await resultPromise;
        return Result.isSuccess(result) ? fn(result.data) : result;
    }
}

// Domain-specific error types
export class ExtensionError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly context?: Record<string, any>
    ) {
        super(message);
        this.name = 'ExtensionError';
    }
}

export class ClipboardError extends ExtensionError {
    constructor(message: string, context?: Record<string, any>) {
        super(message, 'CLIPBOARD_ERROR', context);
        this.name = 'ClipboardError';
    }
}

export class FileSystemError extends ExtensionError {
    constructor(message: string, context?: Record<string, any>) {
        super(message, 'FILESYSTEM_ERROR', context);
        this.name = 'FileSystemError';
    }
}

export class ValidationError extends ExtensionError {
    constructor(message: string, context?: Record<string, any>) {
        super(message, 'VALIDATION_ERROR', context);
        this.name = 'ValidationError';
    }
}

// Type aliases for common Result patterns
export type ClipboardResult<T> = Result<T, ClipboardError>;
export type FileSystemResult<T> = Result<T, FileSystemError>;
export type ValidationResult<T> = Result<T, ValidationError>;
export type ExtensionResult<T> = Result<T, ExtensionError>;