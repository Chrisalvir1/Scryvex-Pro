import { Request, Response } from 'express';
import crypto from 'crypto';

export function instrumentRequest(req: Request, res: Response) {
    const start = Date.now();
    const correlationId = crypto.randomUUID();
    const method = req.method;
    const path = req.baseUrl + req.path;

    let finished = false;

    res.once('finish', () => {
        if (finished) return;
        finished = true;
        const duration = Date.now() - start;
        console.log(`[API] ${method} ${path} - Status: ${res.statusCode} - Duration: ${duration}ms - ID: ${correlationId} - COMPLETED`);
    });

    res.once('close', () => {
        if (finished) return;
        finished = true;
        const duration = Date.now() - start;
        console.log(`[API] ${method} ${path} - Status: ${res.statusCode} - Duration: ${duration}ms - ID: ${correlationId} - ABORTED_PREMATURELY`);
    });
}
