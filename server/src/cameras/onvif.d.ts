declare module 'onvif' {
    export const Cam: new (options: Record<string, unknown>, callback: (error?: Error) => void) => any;
}
