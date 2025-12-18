
import axios from 'axios';

const POLICY_SERVICE = 'http://localhost:3002';
const AUDIT_SERVICE = 'http://localhost:3001';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
    console.log("Waiting for services...");
    await sleep(5000); // Give time for startup

    console.log("\n--- TEST 1: Admin Access (Allow) ---");
    try {
        const res = await axios.post(`${POLICY_SERVICE}/authorize`, {
            tenant_id: "t1",
            actor: { actor_id: "admin1", roles: ["admin"], department_id: "d1", actor_type: "user" },
            action: "api.admin.users",
            resource: { type: "system", id: "users" },
            purpose: "verification",
            context: {}
        });
        console.log("Response:", res.data);
        if (res.data.allow === true) console.log("PASS");
        else console.log("FAIL: Expected allow=true");
    } catch (e: any) {
        console.log("FAIL: Exception", e.message);
    }

    console.log("\n--- TEST 2: Guest Access (Deny) ---");
    try {
        const res = await axios.post(`${POLICY_SERVICE}/authorize`, {
            tenant_id: "t1",
            actor: { actor_id: "guest1", roles: ["guest"], department_id: "d1", actor_type: "user" },
            action: "api.admin.users",
            resource: { type: "system", id: "users" },
            purpose: "malicious",
            context: {}
        });
        console.log("Response:", res.data);
        if (res.data.allow === false) console.log("PASS");
        else console.log("FAIL: Expected allow=false");
    } catch (e: any) {
        // Some might return 403, but my service returns 200 with allow:false usually, unless middleware handles it.
        // Direct call to policy-service returns the decision JSON (200 OK).
        // If it failed with 500, that's an error.
        console.log("FAIL: Exception", e.message);
    }

    console.log("\n--- TEST 3: Audit Log Check ---");
    try {
        const res = await axios.get(`${AUDIT_SERVICE}/audit/events?limit=5`);
        // console.log("Recent Events:", JSON.stringify(res.data, null, 2));
        const hasCheck = res.data.some((e: any) => e.event_type === 'AUTHZ_CHECK');
        const hasDecision = res.data.some((e: any) => e.event_type === 'AUTHZ_DECISION');

        if (hasCheck && hasDecision) console.log("PASS: Found AUTHZ_CHECK and AUTHZ_DECISION");
        else console.log(`FAIL: Missing events. Check: ${hasCheck}, Decision: ${hasDecision}`);
    } catch (e: any) {
        console.log("FAIL: Audit check exception", e.message);
    }
}

runTests();
