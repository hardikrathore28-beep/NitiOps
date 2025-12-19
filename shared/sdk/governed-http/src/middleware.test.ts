import { Request, Response } from 'express';
import { governedRoute } from './middleware';
import { AuditClient } from './auditClient';
import { PolicyClient } from './policyClient';
import jwt from 'jsonwebtoken';

// Mocks
jest.mock('./auditClient');
jest.mock('./policyClient');
jest.mock('jwks-rsa', () => {
    return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => ({
            getSigningKey: (kid: any, cb: any) => cb(null, { getPublicKey: () => 'mock-public-key' })
        }))
    };
});
jest.mock('jsonwebtoken', () => ({
    decode: jest.fn(),
    verify: jest.fn()
}));

describe('governedRoute Middleware', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: jest.Mock;
    let json: jest.Mock;
    let status: jest.Mock;

    let finishCallback: (() => void) | null = null;
    let eventListeners: Record<string, Function> = {};

    beforeEach(() => {
        eventListeners = {};
        finishCallback = null;

        json = jest.fn().mockImplementation(function (this: any) {
            // Simulate headersSent if json is called
            if (res) res.headersSent = true;
            if (eventListeners['finish']) eventListeners['finish']();
        });
        status = jest.fn().mockReturnValue({ json });

        req = {
            headers: {},
            body: {}
        };

        res = {
            status,
            headersSent: false,
            on: jest.fn((event: string | symbol, cb) => {
                eventListeners[String(event)] = cb;
                return res as any;
            }),
            once: jest.fn((event: string | symbol, cb) => {
                eventListeners[String(event)] = cb;
                return res as any;
            }),
            removeListener: jest.fn((event: string | symbol, cb) => {
                if (eventListeners[String(event)] === cb) {
                    delete eventListeners[String(event)];
                }
                return res as any;
            }),
            statusCode: 200
        };

        next = jest.fn();
        jest.clearAllMocks();

        // Default mock implementations for async methods
        (AuditClient.emit as jest.Mock).mockResolvedValue(undefined);
        (PolicyClient.authorize as jest.Mock).mockResolvedValue({ allow: true, decision_id: 'default-allow' });
    });

    const mockAuthSuccess = () => {
        (jwt.decode as jest.Mock).mockReturnValue({
            payload: { iss: 'http://keycloak:8080/realms/tenant-demo' }
        });
        (jwt.verify as jest.Mock).mockImplementation((token, key, opts, cb) => {
            cb(null, {
                sub: 'user123', // actor_id
                realm_access: { roles: ['admin'] },
                department_id: 'IT'
            });
        });
        req.headers = { authorization: 'Bearer valid.token' };
    };

    it('should return 401 if missing JWT', async () => {
        const handler = governedRoute({
            action: 'test.action',
            resourceResolver: () => ({ type: 'test', id: '1' })
        }, jest.fn());

        await handler(req as Request, res as Response, next);

        expect(status).toHaveBeenCalledWith(401);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Authentication Required' }));
    });

    it('should return 400 if missing X-Purpose', async () => {
        mockAuthSuccess();
        const handler = governedRoute({
            action: 'test.action',
            resourceResolver: () => ({ type: 'test', id: '1' }),
            purposeRequired: true
        }, jest.fn());

        await handler(req as Request, res as Response, next);

        expect(status).toHaveBeenCalledWith(400);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Missing required header: X-Purpose' }));
    });

    it('should return 403 if Policy denies', async () => {
        mockAuthSuccess();
        // @ts-ignore
        req.headers['x-purpose'] = 'testing';
        (PolicyClient.authorize as jest.Mock).mockResolvedValue({
            allow: false,
            decision_id: 'dec-123',
            reasons: ['Not allowed']
        });

        const handler = governedRoute({
            action: 'test.action',
            resourceResolver: () => ({ type: 'test', id: '1' })
        }, jest.fn());

        await handler(req as Request, res as Response, next);

        expect(status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({ decision_id: 'dec-123' }));
    });

    it('should execute handler if Policy allows', async () => {
        mockAuthSuccess();
        // @ts-ignore
        req.headers['x-purpose'] = 'testing';
        (PolicyClient.authorize as jest.Mock).mockResolvedValue({
            allow: true,
            obligations: {}
        });

        const actualHandler = jest.fn().mockImplementation((req, res) => {
            res.status(200).json({ ok: true });
        });
        const handler = governedRoute({
            action: 'test.action',
            resourceResolver: () => ({ type: 'test', id: '1' })
        }, actualHandler);

        await handler(req as Request, res as Response, next);

        expect(actualHandler).toHaveBeenCalled();
    });

    it('should fail closed (503) if Policy Service is down for privileged route', async () => {
        mockAuthSuccess();
        // @ts-ignore
        req.headers['x-purpose'] = 'testing';
        (PolicyClient.authorize as jest.Mock).mockRejectedValue(new Error('Policy Down'));

        const handler = governedRoute({
            action: 'test.action',
            resourceResolver: () => ({ type: 'test', id: '1' }),
            privileged: true
        }, jest.fn());

        await handler(req as Request, res as Response, next);

        expect(status).toHaveBeenCalledWith(503);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Policy Service Unavailable (Fail Closed)' }));
    });
});
