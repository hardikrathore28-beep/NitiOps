import KcAdminClient from '@keycloak/keycloak-admin-client';
import { logger } from '@nitiops/service-template';

const kcAdminClient = new KcAdminClient({
    baseUrl: process.env.KEYCLOAK_URL || 'http://keycloak:8080',
    realmName: 'master', // Must be master to create other realms
});

export const initKeycloak = async () => {
    try {
        await kcAdminClient.auth({
            grantType: 'password', // Use password grant for master admin
            clientId: 'admin-cli',
            username: process.env.KEYCLOAK_ADMIN || 'admin',
            password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
        });
        logger.info('Authenticated with Keycloak Admin API (Master)');
    } catch (error) {
        logger.error('Failed to authenticate with Keycloak', { error });
    }
};

export const createTenantRealm = async (slug: string, displayName: string) => {
    const realmName = `tenant-${slug}`;

    // 1. Check if Realm Exists
    let existingRealm;
    try {
        existingRealm = await kcAdminClient.realms.findOne({ realm: realmName });
    } catch (e: any) {
        logger.warn('Check realm existence failed', {
            status: e.response?.status,
            data: e.response?.data,
            message: e.message
        });
        if (e.response?.status !== 404) {
            throw e;
        }
    }

    if (!existingRealm) {
        try {
            await kcAdminClient.realms.create({
                realm: realmName,
                displayName: displayName || realmName,
                enabled: true,
                accessTokenLifespan: 300,
            });
            logger.info(`Created realm: ${realmName}`);
        } catch (error: any) {
            // Race condition handle
            if (error.response?.status !== 409) {
                throw error;
            }
            logger.warn(`Realm ${realmName} already exists (race condition)`);
        }
    } else {
        logger.info(`Realm ${realmName} already exists`);
    }

    // 2. Create Roles
    const roles = ['tenant_admin', 'officer', 'supervisor', 'auditor'];
    for (const role of roles) {
        try {
            const existingRole = await kcAdminClient.roles.findOneByName({ realm: realmName, name: role });
            if (!existingRole) {
                await kcAdminClient.roles.create({
                    realm: realmName,
                    name: role,
                });
            }
        } catch (error: any) {
            if (error.response?.status === 404) { // findOneByName might throw 404? No, returns null usually or throws
                await kcAdminClient.roles.create({ realm: realmName, name: role });
            } else if (error.response?.status !== 409) {
                // Ignore already exists
            }
        }
    }
    logger.info(`Verified roles for ${realmName}`);

    // 3. Create Clients
    // Admin Console (Public)
    const existingConsole = await kcAdminClient.clients.find({ realm: realmName, clientId: 'tenant-console' });
    if (existingConsole.length === 0) {
        try {
            await kcAdminClient.clients.create({
                realm: realmName,
                clientId: 'tenant-console',
                publicClient: true,
                directAccessGrantsEnabled: true,
                webOrigins: ['*'],
                redirectUris: ['*'],
            });
        } catch (e) { /* ignore c */ }
    }

    // Tenant Services (Confidential)
    const existingService = await kcAdminClient.clients.find({ realm: realmName, clientId: 'tenant-services' });
    if (existingService.length === 0) {
        try {
            await kcAdminClient.clients.create({
                realm: realmName,
                clientId: 'tenant-services',
                secret: 'tenant-services-secret',
                serviceAccountsEnabled: true,
                standardFlowEnabled: false,
                publicClient: false,
                protocolMappers: [
                    {
                        name: "realm roles",
                        protocol: "openid-connect",
                        protocolMapper: "oidc-usermodel-realm-role-mapper",
                        config: {
                            "claim.name": "realm_access.roles",
                            "jsonType.label": "String",
                            "multivalued": "true"
                        }
                    },
                    {
                        name: "department info",
                        protocol: "openid-connect",
                        protocolMapper: "oidc-usermodel-attribute-mapper",
                        config: {
                            "user.attribute": "department_id",
                            "claim.name": "department_id",
                            "jsonType.label": "String"
                        }
                    }
                ]
            });
        } catch (e) { /* ignore */ }
    }

    return {
        realmName,
        issuerUrl: `${kcAdminClient.baseUrl}/realms/${realmName}`,
        clients: {
            adminConsole: 'tenant-console',
            service: 'tenant-services'
        }
    };
};

export const createUserInRealm = async (realmName: string, user: { username: string, email: string, firstName?: string, lastName?: string, roles?: string[] }) => {
    const createdUser = await kcAdminClient.users.create({
        realm: realmName,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        enabled: true,
        credentials: [{
            type: 'password',
            value: 'password', // Default temporary password
            temporary: false // Changed to false to allow immediate login
        }],
        emailVerified: true, // Auto-verify email
        // requiredActions: ['UPDATE_PASSWORD']
    });

    if (user.roles && user.roles.length > 0) {
        // Fetch role objects
        // This effectively needs us to find the role representation first
        const performRoleMapping = async () => {
            // This part can be tricky with the admin client, we need to fetch role by name from the realm
            // then map it to the user.
            // implementation simplified for brevity
            for (const roleName of user.roles!) {
                const role = await kcAdminClient.roles.findOneByName({ realm: realmName, name: roleName });
                if (role && role.id && role.name && createdUser.id) {
                    await kcAdminClient.users.addRealmRoleMappings({
                        realm: realmName,
                        id: createdUser.id,
                        roles: [{ id: role.id, name: role.name! }]
                    });
                }
            }
        };
        await performRoleMapping();
    }


    // Fetch user to return full details
    const userRepresentation = await kcAdminClient.users.findOne({
        realm: realmName,
        id: createdUser.id
    });

    return userRepresentation || { id: createdUser.id, username: user.username, email: user.email };
}

export default kcAdminClient;
